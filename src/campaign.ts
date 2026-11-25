import { golemModule, scoutPhoto, sealedArchive } from "./campaign-artifacts.ts";

export const campaignName = "The Lantern Below";
export type RoomFiles = Record<string, string | Uint8Array>;
export interface CampaignSave { seed: number; completed: number }

interface PuzzleRoom {
  id: string;
  title: string;
  description: string;
  task: string;
  hint: string;
  ending: string;
  setup(seed: number, flag: string): RoomFiles;
  answer?(seed: number): string;
  output?: { path: string; contents(flag: string): string };
}

function numberFor(seed: number, key: string) {
  let value = seed ^ 0x811c9dc5;
  for (const char of key) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function namedFileMaze(seed: number, name: string, flag: string) {
  const chosen = numberFor(seed, name) % 100;
  return Object.fromEntries(Array.from({length: 100}, (_, i) => [
    `shelves/slot-${String(i + 1).padStart(2, "0")}/${i === chosen ? name : "inventory.txt"}`,
    i === chosen ? flag + "\n" : "No sealed records in this slot.\n",
  ]));
}

const offeringCount = (seed: number) => 7 + (numberFor(seed, "offerings") % 5);
const archiveContents = (flag: string) => "Emergency key recovered from the dispatch case.\n" + flag + "\n";

const records = [
  ["0a2bec86951f52a77451223c415bb3c1", "The gate opened at dawn."],
  ["8efa56b1329b05647fa5d381cc1eb884", "Supplies carried across the bridge."],
  ["bf246a3ed90fad47bf25c9552df5433f", "Watch changed at the third bell."],
  ["643f641561dbbefe614d49554be48d95", "Lanterns moved to the north wall."],
  ["e182b2449c52140f5f3da76516a2ceaa", "Keep the old stairway clear."],
  ["8379a632d6fe371a84164c6b3672268a", "Report signed by the quartermaster."],
  ["ef483dace0e356a3b89fb8eec2f44de9", "Clerk counted the winter stores."],
  ["c232fa3c739a948309dbe74a7c9912fb", "Return the rope to the west passage."],
  ["f1aa01b44a581b1fa6a4cbc153aed8a2", "Shelter is ready beneath the bridge."],
  ["11e46051343ac24b1a93bef2e6e5cb1c", "The morning patrol found no tracks."],
];
const recordName = (i: number) => `dispatch-${String(i + 1).padStart(2, "0")}.txt`;
const recordIndex = (seed: number) => numberFor(seed, "dispatch") % records.length;
const outposts = [
  {name: "Northgate", lat: 51.5, lon: -0.25},
  {name: "Lanternbridge", lat: 48.75, lon: 2.25},
  {name: "Saltwatch", lat: -33.75, lon: 151.25},
  {name: "Moorwatch", lat: 40.75, lon: -73.75},
];
const lookout = (seed: number) => outposts[numberFor(seed, "lookout") % outposts.length];

export const campaignRooms: readonly PuzzleRoom[] = [
  {
    id: "01-watch-office", title: "The Watch Office",
    description: "A night watchman left you a request before the last patrol.",
    task: "Find night-orders.txt somewhere under records/. Read it and submit the flag inside.",
    hint: "Use find with -name, then read the matching path with cat.",
    ending: "The watchman compares the seal with the one on his keyring. He folds the order into his coat and lifts the bolt.",
    setup: (_seed, flag) => ({
      "records/day/roster.txt": "The day watch handed over at dusk.\n",
      "records/night/cabinet/night-orders.txt": "The door may be opened for the bearer of this order.\n" + flag + "\n",
      "records/night/roster.txt": "The night watch is still on duty.\n",
    }),
  },
  {
    id: "02-scriptorium", title: "The Scriptorium",
    description: "Three scribes copied the same message. One slipped in a second line.",
    task: "Search the manuscripts/ tree for the phrase SILVER MOTH. Submit the flag in the matching manuscript.",
    hint: "Use grep -r to search files in a directory. The match tells you which file to read.",
    ending: "A scribe holds your manuscript over a lamp. The silver mark glints on the page, and she hands you a key.",
    setup: (_seed, flag) => ({
      "manuscripts/west/draft.txt": "The moths gathered as the courtyard cooled.\n",
      "manuscripts/east/report.txt": "The silver coins belong to the keeper.\n",
      "manuscripts/east/.dispatch.txt": "SILVER MOTH\n" + flag + "\n",
    }),
  },
  {
    id: "03-offering-vault", title: "The Offering Vault",
    description: "The vault keeper needs a count of every sealed offering.",
    task: "Count the files directly in offerings/, including hidden files. Submit the number.",
    hint: "List one file per line with ls -A1 offerings, then pipe that list to wc -l.",
    ending: "The keeper checks the tally against her slate. The last offering is accounted for, and the stairway reopens.",
    answer: seed => String(offeringCount(seed)),
    setup: seed => Object.fromEntries(Array.from({length: offeringCount(seed)}, (_, i) => [
      `offerings/${i % 3 === 0 ? "." : ""}votive-${i + 1}.txt`, "Wax seal intact.\n",
    ])),
  },
  {
    id: "04-hundred-shelves", title: "The Hundred Shelves",
    description: "An unmarked aisle runs past a hundred slots in the stone.",
    task: "Find ledger-seal.txt anywhere under shelves/. Submit its flag.",
    hint: "Let find descend into every slot. Use -name with the exact filename.",
    ending: "The seal in the ledger matches the stamp on the locked grille. Its keeper slides the grille aside.",
    setup: (seed, flag) => namedFileMaze(seed, "ledger-seal.txt", flag),
  },
  {
    id: "05-hidden-shelves", title: "The Hidden Shelves",
    description: "Someone has swept the corridor clean. You can still see the outline of a narrow compartment.",
    task: "Search shelves/ for the hidden file .dusk-seal and submit what it contains.",
    hint: "A leading dot is part of the name. find can match dotfiles directly.",
    ending: "The dusk seal releases a catch in the stone. A narrow door swings out beyond the shelving.",
    setup: (seed, flag) => namedFileMaze(seed, ".dusk-seal", flag),
  },
  {
    id: "06-long-scroll", title: "The Long Scroll",
    description: "A scribe copied inventory words end to end to hide a brief inscription.",
    task: "Extract the single MUD{...} flag from long-scroll.txt and submit it.",
    hint: "Try grep brass practice.txt first. The scroll is one long line, so use grep -o to print just the flag. It begins with MUD{ and ends with }.",
    ending: "You repeat the short inscription. The scribe sets the rest of the scroll aside and opens the reading-room door.",
    setup: (seed, flag) => {
      const words = ["ash", "linen", "ore", "slate", "salt", "wax", "ink", "brass"];
      const offset = numberFor(seed, "scroll-position") % 100000;
      const scroll = Array.from({length: 100000}, (_, i) =>
        i === offset ? flag : words[numberFor(seed, String(i)) % words.length]);
      return {
        "practice.txt": "The rack holds two iron keys.\nThe lantern has a brass handle.\n",
        "long-scroll.txt": scroll.join(" ") + "\n",
      };
    },
  },
  {
    id: "07-alarm-room", title: "The Alarm Room",
    description: "Counterweights have been rattling all night. One alarm has never been heard before.",
    task: "Find the only alarm in alarms.log that occurs once. Submit its flag.",
    hint: "Pipe the output of sort into uniq -u to keep only lines that occur once.",
    ending: "The keeper compares the alarm to a diagram of the old gears. A jammed chain drops free, and the staircase rises into place.",
    setup: (seed, flag) => {
      const alarms = ["Chain damp", "Oil low", "Bell weight uneven", "Counterweight drifting", "Gate latch stiff"];
      const offset = numberFor(seed, "alarm-position") % 1000;
      return {"alarms.log": Array.from({length: 1000}, (_, i) =>
        i === offset ? flag : alarms[(i + seed) % alarms.length]).join("\n") + "\n"};
    },
  },
  {
    id: "08-painted-gallery", title: "The Painted Gallery",
    description: "One of the frames holds a file that the gallerykeeper cannot open as a picture.",
    task: "Check the real format of portrait.png with file. Read the message it contains and submit its flag.",
    hint: "The extension is a label. Use file to inspect the contents, then try cat if it is text.",
    ending: "The gallerykeeper unfolds the note behind the canvas. She follows its instruction and reveals a door between the frames.",
    setup: (_seed, flag) => ({"portrait.png": "From the gallerykeeper's ledger.\n" + flag + "\n"}),
  },
  {
    id: "09-sealed-archive", title: "The Sealed Archive",
    description: "The quartermaster left a sealed dispatch case on a stone bench.",
    task: "List the contents of dispatch.tar.gz, then extract it in this room. Use check once the file is on the bench.",
    hint: "Try tar -tzf to list the archive and tar -xzf to extract it.",
    ending: "You lay the dispatch beside the register. The quartermaster matches its seal to the brass plate and turns the key.",
    output: {path: "dispatch.txt", contents: archiveContents},
    setup: (_seed, flag) => ({"dispatch.tar.gz": sealedArchive("dispatch.txt", archiveContents(flag))}),
  },
  {
    id: "10-seal-office", title: "The Seal Office",
    description: "Several dispatches made it to the seal office. One matches the keeper's receipt.",
    task: "Read receipt.txt. Use its MD5 checksum to identify the matching dispatch in copies/. Submit the filename.",
    hint: "Print the checksums with md5sum copies/*, then compare them with the receipt.",
    ending: "The checksum matches the receipt. The keeper files the original dispatch and admits you to the workshop.",
    answer: seed => recordName(recordIndex(seed)),
    setup: seed => ({
      "receipt.txt": "MD5: " + records[recordIndex(seed)][0] + "\n",
      ...Object.fromEntries(records.map(([, text], i) => ["copies/" + recordName(i), text + "\n"])),
    }),
  },
  {
    id: "11-golem-workshop", title: "The Golem Workshop",
    description: "The workshop golem is still. One inscription is sealed inside its memory.",
    task: "Inspect the readable strings in golem.wasm. Submit the flag in its inscription.",
    hint: "strings prints readable sequences from a binary, including WebAssembly modules.",
    ending: "The golem recognizes the inscription. It moves its stone hand off the passage and gives a short greeting.",
    setup: (_seed, flag) => ({"golem.wasm": golemModule(flag)}),
  },
  {
    id: "12-message-station", title: "The Message Station",
    description: "A courier left behind a dispatch written in the station's usual encoding.",
    task: "Decode signal.b64 as Base64 and submit the flag in the message.",
    hint: "Use base64 -d on the encoded file.",
    ending: "You read out the decoded dispatch. The lampkeeper checks it against his orders and turns the lantern toward the final gate.",
    setup: (_seed, flag) => ({"signal.b64": btoa("Lantern ready.\n" + flag + "\n") + "\n"}),
  },
  {
    id: "13-scout-post", title: "The Scout Post",
    description: "A scout left one photograph behind. The outpost names are marked in a separate register.",
    task: "Read the GPS metadata in scout.jpg and compare it to outposts.txt. Submit the matching outpost name.",
    hint: "Use exiftool -n -GPSLatitude -GPSLongitude scout.jpg to read decimal coordinates.",
    ending: "You call out the correct outpost. A lantern across the valley answers, and the last gate opens onto the morning road.",
    answer: seed => lookout(seed).name,
    setup: seed => ({
      "scout.jpg": scoutPhoto(lookout(seed).lat, lookout(seed).lon),
      "outposts.txt": outposts.map(({name, lat, lon}) => `${name}\t${lat}\t${lon}`).join("\n") + "\n",
    }),
  },
];

export function roomFlag(seed: number, index: number) {
  const {id} = campaignRooms[index];
  return "MUD{" + numberFor(seed, id).toString(16).toUpperCase().padStart(8, "0") + "}";
}

export function roomFiles(seed: number, index: number): RoomFiles {
  const room = campaignRooms[index];
  const finish = room.output ? "Use mudsh check after preparing the file." : "Submit the result with mudsh submit ANSWER.";
  return {
    "objective.txt": room.title + "\n\n" + room.task + "\n\n" + finish + "\n",
    ...room.setup(seed, roomFlag(seed, index)),
  };
}

export function validSave(value: unknown): value is CampaignSave {
  if (!value || typeof value !== "object" || !("seed" in value) || !("completed" in value)) return false;
  return typeof value.seed === "number" && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff &&
    typeof value.completed === "number" && Number.isInteger(value.completed) &&
    value.completed >= 0 && value.completed <= campaignRooms.length;
}

export function roomIndex(base: string, cwd: string) {
  if (!cwd.startsWith(base + "/")) return -1;
  const firstDirectory = cwd.slice(base.length + 1).split("/")[0];
  return campaignRooms.findIndex(room => room.id === firstDirectory);
}

export function lastOpenRoom(save: CampaignSave) {
  return Math.min(save.completed, campaignRooms.length - 1);
}

export async function gradeRoom(save: CampaignSave, index: number, action: "submit" | "check",
    answer: string, read: (path: string) => Promise<string | undefined>) {
  const room = campaignRooms[index];
  if (!room || index > save.completed) return {error: "Enter an unlocked room first."};
  if (index < save.completed) return {error: "This room is already complete."};

  const flag = roomFlag(save.seed, index);
  if (room.output) {
    if (action !== "check") return {error: "Use mudsh check to verify the extracted file."};
    if (await read(room.output.path) !== room.output.contents(flag)) {
      return {error: "The requested file is missing or its contents do not match."};
    }
  } else {
    if (action !== "submit" || !answer.trim()) return {error: "Use mudsh submit ANSWER."};
    if (answer.trim() !== (room.answer?.(save.seed) ?? flag)) return {error: "That answer does not open the door."};
  }
  return {next: {...save, completed: index + 1}, ending: room.ending};
}
