export const directions = ["north", "east", "south", "west"];
export const help = [
  "look              Inspect the room, exits and objects",
  "go NAME           Enter an exit by direction or directory",
  "back              Return to the previous room",
  "read FILE         Read an object exactly as written",
  "!COMMAND          Run a shell command in this world",
  "help              Open this field guide",
  "quit              End this expedition",
].join("\n");

export const scenes = [
  { name: "Ashwick Keep", region: "Castle", entry: "The Gatehouse",
    description: "Rain beads on the iron portcullis. Somewhere above you, a watch bell rings twice.",
    rooms: ["The West Gallery", "The Bell Tower", "The Scriptorium", "The Watch Hall"],
    interior: "A ribbon of moonlight slips through the arrow slits.",
    folders: ["archives", "ramparts", "chapel"],
    letter: "Keeper,\n\nI have left the last key with the rook on the eastern wall. If it calls your name, answer softly.\n\n— Elin\n",
    mark: "♜" },
  { name: "Hollowdeep", region: "Dungeon", entry: "The Iron Threshold",
    description: "Cold air rises from the stairwell. Water ticks against a bronze basin in the dark.",
    rooms: ["The Echo Vault", "The Cistern", "The Chain Hall", "The Sunken Cell"],
    interior: "The stone carries every footstep a little farther than it should.",
    folders: ["cells", "cistern", "vault"],
    letter: "Wayfinder,\n\nThe water remembers the way out. Listen at the mouth of the cistern before the third bell.\n\n— The Ferryman\n",
    mark: "⚿" },
  { name: "Embervein Mine", region: "Abandoned mine", entry: "The Drift Entrance",
    description: "An empty ore cart rests beneath a timber arch. Copper dust glows in the last daylight.",
    rooms: ["The Survey Chamber", "The Powder Store", "The Lower Drift", "The Engine Room"],
    interior: "A thin vein of copper catches the light between the timbers.",
    folders: ["workshop", "drift", "depot"],
    letter: "Surveyor,\n\nWe heard tapping beyond the last marker. The shift ended years ago, but someone is still counting.\n\n— Foreman Vale\n",
    mark: "⚒" },
];
export type Scene = typeof scenes[number];
export const messages = {
  unknown: "The sprite is offline. Use a MUD verb (help), or prefix a shell command with !.",
  emptyShell: "Enter a command after !.",
  noBack: "This is your first room.",
  quit: "Expedition closed. Start a new expedition to play again.",
  closed: "This expedition has ended.",
  missingExit: "Choose an exit name or direction from the room survey.",
  missingFile: "Choose an object with read FILE.",
};
