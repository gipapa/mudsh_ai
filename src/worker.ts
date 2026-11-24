import { createSession } from "./session.ts";
let game: ReturnType<typeof createSession>;
self.onmessage = async ({data}) => {
  let output = "";
  try {
    if ("seed" in data) game = createSession(data.seed);
    else output = await game.run(data.line);
  } catch (error) { output = String(error); }
  try {
    const room = await game.survey();
    self.postMessage({output,room,ended:game.ended});
  } catch {
    // A shell script may remove or move the directory it started in.
    game.move("/");
    self.postMessage({output:output + "\nPrevious room unavailable; returned to /.",room:await game.survey(),ended:game.ended});
  }
};
