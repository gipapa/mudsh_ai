import { randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { campaignName, campaignRooms, gradeRoom, lastOpenRoom, roomFiles, roomIndex, validSave, type CampaignSave } from "./campaign.ts";
import { messages } from "./en.ts";
import { assignDirections, directoryName, formatSurvey } from "./room-survey.ts";
import { terminalWorldText } from "./terminal-text.ts";

const directory = process.env.MUDSH_GAME_ROOT || "/expedition";
const root = await realpath(directory);
const savePath = join(root, ".mudsh-save.json");
const bashHelp = [
  "look                    Inspect the room, exits and objects",
  "go DIRECTORY            Enter an exit by name or direction",
  "back / go back          Return to the previous room",
  "mudsh hint              Ask for a shell hint",
  "mudsh submit ANSWER     Submit a flag, filename or number",
  "mudsh check             Verify a room that asks you to create a file",
  "mudsh next              Enter the next unlocked room",
  "mudsh resume            Return to the current unlocked room",
  "mudsh progress          Show cleared rooms",
  "mudsh help              Open this field guide",
  "exit                    Leave the dungeon",
].join("\n");

function error(message: string) {
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}

async function store(save: CampaignSave) {
  const temporary = join(root, `.save-${randomUUID()}`);
  await writeFile(temporary, JSON.stringify(save) + "\n", {flag:"wx", mode:0o600});
  try {
    await rename(temporary, savePath);
  } finally {
    await rm(temporary, {force:true});
  }
}

async function prepare(save: CampaignSave, index: number) {
  const path = join(root, campaignRooms[index].id);
  const existing = await lstat(path).catch(cause => {
    if (cause.code !== "ENOENT") throw cause;
  });
  if (existing) {
    if (!existing.isDirectory()) throw Error(`Move ${path} aside and try again.`);
    return path;
  }

  const temporary = await mkdtemp(join(root, ".room-"));
  try {
    for (const [name, content] of Object.entries(roomFiles(save.seed, index))) {
      const file = join(temporary, name);
      await mkdir(dirname(file), {recursive:true});
      await writeFile(file, content);
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, {recursive:true, force:true});
  }
  return path;
}

async function load() {
  const raw = await readFile(savePath, "utf8").catch(cause => {
    if (cause.code !== "ENOENT") throw cause;
  });
  if (raw !== undefined) {
    const saved: unknown = JSON.parse(raw);
    if (!validSave(saved)) throw Error("The dungeon save is invalid.");
    return saved;
  }
  const save: CampaignSave = {seed:randomBytes(4).readUInt32LE(), completed:0};
  await prepare(save, 0);
  await store(save);
  return save;
}

async function entriesAt(path: string) {
  const entries = (await readdir(path, {withFileTypes:true})).filter(entry => !entry.name.startsWith("."));
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return Promise.all(entries.map(async entry => ({
    name: entry.name,
    directory: entry.isDirectory() || (entry.isSymbolicLink() &&
      !!(await stat(join(path, entry.name)).catch(() => undefined))?.isDirectory()),
  })));
}

async function main(command: string, args: string[]) {
  if (command === "help") {
    console.log(terminalWorldText(bashHelp, true));
    return;
  }
  const save = await load();
  const max = lastOpenRoom(save);
  const cwd = await realpath(process.cwd());
  const index = roomIndex(root, cwd);
  const room = campaignRooms[index];
  if (command === "resume") {
    console.log(await prepare(save, max));
    return;
  }
  if (command === "progress") {
    console.log(`${campaignName} · ${save.completed}/${campaignRooms.length} rooms cleared.`);
    for (const [i, item] of campaignRooms.slice(0, max + 1).entries()) {
      console.log(`${i < save.completed ? "Cleared" : "Open"} · ${item.title} [${item.id}]`);
    }
    return;
  }
  if (command === "look" || command === "exit") {
    if (index > max) return error("Enter an unlocked room first. Use mudsh resume to find it.");
    const entries = await entriesAt(cwd);
    const exits = assignDirections(entries.filter(e => e.directory).map(e => e.name), 1 + cwd);
    if (command === "exit") {
      const exit = exits.find(e => e.direction === args[0]?.toLowerCase());
      if (!exit) return error(messages.missingExit);
      console.log(join(cwd, exit.name));
      return;
    }
    const [previous] = args;
    const canBack = previous && previous !== cwd && (await stat(previous).catch(() => undefined))?.isDirectory();
    const title = room && cwd === join(root, room.id) ? room.title : cwd === root ? campaignName : directoryName(cwd);
    const description = room ? room.description + "\n" + room.task : "Use mudsh resume to return to the current room.";
    console.log(terminalWorldText(formatSurvey({title, description, exits,
      back: canBack ? directoryName(previous) : undefined, files: entries.filter(e => !e.directory).map(e => e.name)})));
    return;
  }
  if (!room || index > max) return error("Enter an unlocked room first. Use mudsh resume to find it.");

  switch (command) {
    case "hint": console.log(terminalWorldText(room.hint)); return;
    case "next":
      if (index >= save.completed) return error("Solve this room to open the next door.");
      if (index + 1 >= campaignRooms.length) return error("The last room is complete.");
      console.log(await prepare(save, index + 1));
      return;
    case "submit":
    case "check": {
      const result = await gradeRoom(save, index, command, args.join(" "), async name => {
        const path = join(root, room.id, name);
        const stat = await lstat(path).catch(cause => {
          if (cause.code !== "ENOENT") throw cause;
        });
        if (!stat?.isFile() || stat.size > 65536) return;
        return readFile(path, "utf8");
      });
      if (!result.next) return error(result.error);
      if (result.next.completed < campaignRooms.length) await prepare(result.next, result.next.completed);
      await store(result.next);
      console.log(messages.objectiveComplete + "\n" + result.ending);
      console.log(result.next.completed === campaignRooms.length
        ? "All rooms cleared." : "Use mudsh next to enter the next room.");
      return;
    }
    default: error("Use mudsh look, hint, submit ANSWER, check, next, resume, or progress.");
  }
}

try {
  await main(process.argv[2], process.argv.slice(3));
} catch (cause) {
  error(cause instanceof Error ? cause.message : String(cause));
}
