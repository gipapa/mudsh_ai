import {
  campaignName, campaignRooms, gradeRoom, lastOpenRoom, roomIndex, type CampaignSave,
} from "./campaign.ts";
import { Expedition, startPath, type WorldIO } from "./world.ts";
import { messages, sceneForSeed } from "./en.ts";

export const campaignHelp = [
  "look                 Inspect the room and its objective",
  "go NAME              Enter an exit by name or direction",
  "back / go back       Return to the previous room",
  "read FILE            Read a text object",
  "hint                 Ask for a shell hint",
  "submit ANSWER        Submit a flag, filename or number",
  "check                Verify a room that asks you to create a file",
  "next                 Enter the next unlocked room",
  "progress             Show cleared rooms",
  "!COMMAND             Run a Bash script in this world",
  "help                 Open this field guide",
  "quit                 Close the dungeon",
].join("\n");

const gameVerbs = new Set(["hint", "submit", "check", "next", "progress"]);
const dungeonScene = {...sceneForSeed(1), name: campaignName};
const ok = (text: string) => ({text, code: 0});
const fail = (text: string) => ({text, code: 1});

export class Dungeon extends Expedition {
  save: CampaignSave;
  completions: string[] = [];
  prepare: (index: number) => Promise<void>;

  constructor(io: WorldIO, save: CampaignSave, prepare: (index: number) => Promise<void>) {
    super(io, save.seed);
    this.save = save;
    this.prepare = prepare;
    this.cwd = this.path(lastOpenRoom(save));
  }

  override get scene() { return dungeonScene; }
  path(index: number) { return startPath + "/" + campaignRooms[index].id; }
  override title(path: string) {
    const index = roomIndex(startPath, path);
    if (index >= 0 && index <= lastOpenRoom(this.save)) {
      return path === this.path(index) ? campaignRooms[index].title : path.split("/").at(-1)!;
    }
    return path === startPath ? "The Dungeon Entrance" : path.split("/").at(-1) || "Filesystem Root";
  }

  override description(path: string) {
    const index = roomIndex(startPath, path);
    const room = campaignRooms[index];
    if (room && index <= lastOpenRoom(this.save)) return room.description + "\n" + room.task;
    return "Use progress to see your route through the dungeon.";
  }

  async control(command: string, answer: string, cwd: string) {
    const index = roomIndex(startPath, cwd);
    const room = campaignRooms[index];
    switch (command) {
      case "progress": return ok(`${this.save.completed}/${campaignRooms.length} rooms cleared.\n` +
        campaignRooms.slice(0, lastOpenRoom(this.save) + 1).map(({id, title}, i) =>
          `${i < this.save.completed ? "Cleared" : "Open"} · ${title} [${id}]`).join("\n"));
      case "look": return ok(await this.look(cwd));
      case "hint": return room && index <= lastOpenRoom(this.save) ? ok(room.hint) : fail("Enter an unlocked room first.");
      case "next":
        if (index < 0) return ok(this.path(lastOpenRoom(this.save)));
        if (index >= this.save.completed) return fail("Solve this room to open the next door.");
        if (index + 1 >= campaignRooms.length) return fail("The last room is complete.");
        return ok(this.path(index + 1));
      case "submit":
      case "check": {
        const result = await gradeRoom(this.save, index, command, answer,
          path => this.io.read(this.path(index) + "/" + path).catch(() => undefined));
        if (!result.next) return fail(result.error);
        if (result.next.completed < campaignRooms.length) await this.prepare(result.next.completed);
        this.save = result.next;
        this.completions.push(result.ending);
        return ok(this.save.completed === campaignRooms.length
          ? "All rooms cleared."
          : "Next room opened. Use next or enter " + this.path(this.save.completed) + ".");
      }
      default: return fail("Use mudsh look, hint, submit ANSWER, check, next, or progress.");
    }
  }

  override async run(input: string) {
    if (this.ended) return messages.closed;
    const [, verb, answer = ""] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(input.trim()) ?? [];
    const command = verb?.toLowerCase() ?? "";
    if (command === "help") return campaignHelp;
    if (!gameVerbs.has(command)) return super.run(input);
    const result = await this.control(command, answer, this.cwd);
    if (command === "next" && result.code === 0) {
      this.move(result.text);
      return this.look();
    }
    return result.text;
  }
}
