import { clearLine, createInterface, cursorTo } from "node:readline";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { loadSettings, spriteSettings } from "./native-settings.ts";
import { BashSession, NativeWorld } from "./native-shell.ts";
import { playTurn, type Progress, type SpriteConfig, type SpriteHistory } from "./sprite.ts";
import { defaultSpriteOptions } from "./sprite-options.ts";
import { route } from "./world.ts";
import { messages } from "./en.ts";

const safeText = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu,"");
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
const colors = {prompt:32, sprite:36, error:31} as const;
function color(text: string, role: keyof typeof colors) {
  return process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb"
    ? `\x1b[${colors[role]}m${text}\x1b[0m` : text;
}
function print(text: string) {
  if (text) process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
}

async function consoleSession(root: string, dungeon: boolean, login: boolean) {
  const launcher = join(root,"bin/mudsh");
  const terminal = process.stdin.isTTY && process.stdout.isTTY
    ? new (await import("./native-terminal.ts")).TerminalBash(root,dungeon,login,launcher)
    : undefined;
  const bash = terminal ?? new BashSession(root,dungeon,launcher,login);
  const game = new NativeWorld(bash,dungeon);
  const history: SpriteHistory = [];
  const interrupt = () => {};
  process.on("SIGINT",interrupt);
  try {
    const start = await game.execute(":");
    if (game.ended) throw Error(`Bash exited during startup (exit ${start.exitCode}).`);
    let config: SpriteConfig | undefined = await loadSettings().catch(error => {
      print(color("Sprite offline. " + safeText(describe(error)),"error"));
      return undefined;
    });
    const spriteName = () => config?.options?.name ?? defaultSpriteOptions.name;
    const status = () => print(config ? `${color(spriteName(),"sprite")} is online (${config.options?.mode ?? "simple"}).` :
      "Sprite offline. Use help or !command.");
    status();
    if (dungeon) print(safeText(await game.run("look")));

    const editor = terminal ? new PassThrough() : undefined;
    const rl = createInterface({input:editor ?? process.stdin, output:process.stdout, terminal:!!terminal, historySize:500,
      completer: (line, callback) => {
        game.complete(line,!!config).then(([matches,prefix]) => {
          callback(null,[matches.filter(item => !/\p{Cc}/u.test(item)),prefix]);
        },error => callback(error));
      }});
    if (terminal) rl.on("SIGINT",() => {
      rl.write(null,{ctrl:true,name:"u"});
      print("^C");
      rl.prompt();
    });
    let exitStatus = 0;
    let editingBash = false;
    let handlingLine = false;
    let deferredInput: Buffer[] = [];
    const prompt = () => {
      if (!terminal) return;
      const location = safeText(game.title(game.cwd));
      rl.setPrompt(color(`mudsh [${location}] ❯`,"prompt") + " ");
      rl.prompt();
    };
    const feed = (chunk: Buffer) => {
      for (let index = 0; index < chunk.length; index++) {
        if (editingBash || terminal?.acceptsInput) {
          terminal!.write(chunk.subarray(index));
          return;
        }
        if (handlingLine) {
          deferredInput.push(chunk.subarray(index));
          return;
        }
        editor?.write(chunk.subarray(index,index + 1));
      }
    };
    const resume = () => {
      handlingLine = false;
      prompt();
      const chunks = deferredInput;
      deferredInput = [];
      for (const chunk of chunks) feed(chunk);
    };
    if (terminal && editor) {
      let background = "";
      terminal.onBackgroundOutput = data => {
        background += data;
        const end = background.lastIndexOf("\n");
        if (end < 0) return;
        cursorTo(process.stdout,0);
        clearLine(process.stdout,0);
        process.stdout.write(background.slice(0,end + 1));
        background = background.slice(end + 1);
        if (!handlingLine && !editingBash) rl.prompt(true);
      };
      rl.on("line",() => { handlingLine = true; });
      editor.on("keypress",(text: string) => {
        if ((text !== "!" && text !== "！") || !/^\s*[!！]$/u.test(rl.line)) return;
        rl.line = "";
        rl.cursor = 0;
        cursorTo(process.stdout,0);
        clearLine(process.stdout,0);
        editingBash = true;
        terminal.edit().then(result => {
          editingBash = false;
          game.updateShellState(result);
          exitStatus = result.exitCode;
          if (game.ended) rl.close();
          else {
            if (exitStatus) print(color(`Exit ${exitStatus}`,"error"));
            resume();
          }
        }, error => {
          editingBash = false;
          print(color(safeText(describe(error)),"error"));
          resume();
        });
      });
      process.stdin.setRawMode(true);
      process.stdin.on("data",feed);
      void terminal.wait().then(() => rl.close());
    }
    try {
      prompt();
      for await (const input of rl) {
        const line = input.trimStart();
        if (line.trim()) {
          try {
            const mode = route(line,!!config);
            if (/^\/sprite(?:\s|$)/u.test(line)) {
              switch (line.trim().split(/\s+/u).slice(1).join(" ")) {
                case "on": {
                  config = await loadSettings();
                  history.length = 0;
                  if (config) status();
                  else print("Run mudsh sprite setup first.");
                  break;
                }
                case "off": config = undefined; history.length = 0; status(); break;
                case "": case "status": status(); break;
                default: print("Use /sprite on, /sprite off, or /sprite status.");
              }
            } else if (mode === "shell") {
              const script = line.slice(1);
              if (!script.trim()) print(messages.emptyShell);
              else {
                const result = await game.execute(script,"manual");
                exitStatus = result.exitCode;
                if (!game.ended && exitStatus) print(color(`Exit ${exitStatus}`,"error"));
              }
            } else if (mode === "sprite" && config) {
              const speaker = color(safeText(spriteName()) + " ❯","sprite");
              const progress: Progress = (stage,text) => {
                if (stage === "executing") print(`${speaker} ${safeText(text ?? "")}`);
                if (stage === "output") print(safeText(text ?? ""));
              };
              try {
                const result = config.options?.mode === "advanced"
                  ? await (await import("./sprite-agent.ts")).playAdvancedTurn(game,line,config,progress,history)
                  : await playTurn(game,line,config,progress,history);
                const reply = safeText(result.output);
                print(`${speaker} ${result.offline ? color(reply,"error") : reply}`);
                if (result.offline) {
                  config = undefined;
                  history.length = 0;
                }
              } catch (error) {
                print(`${speaker} ${color(safeText(describe(error)),"error")}`);
              }
            } else {
              print(safeText(await game.run(line)));
            }
          } catch (error) {
            print(color(safeText(describe(error)),"error"));
          }
        }
        if (game.ended || bash.exitCode !== undefined) break;
        resume();
      }
    } finally {
      rl.close();
      if (terminal) {
        process.stdin.off("data",feed);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        editor?.destroy();
      }
    }
    return bash.exitCode ?? (!terminal ? exitStatus : 0);
  } finally {
    await bash.close();
    process.off("SIGINT",interrupt);
  }
}

const [root,mode,...args] = process.argv.slice(2);
try {
  if (mode === "settings") await spriteSettings(args);
  else process.exitCode = await consoleSession(root,mode === "dungeon",mode === "login");
} catch (error) {
  process.stderr.write(safeText(describe(error)) + "\n");
  process.exitCode = 1;
}
