import { createInterface } from "node:readline";
import { join } from "node:path";
import { loadSettings, spriteSettings } from "./native-settings.ts";
import { BashSession, NativeWorld } from "./native-shell.ts";
import { playTurn, type Progress, type SpriteConfig, type SpriteHistory } from "./sprite.ts";
import { defaultSpriteOptions } from "./sprite-options.ts";
import { route } from "./world.ts";
import { messages } from "./en.ts";

const safeText = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu,"");
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
function print(text: string) {
  if (text) process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
}

async function consoleSession(root: string, dungeon: boolean) {
  const launcher = join(root,"bin/mudsh");
  const bash = new BashSession(root,dungeon,launcher);
  const game = new NativeWorld(bash,dungeon);
  const history: SpriteHistory = [];
  const terminal = !!(process.stdin.isTTY && process.stdout.isTTY);
  // The foreground Bash command receives SIGINT from the terminal as well.
  const interrupt = () => {};
  process.on("SIGINT",interrupt);
  try {
    const start = await game.execute(":");
    if (game.ended) throw Error(`Bash exited during startup (exit ${start.exitCode}).`);
    let config: SpriteConfig | undefined = await loadSettings().catch(error => {
      print("Sprite offline. " + safeText(describe(error)));
      return undefined;
    });
    const spriteName = () => config?.options?.name ?? defaultSpriteOptions.name;
    const status = () => print(config ? `${spriteName()} is online (${config.options?.mode ?? "simple"}).` :
      "Sprite offline. Use help or !command.");
    status();
    if (dungeon) print(safeText(await game.run("look")));

    const rl = createInterface({input:process.stdin, output:process.stdout, terminal, historySize:500});
    if (terminal) rl.on("SIGINT",() => {
      rl.write(null,{ctrl:true,name:"u"});
      print("^C");
      rl.prompt();
    });
    let exitStatus = 0;
    try {
      const prompt = () => {
        if (!terminal) return;
        const location = safeText(game.title(game.cwd));
        rl.setPrompt(`mudsh [${location}] ❯ `);
        rl.prompt();
      };
      prompt();
      for await (const input of rl) {
        const line = input.trimStart();
        if (line.trim()) {
          if (terminal) {
            rl.pause();
            process.stdin.setRawMode(false);
          }
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
                if (!game.ended && exitStatus) print(`Exit ${exitStatus}`);
              }
            } else if (mode === "sprite" && config) {
              const name = safeText(spriteName());
              const progress: Progress = (stage,text) => {
                if (stage === "executing") print(`${name} ❯ ${safeText(text ?? "")}`);
                if (stage === "output") print(safeText(text ?? ""));
              };
              try {
                const result = config.options?.mode === "advanced"
                  ? await (await import("./sprite-agent.ts")).playAdvancedTurn(game,line,config,progress,history)
                  : await playTurn(game,line,config,progress,history);
                print(`${name} ❯ ${safeText(result.output)}`);
                if (result.offline) {
                  config = undefined;
                  history.length = 0;
                }
              } catch (error) {
                print(`${name} ❯ ${safeText(describe(error))}`);
              }
            } else {
              print(safeText(await game.run(line)));
            }
          } catch (error) {
            print(safeText(describe(error)));
          }
        }
        if (game.ended || bash.exitCode !== undefined) break;
        if (terminal) {
          process.stdin.setRawMode(true);
          rl.resume();
        }
        prompt();
      }
    } finally {
      rl.close();
      if (terminal) process.stdin.setRawMode(false);
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
  else process.exitCode = await consoleSession(root,mode === "dungeon");
} catch (error) {
  process.stderr.write(safeText(describe(error)) + "\n");
  process.exitCode = 1;
}
