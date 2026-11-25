// Local verification entry point for the same built runtime shipped to Pages.
import {createDungeon} from "../dist/session.js";
import {messages} from "../src/en.ts";
const world = await createDungeon({seed:Number(process.env.MUD_SEED || 0),completed:0});
for (const line of process.argv.slice(2)) {
  console.log("> " + line);
  console.log(await world.run(line));
  for (const ending of world.completions.splice(0)) console.log(messages.objectiveComplete + "\n\n" + ending);
}
