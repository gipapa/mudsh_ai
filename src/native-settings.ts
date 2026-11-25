import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { completionURL, listModels, type SpriteConfig } from "./sprite.ts";
import { defaultSpriteOptions, spriteNumbers, type SpriteNumber, type SpriteOptions } from "./sprite-options.ts";

const presets = {openai:"https://api.openai.com/v1",groq:"https://api.groq.com/openai/v1"} as const;
const directory = join(process.env.XDG_CONFIG_HOME || join(homedir(),".config"),"mudsh-ai");
const path = join(directory,"sprite.json");
type Settings = SpriteConfig & {options: SpriteOptions};
const printable = (text: string) => !/[\x00-\x1f\x7f-\x9f]/u.test(text);

function setOption(options: SpriteOptions, name: string, value: unknown) {
  if (Object.hasOwn(spriteNumbers,name)) {
    const key = name as SpriteNumber;
    const {min,max} = spriteNumbers[key];
    const number = Number(value);
    if ((typeof value !== "number" && typeof value !== "string") || !Number.isInteger(number) ||
        number < min || number > max || String(value).trim() === "")
      throw Error(`${name} must be an integer between ${min} and ${max}.`);
    options[key] = number;
    return;
  }
  const text = String(value);
  switch (name) {
    case "name":
      if (typeof value !== "string" || !text.trim() || text.length > 64 || !printable(text))
        throw Error("The sprite name must contain 1 to 64 printable characters.");
      options.name = text.trim();
      return;
    case "mode":
      if (value !== "simple" && value !== "advanced") throw Error("Use simple or advanced.");
      options.mode = value;
      return;
    case "summarize":
      if (!["true","false"].includes(text)) throw Error("Use true or false.");
      options.summarize = text === "true";
      return;
    case "temperature": {
      if (text === "default") { delete options.temperature; return; }
      const number = Number(text);
      if (!text || !Number.isFinite(number) || number < 0 || number > 2) throw Error("Use a temperature from 0 to 2, or default.");
      options.temperature = number;
      return;
    }
    case "effort":
      if (value === "default") { delete options.effort; return; }
      if (value !== "none" && value !== "low" && value !== "medium" && value !== "high")
        throw Error("Use default, none, low, medium, or high.");
      options.effort = value;
      return;
    case "instructions":
      if (typeof value !== "string" || text.length > 8192) throw Error("Instructions must be at most 8,192 characters.");
      options.instructions = text;
      return;
    default: throw Error(`Unknown sprite option: ${name}`);
  }
}

export async function loadSettings(): Promise<Settings | undefined> {
  const contents = await readFile(path,"utf8").catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  if (contents === undefined) return undefined;
  const config = JSON.parse(contents);
  if (typeof config?.endpoint !== "string" || typeof config.key !== "string" ||
      typeof config.model !== "string" || !config.model.trim() || !printable(config.model))
    throw Error("Sprite settings are invalid.");
  completionURL(config.endpoint);
  const options = {...defaultSpriteOptions};
  for (const [name,value] of Object.entries(config.options ?? {})) {
    if (Object.hasOwn(defaultSpriteOptions,name) || name === "effort" || name === "temperature") setOption(options,name,value);
  }
  return {endpoint:config.endpoint, model:config.model, key:config.key, options};
}

async function save(config: Settings) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const temporary = join(directory,".sprite-" + randomUUID());
  try {
    await writeFile(temporary,JSON.stringify(config,null,2) + "\n",{flag:"wx",mode:0o600});
    await rename(temporary,path);
  } finally {
    await rm(temporary,{force:true});
  }
}

async function setup(previous?: Settings) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error("Run mudsh sprite setup in an interactive terminal.");
  let hidden = false;
  const output = new Writable({
    write(chunk,_encoding,done) {
      if (hidden) done();
      else process.stdout.write(chunk,done);
    },
  });
  const rl = createInterface({input:process.stdin,output,terminal:true});
  const canceled = new AbortController();
  rl.on("close",()=>canceled.abort());
  rl.on("SIGINT",()=>rl.close());
  const ask = async (prompt: string) => (await rl.question(prompt,{signal:canceled.signal})).trim();
  try {
    const previousProvider = previous ? Object.entries(presets).find(([,endpoint]) => endpoint === previous.endpoint)?.[0] ?? "custom" : "openai";
    const provider = (await ask(`Provider (openai/groq/custom) [${previousProvider}]: `) || previousProvider).toLowerCase();
    const endpoint = provider === "custom"
      ? await ask(`API base URL${previous ? ` [${previous.endpoint}]` : ""}: `) || previous?.endpoint || ""
      : presets[provider as keyof typeof presets];
    if (!endpoint) throw Error("Choose openai, groq, or a custom API base URL.");
    completionURL(endpoint);
    const sameEndpoint = previous && completionURL(previous.endpoint) === completionURL(endpoint);
    process.stdout.write(`API key (hidden${sameEndpoint && previous.key ? ", enter to keep, - to clear" : ", optional for local providers"}): `);
    hidden = true;
    let entered: string;
    try { entered = await ask(""); }
    finally { hidden = false; process.stdout.write("\n"); }
    const key = entered === "-" ? "" : entered || (sameEndpoint ? previous.key : "");
    let models: Awaited<ReturnType<typeof listModels>> = [];
    if (/^y(es)?$/i.test(await ask("Fetch available models? [y/N]: "))) {
      try {
        models = (await listModels(endpoint,key,canceled.signal)).filter(({id}) => printable(id));
        models.slice(0,30).forEach(({id},i) => console.log(`  ${i+1}. ${id}`));
        if (models.length) console.log("Enter a number to select a model, or type its ID. Prefix a numeric ID with id:.");
        if (models.length > 30) console.log("First 30 shown. Enter any model ID manually.");
        if (!models.length) console.log("No models were returned. Enter a model ID manually.");
      } catch (error) {
        console.log("Could not load models. " + (error instanceof Error ? error.message : String(error)));
      }
    }
    const priorModel = sameEndpoint ? previous.model : "";
    const choice = await ask(`Model ID${models.length ? " or list number" : ""}${priorModel ? ` [${priorModel}]` : ""}: `);
    const model = choice.startsWith("id:") && models.length ? choice.slice(3).trim() :
      (/^[1-9]\d*$/u.test(choice) && models.slice(0,30)[Number(choice)-1]?.id) || choice || priorModel;
    if (!model || !printable(model)) throw Error("Enter a model ID.");
    const options = {...(previous?.options ?? defaultSpriteOptions)};
    const name = await ask(`Sprite name [${options.name}]: `);
    if (name) setOption(options,"name",name);
    const mode = await ask(`Mode (simple/advanced) [${options.mode}]: `);
    if (mode) setOption(options,"mode",mode.toLowerCase());
    await save({endpoint,model,key,options});
    console.log("Sprite settings saved. Open mudsh or enter /sprite on to connect.");
  } catch (error) {
    if (canceled.signal.aborted) throw Error("Sprite setup canceled.");
    throw error;
  } finally {
    rl.close();
  }
}

export async function spriteSettings([command, option, ...rest]: string[]) {
  if (!command || command === "help") {
    console.log(`mudsh sprite setup                Choose a provider, model, name and mode
mudsh sprite models               List models for the configured provider
mudsh sprite show                 Print settings without the API key
mudsh sprite set OPTION VALUE     Change one sprite setting
Options: mode, name, summarize, temperature, effort, instructions, ${Object.keys(spriteNumbers).join(", ")}`);
    return;
  }
  if (command === "setup") {
    await setup(await loadSettings().catch(error => {
      if (error instanceof SyntaxError || error.message === "Sprite settings are invalid.") return undefined;
      throw error;
    }));
    return;
  }
  const config = await loadSettings();
  if (!config) throw Error("Run mudsh sprite setup first.");
  switch (command) {
    case "models":
      for (const {id} of await listModels(config.endpoint,config.key)) {
        if (printable(id)) console.log(id);
      }
      break;
    case "show":
      console.log(JSON.stringify({endpoint:config.endpoint,model:config.model,options:config.options},null,2));
      break;
    case "set":
      if (!option || !rest.length) throw Error("Use mudsh sprite set OPTION VALUE.");
      setOption(config.options,option,rest.join(" "));
      await save(config);
      console.log("Sprite setting saved. Enter /sprite on to reload it in a running session.");
      break;
    default: throw Error("Use mudsh sprite help.");
  }
}
