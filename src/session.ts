import { Bash, defineCommand } from "just-bash/browser";
import { messages, sceneForSeed } from "./en.ts";
import { chestCode, Expedition, initialFiles, startPath } from "./world.ts";

export function createSession(seed: number) {
  const chest = sceneForSeed(seed).chest;
  const customCommands = chest ? [defineCommand("unlock", async (args, {cwd, fs}) => {
    const path = startPath + "/" + chest.path;
    const error = (message: string) => ({stdout:"", stderr:message + "\n", exitCode:1});
    const stat = cwd === path.slice(0, path.lastIndexOf("/")) ? await fs.stat(path).catch(() => undefined) : undefined;
    if (!stat?.isFile) return error(messages.noChest);
    if (args.length !== 1 || !/^[0-9]{4}$/.test(args[0])) return error(messages.unlockUsage);
    if (args[0] !== chestCode(seed)) return error(messages.wrongCode);
    await fs.writeFile(path, chest.opened);
    return {stdout:chest.opened, stderr:"", exitCode:0};
  })] : [];
  const bash = new Bash({files: initialFiles(seed), cwd:startPath, env:{HOME:startPath},
    customCommands,
    commands:["ls","cat","pwd","mkdir","touch","echo","printf","cp","mv","rm","rmdir","head","tail","wc","sort","uniq","grep","find","date","tr","seq"],
    executionLimits:{maxCommandCount:1000,maxLoopIterations:1000,maxExecutionTimeMs:3500,
      maxOutputSize:65536,maxSourceBytes:8192,maxStringLength:262144,maxLiveBytes:8388608}});
  const fs = bash.fs;
  return new Expedition({
    resolve:(cwd,path) => fs.resolvePath(cwd,path),
    read:path => fs.readFile(path),
    async list(path) {
      return Promise.all((await fs.readdir(path)).map(async name => {
        const stat = await fs.stat(fs.resolvePath(path,name)).catch(() => null);
        return {name,directory:!!stat?.isDirectory};
      }));
    },
    async shell(script,cwd) {
      const result = await bash.exec(script,{cwd,rawScript:true});
      if (!("cwd" in result) || typeof result.cwd !== "string") throw Error("Missing interpreter cwd");
      return {...result,cwd:result.cwd};
    }
  },seed);
}
