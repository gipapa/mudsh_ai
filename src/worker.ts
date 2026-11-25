import { createDungeon } from "./session.ts";
import { playTurn, type Progress, type SpriteHistory } from "./sprite.ts";
import { route } from "./world.ts";
import { defaultSpriteOptions } from "./sprite-options.ts";
let game: Awaited<ReturnType<typeof createDungeon>>;
let history: SpriteHistory = [];
self.onmessage = async ({data}) => {
  let output = "";
  let offline = false;
  let speaker: string | undefined;
  try {
    if ("save" in data) game = await createDungeon(data.save);
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
  if (!game) {
    self.postMessage({error: output || "Unable to open the dungeon."});
    return;
  }
  const endings = game.completions.splice(0);
  const status = {output,ended:game.ended,offline,speaker,endings,save:game.save};
  try {
    const room = await game.survey();
    self.postMessage({...status,room});
  } catch {
    // A shell script may remove or move the directory it started in.
    game.move("/");
    self.postMessage({...status,output:output + "\nPrevious room unavailable; returned to /.",room:await game.survey()});
  }
};
