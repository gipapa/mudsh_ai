const cardinals = ["north", "east", "south", "west"];
const quadrants = [
  { sides: ["north", "east"], name: "northeast" },
  { sides: ["east", "south"], name: "southeast" },
  { sides: ["south", "west"], name: "southwest" },
  { sides: ["west", "north"], name: "northwest" },
];

function* directionGroups() {
  yield cardinals;
  let bearings = quadrants;
  while (true) {
    yield bearings.map(({name}) => name);
    // Bisect the two halves next to every midpoint before assigning finer bearings.
    bearings = bearings.flatMap(({sides, name}) => sides.map(side => ({sides, name: side + "-" + name})));
  }
}

export function hash(text: string) {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function assignDirections(names: string[], key: string, assigned = new Map<string, string>()) {
  const current = new Set(names);
  const reserved = new Set(names.map(name => name.toLowerCase()));
  for (const [name, direction] of assigned) {
    if (!current.has(name) || reserved.has(direction)) assigned.delete(name);
  }
  const used = new Set([...assigned.values(), ...reserved]);
  let free: string[] = [];
  const groups = directionGroups();
  return names.map(name => {
    let direction = assigned.get(name);
    if (direction === undefined) {
      while (!free.length) free = groups.next().value!.filter(candidate => !used.has(candidate));
      [direction] = free.splice(hash(key + name) % free.length, 1);
      assigned.set(name, direction);
    }
    return {name, direction};
  });
}

function formatExit(direction: string, name: string) {
  return direction + " · [" + name + "]";
}

export function formatSurvey(room: {
  title: string;
  description: string;
  exits: { direction: string; name: string }[];
  back?: string;
  files: string[];
}) {
  return [
    room.title,
    room.description,
    ...room.exits.map(({direction, name}) => formatExit(direction, name)),
    ...(room.back === undefined ? [] : [formatExit("back", room.back)]),
    "Objects: " + (room.files.join(", ") || "none"),
  ].join("\n");
}

export function directoryName(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? "/";
}
