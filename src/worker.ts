import { createSession } from "./session.ts";
import { playTurn, type Progress, type SpriteHistory } from "./sprite.ts";
import { route } from "./world.ts";
let game: ReturnType<typeof createSession>;
let history: SpriteHistory = [];
self.onmessage = async ({data}) => {
  let output = "";
  let offline = false;
  try {
    if ("seed" in data) game = createSession(data.seed);
    else {
      if (data.resetHistory) history = [];
      const progress: Progress = (stage,text)=>self.postMessage({stage,text});
      const advanced = data.config?.options?.mode === "advanced" && route(data.line,true) === "sprite";
      if (advanced) progress("thinking");
      const result = advanced
        ? await (await import("./sprite-agent.ts")).playAdvancedTurn(game,data.line,data.config,progress,history)
        : await playTurn(game,data.line,data.config,progress,history);
      output = result.output;
      offline = !!result.offline;
    }
  } catch (error) { output = String(error); }
  try {
    const room = await game.survey();
    self.postMessage({output,room,ended:game.ended,offline});
  } catch {
    // A shell script may remove or move the directory it started in.
    game.move("/");
    self.postMessage({output:output + "\nPrevious room unavailable; returned to /.",room:await game.survey(),ended:game.ended,offline});
  }
};
