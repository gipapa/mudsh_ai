import { Bash, defineCommand, type InitialFiles } from "just-bash/browser";
import { messages, sceneForSeed } from "./en.ts";
import { chestCode, Expedition, initialFiles, startPath } from "./world.ts";
import { campaignRooms, lastOpenRoom, roomFiles, type CampaignSave } from "./campaign.ts";
import { gpsCoordinates } from "./campaign-artifacts.ts";
import { Dungeon } from "./campaign-world.ts";
import { webTar } from "./web-archive.ts";

const commands = ["ls","cat","pwd","mkdir","touch","echo","printf","cp","mv","rm","rmdir",
  "head","tail","wc","sort","uniq","grep","find","date","tr","seq"] as const;

function openBash(files: InitialFiles, customCommands: ReturnType<typeof defineCommand>[], campaign = false) {
  return new Bash({files, cwd:startPath, env:{HOME:startPath}, customCommands,
    commands:[...commands, ...(campaign ? ["file","md5sum","strings","base64"] as const : [])],
    executionLimits:{maxCommandCount:1000,maxLoopIterations:1000,maxExecutionTimeMs:3500,
      maxOutputSize:65536,maxSourceBytes:8192,maxStringLength:262144,maxLiveBytes:8388608}});
}

function worldIO(bash: Bash) {
  const fs = bash.fs;
  return {
    resolve:(cwd: string,path: string) => fs.resolvePath(cwd,path),
    read:(path: string) => fs.readFile(path),
    async list(path: string) {
      return Promise.all((await fs.readdir(path)).map(async name => {
        const stat = await fs.stat(fs.resolvePath(path,name)).catch(() => null);
        return {name,directory:!!stat?.isDirectory};
      }));
    },
    async shell(script: string,cwd: string) {
      const result = await bash.exec(script,{cwd,rawScript:true});
      if (!("cwd" in result) || typeof result.cwd !== "string") throw Error("Missing interpreter cwd");
      return {...result,cwd:result.cwd};
    },
  };
}

export function createSession(seed: number) {
  const {chest, letter} = sceneForSeed(seed);
  const customCommands = chest ? [defineCommand("unlock", async (args, {cwd, fs}) => {
    const path = startPath + "/" + chest.path;
    const error = (message: string) => ({stdout:"", stderr:message + "\n", exitCode:1});
    const stat = cwd === path.slice(0, path.lastIndexOf("/")) ? await fs.stat(path).catch(() => undefined) : undefined;
    if (!stat?.isFile) return error(messages.noChest);
    if (args.length !== 1 || !/^[0-9]{4}$/.test(args[0])) return error(messages.unlockUsage);
    if (args[0] !== chestCode(seed)) return error(messages.wrongCode);
    await fs.writeFile(path, chest.opened);
    game.objectiveComplete = true;
    return {stdout:chest.opened, stderr:"", exitCode:0};
  })] : [];
  const bash = openBash(initialFiles(seed), customCommands);
  const fs = bash.fs;
  const game = new Expedition(worldIO(bash),seed);
  if (letter) {
    const objectiveLetter = new TextEncoder().encode(letter);
    // MUD reads and shell utilities both fetch file contents through this method.
    const readFileBuffer = fs.readFileBuffer.bind(fs);
    fs.readFileBuffer = async path => {
      const contents = await readFileBuffer(path);
      if (!game.objectiveComplete && contents.length === objectiveLetter.length &&
          contents.every((byte, index) => byte === objectiveLetter[index])) game.objectiveComplete = true;
      return contents;
    };
  }
  return game;
}

const gpsTags = ["GPSLatitude", "GPSLongitude"];
const exiftool = defineCommand("exiftool", async (args, {cwd, fs}) => {
  const paths = args.filter(arg => !arg.startsWith("-"));
  const options = args.filter(arg => arg.startsWith("-"));
  const error = (stderr: string) => ({stdout:"", stderr:stderr + "\n", exitCode:1});
  if (paths.length !== 1 || options.some(arg => arg !== "-n" && arg !== "-GPSPosition" && !gpsTags.includes(arg.slice(1)))) {
    return error("Web usage: exiftool [-n] [-GPSLatitude] [-GPSLongitude] [-GPSPosition] JPEG");
  }
  const file = fs.resolvePath(cwd, paths[0]);
  try {
    const stat = await fs.stat(file);
    if (stat.size > 1048576) return error("This JPEG exceeds the web metadata limit.");
    const gps = gpsCoordinates(await fs.readFileBuffer(file));
    if (!gps) return error("No GPS metadata found.");
    const tags = options.filter(arg => arg !== "-n");
    const items = (tags.length ? tags.map(tag => tag.slice(1)) : gpsTags).map(tag => {
      if (tag === "GPSPosition") return "GPS Position: " + gps.join(", ");
      const i = gpsTags.indexOf(tag);
      return (i === 0 ? "GPS Latitude: " : "GPS Longitude: ") + gps[i];
    });
    return {stdout:items.join("\n") + "\n", stderr:"", exitCode:0};
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : String(cause));
  }
});

export async function createDungeon(save: CampaignSave) {
  const bash = openBash({}, [defineCommand("mudsh", async ([verb, ...args], {cwd}) => {
    const result = await game.control(verb, args.join(" "), cwd);
    return {stdout:result.code ? "" : result.text + "\n", stderr:result.code ? result.text + "\n" : "",
      exitCode:result.code};
  }), exiftool, webTar], true);
  const fs = bash.fs;
  await fs.mkdir(startPath, {recursive:true});
  const prepare = async (index: number) => {
    const base = startPath + "/" + campaignRooms[index].id;
    for (const [name, content] of Object.entries(roomFiles(save.seed, index))) {
      const path = base + "/" + name;
      await fs.mkdir(path.slice(0, path.lastIndexOf("/")), {recursive:true});
      await fs.writeFile(path, content);
    }
  };
  const io = worldIO(bash);
  const game = new Dungeon({
    ...io,
    async read(path) {
      const stat = await fs.stat(path);
      if (stat.size > 65536) return "Use a shell tool such as head or grep to inspect this large object.";
      const contents = await io.read(path);
      return contents.includes("\0") ? "Use a shell tool such as file, strings or exiftool to inspect this object." : contents;
    },
    async list(path) {
      return (await io.list(path)).filter(entry => !entry.name.startsWith(".") &&
        (path !== startPath || !campaignRooms.slice(lastOpenRoom(game.save) + 1).some(room => room.id === entry.name)));
    },
  },save,prepare);
  for (let index = 0; index <= lastOpenRoom(save); index++) await prepare(index);
  return game;
}
