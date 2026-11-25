import { createSession } from "./session.ts";
import { playTurn, type Progress, type SpriteHistory } from "./sprite.ts";
import { route } from "./world.ts";
import { defaultSpriteOptions } from "./sprite-options.ts";
let game: ReturnType<typeof createSession>;
let history: SpriteHistory = [];
self.onmessage = async ({data}) => {
  let output = "";
  let offline = false;
  let speaker: string | undefined;
  try {
    if ("seed" in data) game = createSession(data.seed);
    else {
      if (data.resetHistory) history = [];
      const spriteTurn = route(data.line,!!data.config) === "sprite";
      if (spriteTurn) speaker = data.config.options?.name ?? defaultSpriteOptions.name;
      const progress: Progress = (stage,text)=>self.postMessage({stage,text,speaker});
      const advanced = spriteTurn && data.config.options?.mode === "advanced";
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
    self.postMessage({output,room,ended:game.ended,offline,speaker});
  } catch {
    // A shell script may remove or move the directory it started in.
    game.move("/");
    self.postMessage({output:output + "\nPrevious room unavailable; returned to /.",room:await game.survey(),ended:game.ended,offline,speaker});
  }
};
