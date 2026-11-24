import { directions, help, messages, scenes } from "./en.ts";

export const startPath = "/expedition";
export interface Entry { name: string; directory: boolean }
export interface WorldIO {
  list(path: string): Promise<Entry[]>;
  read(path: string): Promise<string>;
  shell(script: string, cwd: string): Promise<{stdout: string; stderr: string; cwd: string; exitCode: number}>;
  resolve(cwd: string, path: string): string;
}
function hash(text: string) {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function initialFiles(seed: number) {
  const scene = scenes[seed % scenes.length];
  const files: Record<string, string> = {};
  files[startPath + "/field-note.txt"] = "Find the sealed letter in " + scene.folders[0] + ".\n";
  for (const [i, name] of scene.folders.entries()) {
    const path = startPath + "/" + name;
    files[path + (i === 0 ? "/letter.txt" : "/inscription.txt")] =
      i === 0 ? scene.letter : "A small star marks the way back to " + scene.entry + ".\n";
  }
  return files;
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
  history: string[] = [];
  assignments = new Map<string, Map<string, string>>();
  constructor(io: WorldIO, seed: number) { this.io = io; this.seed = seed; }
  get scene() { return scenes[this.seed % scenes.length]; }
  title(path: string) {
    return path === startPath ? this.scene.entry : this.scene.rooms[hash(this.seed + path) % this.scene.rooms.length];
  }
  async survey() {
    const entries = (await this.io.list(this.cwd)).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const dirs = entries.filter(e => e.directory);
    const assigned = this.assignments.get(this.cwd) ?? new Map<string, string>();
    this.assignments.set(this.cwd, assigned);
    for (const old of assigned.keys()) if (!dirs.some(d => d.name === old)) assigned.delete(old);
    for (const {name} of dirs) {
      if (assigned.has(name)) continue;
      const free = directions.filter(d => ![...assigned.values()].includes(d));
      if (free.length) assigned.set(name, free[hash(this.seed + this.cwd + name) % free.length]);
    }
    return {cwd: this.cwd, title: this.title(this.cwd),
      description: this.cwd === startPath ? this.scene.description : this.scene.interior,
      exits: dirs.map(({name}) => ({name, direction: assigned.get(name) ?? "", title: this.title(this.io.resolve(this.cwd, name))})),
      files: entries.filter(e => !e.directory).map(e => e.name)};
  }
  move(path: string) {
    if (path !== this.cwd) { this.history.push(this.cwd); this.cwd = path; }
  }
  async run(input: string): Promise<string> {
    if (this.ended) return messages.closed;
    const line = input.trim();
    if (route(line, false) === "shell") {
      if (!line.slice(1).trim()) return messages.emptyShell;
      const result = await this.io.shell(line.slice(1), this.cwd);
      this.move(result.cwd);
      return result.stdout + result.stderr || (result.exitCode ? "Exit " + result.exitCode : "");
    }
    const [,verb,arg = ""] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(line) ?? [];
    switch (verb?.toLowerCase()) {
      case "help": return help;
      case "quit": this.ended = true; return messages.quit;
      case "back": {
        const previous = this.history.at(-1);
        if (!previous) return messages.noBack;
        await this.io.list(previous);
        this.history.pop(); this.cwd = previous;
        return this.title(this.cwd);
      }
      case "read": return arg ? this.io.read(this.io.resolve(this.cwd, arg)) : messages.missingFile;
      case "go": {
        const {exits} = await this.survey();
        const exit = exits.find(e => e.name === arg) ?? exits.find(e => e.direction && e.direction === arg.toLowerCase());
        if (!exit) return messages.missingExit;
        this.move(this.io.resolve(this.cwd, exit.name));
        return this.title(this.cwd) + "\n" + this.scene.interior;
      }
      case "look": {
        const room = await this.survey();
        return [room.title, room.description, ...room.exits.map(e => (e.direction || "exit") + " · " + e.title + " [" + e.name + "/]"), "Objects: " + (room.files.join(", ") || "none")].join("\n");
      }
      default: return messages.unknown;
    }
  }
}
export type Room = Awaited<ReturnType<Expedition["survey"]>>;
