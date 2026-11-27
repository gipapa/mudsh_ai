import { help, messages, sceneForSeed } from "./en.ts";
import { assignDirections, directoryName, formatSurvey, hash } from "./room-survey.ts";

export const startPath = "/expedition";
export interface Entry { name: string; directory: boolean }
export interface WorldIO {
  list(path: string): Promise<Entry[]>;
  read(path: string): Promise<string>;
  shell(script: string, cwd: string): Promise<{stdout: string; stderr: string; cwd: string; exitCode: number}>;
  resolve(cwd: string, path: string): string;
}
export function initialFiles(seed: number) {
  const scene = sceneForSeed(seed);
  if (scene.chest) {
    const {fieldNote, clues, path, locked} = scene.chest;
    const code = chestCode(seed);
    return {
      [startPath + "/field-note.txt"]: fieldNote,
      [startPath + "/" + path]: locked,
      ...Object.fromEntries(clues.map((clue, i) =>
        [startPath + "/" + clue.path, clue.text(code.slice(i * 2, i * 2 + 2))])),
    };
  }
  const files: Record<string, string> = {};
  files[startPath + "/field-note.txt"] = "Find the sealed letter in " + scene.folders[0] + ".\n";
  for (const [i, name] of scene.folders.entries()) {
    const path = startPath + "/" + name;
    files[path + (i === 0 ? "/letter.txt" : "/inscription.txt")] =
      i === 0 ? scene.letter : "A small star marks the way back to " + scene.entry + ".\n";
  }
  return files;
}
export function chestCode(seed: number) {
  return String(hash("chest:" + seed) % 10000).padStart(4, "0");
}
export function route(line: string, online: boolean) {
  if (/^[!！]/u.test(line.trimStart())) return "shell";
  return online ? "sprite" : "mud";
}
export class Expedition {
  io: WorldIO;
  seed: number;
  cwd = startPath;
  ended = false;
  objectiveComplete = false;
  history: string[] = [];
  assignments = new Map<string, Map<string, string>>();
  constructor(io: WorldIO, seed: number) { this.io = io; this.seed = seed; }
  get scene() { return sceneForSeed(this.seed); }
  location(path: string) {
    const name = path.slice(startPath.length + 1);
    const locations = this.scene.locations;
    if (path.startsWith(startPath + "/") && locations && Object.hasOwn(locations, name)) return locations[name];
  }
  title(path: string) {
    if (path === startPath) return this.scene.entry;
    return this.location(path)?.title ?? this.scene.rooms[hash(this.seed + path) % this.scene.rooms.length];
  }
  description(path: string) {
    return path === startPath ? this.scene.description : this.location(path)?.description ?? this.scene.interior;
  }
  get previousCwd() { return this.history.at(-1); }
  async survey(cwd = this.cwd) {
    const entries = (await this.io.list(cwd)).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const dirs = entries.filter(e => e.directory).map(e => e.name);
    const assigned = this.assignments.get(cwd) ?? new Map<string, string>();
    this.assignments.set(cwd, assigned);
    const exits = assignDirections(dirs, this.seed + cwd, assigned);
    const previous = cwd === this.cwd ? this.previousCwd : this.cwd;
    return {cwd, title: this.title(cwd),
      description: this.description(cwd),
      exits: exits.map(exit => ({...exit, title: this.title(this.io.resolve(cwd, exit.name))})),
      back: previous === undefined ? undefined : directoryName(previous),
      files: entries.filter(e => !e.directory).map(e => e.name)};
  }
  async look(cwd = this.cwd) { return formatSurvey(await this.survey(cwd)); }
  move(path: string) {
    if (path !== this.cwd) { this.history.push(this.cwd); this.cwd = path; }
  }
  async runShell(script: string) {
    const result = await this.io.shell(script, this.cwd);
    this.move(result.cwd);
    return result.stdout + result.stderr || (result.exitCode ? "Exit " + result.exitCode : "");
  }
  async back() {
    const previous = this.previousCwd;
    if (!previous) return messages.noBack;
    await this.io.list(previous);
    this.history.pop(); this.cwd = previous;
    return this.look();
  }
  async run(input: string): Promise<string> {
    if (this.ended) return messages.closed;
    const line = input.trim();
    if (route(line, false) === "shell") {
      if (!line.slice(1).trim()) return messages.emptyShell;
      return this.runShell(line.slice(1));
    }
    const [,verb,arg = ""] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(line) ?? [];
    switch (verb?.toLowerCase()) {
      case "help": return [...help, ...(this.scene.chest ? [messages.unlockHelp] : [])].join("\n");
      case "quit": this.ended = true; return messages.quit;
      case "back": return this.back();
      case "read": return arg ? this.io.read(this.io.resolve(this.cwd, arg)) : messages.missingFile;
      case "unlock": {
        if (!this.scene.chest) return messages.noChest;
        if (!/^[0-9]{4}$/.test(arg)) return messages.unlockUsage;
        return this.runShell("unlock " + arg);
      }
      case "go": {
        if (arg.toLowerCase() === "back") return this.back();
        const {exits} = await this.survey();
        const exit = exits.find(e => e.name === arg) ?? exits.find(e => e.direction === arg.toLowerCase());
        if (!exit) return messages.missingExit;
        this.move(this.io.resolve(this.cwd, exit.name));
        return this.look();
      }
      case "look": return this.look();
      default: return messages.unknown;
    }
  }
}
export type Room = Awaited<ReturnType<Expedition["survey"]>>;
