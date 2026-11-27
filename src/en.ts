export const help = [
  "look              Inspect the room, exits and objects",
  "go NAME           Enter an exit by direction or directory",
  "back / go back    Return to the previous room",
  "read FILE         Read an object exactly as written",
  "!COMMAND          Run a shell command in this world",
  "help              Open this field guide",
  "quit              End this expedition",
];

export interface ChestPuzzle {
  fieldNote: string;
  clues: { path: string; text: (digits: string) => string }[];
  path: string;
  locked: string;
  opened: string;
}

type Scene = {
  id: "castle" | "dungeon" | "mine" | "observatory";
  name: string;
  region: string;
  entry: string;
  description: string;
  rooms: string[];
  interior: string;
  folders: string[];
  success: string;
  mark: string;
  locations?: Record<string, { title: string; description: string }>;
} & ({ letter: string; chest?: never } | { chest: ChestPuzzle; letter?: never });

const scenes: Scene[] = [
  { id: "castle", name: "Ashwick Keep", region: "Castle", entry: "The Gatehouse",
    description: "Rain beads on the iron portcullis. Somewhere above you, a watch bell rings twice.",
    rooms: ["The West Gallery", "The Bell Tower", "The Scriptorium", "The Watch Hall"],
    interior: "A ribbon of moonlight slips through the arrow slits.",
    folders: ["archives", "ramparts", "chapel"],
    letter: "Keeper,\n\nI have left the last key with the rook on the eastern wall. If it calls your name, answer softly.\n\n— Elin\n",
    success: "A black feather slips out of Elin’s letter. You reach her signature just as the watch bell falls silent. Beyond the arrow slits, a rook calls from the eastern wall.",
    mark: "♜" },
  { id: "dungeon", name: "Hollowdeep", region: "Dungeon", entry: "The Iron Threshold",
    description: "Cold air rises from the stairwell. Water ticks against a bronze basin in the dark.",
    rooms: ["The Echo Vault", "The Cistern", "The Chain Hall", "The Sunken Cell"],
    interior: "The stone carries every footstep a little farther than it should.",
    folders: ["cells", "cistern", "vault"],
    letter: "Wayfinder,\n\nThe water remembers the way out. Listen at the mouth of the cistern before the third bell.\n\n— The Ferryman\n",
    success: "The Ferryman’s letter is damp, but the ink has held. A bell sounds beneath the stone as you finish reading. When the echo fades, you hear water running toward a passage.",
    mark: "⚿" },
  { id: "mine", name: "Embervein Mine", region: "Abandoned mine", entry: "The Drift Entrance",
    description: "An empty ore cart rests beneath a timber arch. Copper dust glows in the last daylight.",
    rooms: ["The Survey Chamber", "The Powder Store", "The Lower Drift", "The Engine Room"],
    interior: "A thin vein of copper catches the light between the timbers.",
    folders: ["workshop", "drift", "depot"],
    letter: "Surveyor,\n\nWe heard tapping beyond the last marker. The shift ended years ago, but someone is still counting.\n\n— Foreman Vale\n",
    success: "You brush copper dust from Foreman Vale’s letter. As you read about the last marker, three taps sound from the drift, followed by a fourth. The count he wrote about is still going.",
    mark: "⚒" },
  { id: "observatory", name: "Tideglass Observatory", region: "Coastal observatory", entry: "The Windward Landing",
    description: "Sea spray rattles the shutters. Above the cliff, a brass telescope points toward an empty patch of sky.",
    rooms: ["The Service Walk", "The Brass Gallery", "The Lantern Landing"],
    interior: "Wind whistles through the joints of the observatory dome.",
    folders: ["chartroom", "tide-room", "vault"],
    locations: {
      chartroom: { title: "The Chart Room", description: "A star chart lies pinned to a drafting table with two brass weights." },
      "tide-room": { title: "The Tide Room", description: "A salt-stained tide ledger rests beneath a stopped clock." },
      vault: { title: "The Observatory Vault", description: "A cedar chest with a four-wheel brass lock sits on a stone plinth." },
    },
    chest: {
      fieldNote: "The keeper split the vault chest's four-digit password. Read star-chart.txt in chartroom for the first two digits, then tide-ledger.txt in tide-room for the last two. Keep any leading zero. Bring the password to the chest in vault.\n",
      clues: [
        { path: "chartroom/star-chart.txt", text: digits => `First pair, marked beside the North Star: ${digits}\n` },
        { path: "tide-room/tide-ledger.txt", text: digits => `Last pair, recorded at low tide: ${digits}\n` },
      ],
      path: "vault/chest.txt",
      locked: "The chest is locked. Use unlock CODE here with the four-digit password.\n",
      opened: "The chest is open. Inside rests the Tideglass Lens, etched with the observatory keeper's initials.\n",
    },
    success: "The last brass wheel clicks and the cedar lid rises. Moonlight passes through the Tideglass Lens, tracing the North Star on the vault wall beside the keeper’s initials.",
    mark: "✧" },
];

export function sceneForSeed(seed: number) {
  return scenes[seed % scenes.length];
}

export const messages = {
  unknown: "The sprite is offline. Use a MUD verb (help), or prefix a shell command with !.",
  emptyShell: "Enter a command after !.",
  noBack: "This is your first room.",
  quit: "Expedition closed. Start a new expedition to play again.",
  closed: "This expedition has ended.",
  missingExit: "Choose an exit name or direction from the room survey.",
  missingFile: "Choose an object with read FILE.",
  unlockHelp: "unlock CODE       Open the vault chest with its four-digit password",
  unlockUsage: "Enter a four-digit password with unlock CODE.",
  noChest: "There is no chest to unlock here.",
  wrongCode: "The lock clicks. The password is incorrect.",
  objectiveComplete: "Objective complete!",
};
