// Local verification entry point for the same built runtime shipped to Pages.
import {createSession} from "../dist/session.js";
const world = createSession(Number(process.env.MUD_SEED || 0));
for (const line of process.argv.slice(2)) {
  console.log("> " + line);
  console.log(await world.run(line));
}
