import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { spawn, type IPty } from "node-pty";
import type { ShellMode, ShellResult, ShellSession } from "./native-shell.ts";

type Pending = {
  mode: ShellMode | "edit";
  resolve: (result: ShellResult) => void;
  reject: (error: Error) => void;
  result?: Omit<ShellResult, "cwd">;
};

const fieldCounts: Record<string, number> = { prompt:2, display:0, start:0, result:3 };
// An injected request must be a single line of printable Readline input.
const quoteScript = (script: string) => "$'" + Buffer.from(script).toString("hex").replace(/../g, "\\x$&") + "'";

export class TerminalBash implements ShellSession {
  private readonly pty: IPty;
  private readonly marker: string;
  private readonly finished: Promise<number>;
  private readonly ready: Promise<void>;
  private pending?: Pending;
  private cwd = process.cwd();
  private buffer = "";
  private packet = false;
  private showing = false;
  private initialized = false;
  private promptStatus?: number;
  private bracketedPaste = false;
  private outputAtLineStart = true;
  onBackgroundOutput?: (data: string) => void;
  exitCode?: number;

  constructor(root: string, dungeon: boolean, login: boolean, launcher: string) {
    const token = randomBytes(16).toString("hex");
    this.marker = "\x1e" + token + "\x1f";
    const rc = join(root,"native/terminal.bash");
    const env: NodeJS.ProcessEnv = {...process.env, BASH_SILENCE_DEPRECATION_WARNING:"1", MUDSH_TERMINAL_TOKEN:token,
      MUDSH_TERMINAL_RC:join(root,"native/shell.bash")};
    if (login) {
      env.MUDSH_TERMINAL_INIT = rc;
      env.PROMPT_COMMAND = 'unset PROMPT_COMMAND; . "$MUDSH_TERMINAL_INIT"; _mudsh_prompt "$?"';
    }
    const args = dungeon ? ["play","--terminal",token] :
      login ? ["--noprofile","--login","-i"] : ["--rcfile",rc,"-i"];
    this.pty = spawn(dungeon ? launcher : "/bin/bash", args, {
      cwd:process.cwd(), env, cols:process.stdout.columns, rows:process.stdout.rows,
    });
    let resolveReady: () => void;
    this.ready = new Promise(resolve => { resolveReady = resolve; });
    this.pty.onData(data => {
      this.receive(data);
      if (this.initialized) resolveReady();
    });
    this.finished = new Promise(resolve => {
      this.pty.onExit(({exitCode,signal}) => {
        process.stdout.off("resize",this.resize);
        this.exitCode = signal ? 128 + signal : exitCode;
        this.display(this.buffer);
        this.pending?.resolve({cwd:this.cwd, exitCode:this.exitCode, stdout:"", stderr:""});
        this.pending = undefined;
        resolveReady();
        resolve(this.exitCode);
      });
    });
    process.stdout.on("resize",this.resize);
  }

  private resize = () => {
    if (process.stdout.columns && process.stdout.rows)
      this.pty.resize(process.stdout.columns,process.stdout.rows);
  };

  private display(data: string) {
    if (!data) return;
    if (this.promptStatus !== undefined) {
      if (data.includes("\x1b[?2004h")) this.bracketedPaste = true;
    } else if (this.showing || !this.initialized) {
      process.stdout.write(data);
      this.outputAtLineStart = data.endsWith("\n");
    } else if (!this.pending) {
      this.onBackgroundOutput?.(data);
    }
  }

  private receive(data: string) {
    this.buffer += data;
    while (this.buffer) {
      if (!this.packet) {
        const at = this.buffer.indexOf(this.marker);
        if (at < 0) {
          // Keep a partial marker when the PTY splits it across reads.
          let end = this.buffer.length;
          const last = this.buffer.lastIndexOf(this.marker[0]);
          if (last >= 0 && this.marker.startsWith(this.buffer.slice(last))) end = last;
          this.display(this.buffer.slice(0,end));
          this.buffer = this.buffer.slice(end);
          return;
        }
        this.display(this.buffer.slice(0,at));
        this.buffer = this.buffer.slice(at + this.marker.length);
        this.packet = true;
      }
      const fieldEnd = this.buffer.indexOf("\x1c");
      if (fieldEnd < 0) return;
      const type = this.buffer.slice(0,fieldEnd);
      const count = fieldCounts[type];
      if (count === undefined) {
        this.packet = false;
        continue;
      }
      const fields: string[] = [];
      let offset = fieldEnd + 1;
      for (let i = 0; i < count; i++) {
        const end = this.buffer.indexOf("\0",offset);
        if (end < 0) {
          if (this.buffer.length > 800000) {
            this.pending?.reject(Error("Bash sent an oversized response."));
            this.pty.kill();
          }
          return;
        }
        fields.push(this.buffer.slice(offset,end));
        offset = end + 1;
      }
      this.buffer = this.buffer.slice(offset);
      this.packet = false;
      this.handlePacket(type,fields);
    }
  }

  private handlePacket(type: string, fields: string[]) {
    const pending = this.pending;
    if (type === "start") {
      this.showing = pending?.mode === "manual";
    } else if (type === "result") {
      if (pending) pending.result = {exitCode:Number(fields[0]), stdout:Buffer.from(fields[1],"base64").toString(),
        stderr:Buffer.from(fields[2],"base64").toString()};
    } else if (type === "prompt") {
      // Wait for Readline to render PS1 before returning control to the MUD editor.
      this.promptStatus = Number(fields[0]);
      this.bracketedPaste = false;
      this.cwd = Buffer.from(fields[1],"base64").toString();
    } else if (this.promptStatus !== undefined) {
      const exitCode = this.promptStatus;
      this.promptStatus = undefined;
      this.initialized = true;
      if (this.showing && !this.outputAtLineStart) process.stdout.write("\n");
      this.showing = false;
      this.pending = undefined;
      pending?.resolve({cwd:this.cwd, ...(pending.result ?? {exitCode, stdout:"", stderr:""})});
    }
  }

  private request(mode: Pending["mode"], input: string) {
    if (this.exitCode !== undefined) throw Error("The Bash session has closed.");
    if (this.pending) throw Error("Bash is already running a command.");
    return new Promise<ShellResult>((resolve,reject) => {
      this.pending = {mode,resolve,reject};
      if (input) this.pty.write(input);
    });
  }

  async run(script: string, mode: ShellMode) {
    if (script.includes("\0")) throw Error("A Bash script cannot contain a NUL byte.");
    const timer = mode === "manual" ? undefined : setTimeout(() => {
      this.pending?.reject(Error("The Bash command timed out. The shell session closed."));
      this.pty.kill();
    },120000);
    try {
      await this.ready;
      const evaluate = `(builtin exit "$_mudsh_status"); builtin eval -- ${quoteScript(script)}`;
      const command = mode === "manual" ? evaluate :
        evaluate + ' </dev/null >"$_mudsh_capture/out" 2>"$_mudsh_capture/err"; ' +
        `_mudsh_terminal_finish ${mode} "$?"`;
      // Evaluate at the interactive top level so declarations, aliases and jobs persist.
      return await this.request(mode,` _mudsh_terminal_start ${mode} && { ${command}; }\n`);
    } finally {
      clearTimeout(timer);
    }
  }

  edit() {
    process.stdout.write((this.bracketedPaste ? "\x1b[?2004h" : "") + "! ");
    this.showing = true;
    return this.request("edit","");
  }

  write(data: Buffer) { this.pty.write(data); }

  get acceptsInput() { return this.showing && this.pending?.mode === "manual"; }

  wait() { return this.finished; }

  async close() {
    if (this.exitCode === undefined && this.initialized && !this.pending)
      await this.run("builtin exit","manual");
    if (this.exitCode === undefined) this.pty.kill("SIGHUP");
    return this.finished;
  }
}
