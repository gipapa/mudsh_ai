import { appendObjectText } from "./object-text.ts";
import { messages } from "./en.ts";
import { campaignName, campaignRooms, roomIndex, validSave, type CampaignSave } from "./campaign.ts";
import { startPath } from "./world.ts";
import type { Room } from "./world.ts";
import { drawRegion } from "./panorama.ts";
import { completionURL, listModels, type SpriteConfig } from "./sprite.ts";
import { defaultSpriteOptions, spriteNumbers, type SpriteNumber, type SpriteOptions } from "./sprite-options.ts";

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const input = el<HTMLInputElement>("command"), log = el("log"), dialog = document.querySelector("dialog")!;
let worker: Worker, busy = true, ended = false, timer = 0;
let history: string[] = [], cursor = 0;
let config: SpriteConfig | undefined, resetHistory = false;
const settings = el<HTMLDialogElement>("settings"), sprite = el<HTMLButtonElement>("sprite");
const settingsForm = el<HTMLFormElement>("provider");
const modeInput = el<HTMLSelectElement>("sprite-mode");
const tabs = [el<HTMLButtonElement>("connection-tab"),el<HTMLButtonElement>("mode-tab")];
const providerSelect = el<HTMLSelectElement>("provider-select");
const endpointInput = el<HTMLInputElement>("endpoint");
const modelSelect = el<HTMLSelectElement>("model-select");
const modelInput = el<HTMLInputElement>("model");
const keyInput = el<HTMLInputElement>("key");
const fetchModelsButton = el<HTMLButtonElement>("fetch-models");
const modelOptions = el("model-options"), modelStatus = el("model-status");
const modelError = el("model-error");
let displayedProvider = "", customEndpoint = "";
let modelRequest: AbortController | undefined;
const providerStorageKey = "mudsh_ai.provider.v1";
const campaignStorageKey = "mudsh_ai.campaign.v1";
type SavedProvider = { provider: string; endpoint: string; model: string; key?: string };

function readSavedProvider(): SavedProvider | undefined {
  try {
    const saved: Partial<SavedProvider> | null = JSON.parse(localStorage.getItem(providerStorageKey) ?? "null");
    if (!saved || typeof saved.provider !== "string" || typeof saved.endpoint !== "string" ||
        typeof saved.model !== "string" || !saved.model.trim()) return;
    completionURL(saved.endpoint);
    return {provider:saved.provider,endpoint:saved.endpoint,model:saved.model,
      key:typeof saved.key === "string" ? saved.key : undefined};
  } catch {
    // Settings remain usable if stored data is invalid or storage is unavailable.
  }
}

function saveProvider(saved: SavedProvider) {
  try {
    localStorage.setItem(providerStorageKey,JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function readCampaign(): CampaignSave | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(campaignStorageKey) ?? "null");
    return validSave(saved) ? saved : undefined;
  } catch {
    return;
  }
}

function saveCampaign(save: CampaignSave, restart = false) {
  try {
    const previous = readCampaign();
    if (!restart && previous && (previous.seed !== save.seed || previous.completed >= save.completed)) return;
    localStorage.setItem(campaignStorageKey,JSON.stringify(save));
  } catch {
    // The current dungeon remains usable without storage.
  }
}

function selectTab(selected: HTMLButtonElement) {
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute("aria-selected",String(active));
    tab.tabIndex = active ? 0 : -1;
    el(tab.getAttribute("aria-controls")!).hidden = !active;
  }
}

const numberInputs = new Map<SpriteNumber,HTMLInputElement>();
function addNumberSettings(container: string, names: readonly SpriteNumber[]) {
  for (const name of names) {
    const spec = spriteNumbers[name];
    const label = document.createElement("label");
    const field = document.createElement("input");
    field.type = "number";
    field.min = String(spec.min);
    field.max = String(spec.max);
    field.value = String(defaultSpriteOptions[name]);
    field.required = true;
    label.append(spec.label,field);
    if ("help" in spec) {
      const help = document.createElement("small");
      help.textContent = spec.help;
      label.append(help);
    }
    el(container).append(label);
    numberInputs.set(name,field);
  }
}
addNumberSettings("common-options",["maxTokens","historyTurns","historyChars","roomEntries","timeoutSeconds"]);
addNumberSettings("simple-options",["stdoutChars","stderrChars"]);
addNumberSettings("advanced-options",["maxSteps","deadlineSeconds","toolResultChars"]);

function syncMode() {
  const advanced = modeInput.value === "advanced";
  for (const [id, visible] of [["simple-options",!advanced],["advanced-options",advanced]] as const) {
    el(id).hidden = !visible;
    for (const field of el(id).querySelectorAll("input")) field.disabled = !visible;
  }
  el("mode-description").textContent = advanced
    ? "Pi Core uses tool results to work toward your goal. Choose a model that supports streaming tool calls."
    : "Choose one action per request, with an optional follow-up to summarize shell output.";
}

function readSpriteOptions(): SpriteOptions {
  const options = {...defaultSpriteOptions};
  for (const [name, field] of numberInputs) {
    if (!field.disabled) options[name] = field.valueAsNumber;
  }
  const temperature = el<HTMLInputElement>("temperature");
  options.name = el<HTMLInputElement>("sprite-name").value.trim() || defaultSpriteOptions.name;
  options.temperature = temperature.value ? temperature.valueAsNumber : undefined;
  options.effort = (el<HTMLSelectElement>("reasoning-effort").value || undefined) as SpriteOptions["effort"];
  options.mode = modeInput.value === "advanced" ? "advanced" : "simple";
  options.summarize = el<HTMLInputElement>("summarize").checked;
  options.instructions = el<HTMLTextAreaElement>("sprite-instructions").value.trim();
  return options;
}

function syncModelInput() {
  const manual = modelSelect.value === "";
  el("manual-model").hidden = !manual;
  modelInput.disabled = !manual;
}

function clearModelList() {
  modelRequest?.abort();
  modelRequest = undefined;
  fetchModelsButton.disabled = false;
  modelOptions.replaceChildren();
  modelOptions.hidden = true;
  modelSelect.value = "";
  syncModelInput();
  modelStatus.textContent = "";
  modelError.textContent = "";
}

function syncProvider() {
  const selected = providerSelect.value;
  const preset = providerSelect.selectedOptions[0]?.dataset.endpoint;
  endpointInput.value = preset ?? customEndpoint;
  endpointInput.readOnly = preset !== undefined;
  if (selected === displayedProvider) return;
  if (displayedProvider) {
    modelInput.value = "";
    keyInput.value = "";
    clearModelList();
    el("settings-error").textContent = "";
  }
  displayedProvider = selected;
}

function restoreProvider() {
  const saved = readSavedProvider();
  const option = Array.from(providerSelect.options).find(item => item.value === saved?.provider);
  if (saved && option) {
    providerSelect.value = option.value;
    if (option.value === "custom") customEndpoint = saved.endpoint;
  }
  syncProvider();
  if (saved && option && completionURL(endpointInput.value) === completionURL(saved.endpoint)) {
    modelInput.value = saved.model;
    keyInput.value = saved.key ?? "";
  }
}
function spriteStatus(stage?: string) {
  sprite.textContent = stage || (config ? "Sprite enabled · Settings" : "Sprite offline · Settings");
  sprite.classList.toggle("active",!!config);
}
function watchdog(ms: number) {
  clearTimeout(timer);
  timer=window.setTimeout(()=>fail("Interpreter stopped responding. Choose Restart dungeon to try again."),ms);
}
function print(value:string, kind="", prefix="") {
  if (!value && !prefix) return;
  const pre=document.createElement("pre");
  pre.className=kind;
  if (prefix) {
    const label=document.createElement("span");
    label.textContent=prefix;
    pre.append(label);
  }
  if (!kind || kind === "intro") appendObjectText(pre,value);
  else pre.append(value);
  log.append(pre); log.scrollTop=log.scrollHeight;
}
function controls() {
  input.disabled=busy||ended;
  sprite.disabled=busy;
  for(const b of document.querySelectorAll<HTMLButtonElement>("#run,[data-line],.exit,.file")) b.disabled=input.disabled;
}
function render(room:Room) {
  el("room").textContent=room.title; el("cwd").textContent=room.cwd;
  for(const [id,items] of [
    ["exits",room.exits.map(e=>({name:e.name,direction:e.direction || "go",line:"go "+e.name}))],
    ["objects",room.files.map(name=>({name,direction:"",line:"read "+name}))]
  ] as const) {
    const list=el(id);list.replaceChildren();
    for(const item of items) {
      const b=document.createElement("button");b.className=id==="exits"?"exit":"file";
      if(item.direction){const d=document.createElement("span");d.textContent=item.direction;b.append(d);}
      b.append(document.createTextNode(item.name+(id==="exits"?"/":"")));
      b.addEventListener("click",()=>send(item.line,true));list.append(b);
    }
    if(!items.length){const empty=document.createElement("span");empty.className="empty";empty.textContent="None here";list.append(empty);}
  }
}
function fail(message:string) {
  clearTimeout(timer);worker.terminate();ended=true;busy=false;controls();print(message,"console-error");
}
function send(line:string, worldAction = false) {
  if(busy||ended||!line.trim())return;
  history.push(line);cursor=history.length;input.value="";print(line,"typed","❯ ");
  busy=true;controls();worker.postMessage({line,config:worldAction ? undefined : config,resetHistory:!worldAction && resetHistory});
  if (!worldAction) resetHistory=false;
  watchdog(10000);
}
function start(save = readCampaign() ?? {seed:crypto.getRandomValues(new Uint32Array(1))[0],completed:0}, restart = false){
  worker?.terminate();clearTimeout(timer);busy=true;ended=false;controls();spriteStatus();
  history=[];cursor=0;input.value="";log.replaceChildren();
  el("realm").textContent=campaignName;
  el("progress").textContent=`${save.completed} / ${campaignRooms.length} rooms cleared`;
  el("next-room").hidden=true;
  drawRegion(document.querySelector("canvas")!,1);
  worker=new Worker(new URL("./worker.js",import.meta.url),{type:"module"});
  worker.onerror=()=>fail("Unable to open the interpreter. Start a new expedition to retry.");
  let first=true;
  worker.onmessage=({data})=>{
    if (data.error) {fail(data.error);return;}
    if (data.stage) {
      if (data.stage === "output") {print(data.text);return;}
      const executing = data.stage === "executing";
      const timeout = config?.options?.timeoutSeconds ?? defaultSpriteOptions.timeoutSeconds;
      watchdog(executing ? 10000 : (timeout + 15) * 1000);
      spriteStatus(data.speaker + (executing ? " acting…" : data.stage === "thinking" ? " listening…" : " describing…"));
      if (executing && data.text) print(data.text,"speaker",data.speaker + " ❯ ");
      return;
    }
    if (data.offline) {config=undefined;resetHistory=true;}
    spriteStatus();
    clearTimeout(timer);render(data.room);
    saveCampaign(data.save);
    el("progress").textContent=`${data.save.completed} / ${campaignRooms.length} rooms cleared`;
    const index=roomIndex(startPath,data.room.cwd);
    el("next-room").hidden=!(index >= 0 && index < data.save.completed && index + 1 < campaignRooms.length);
    print(data.output,data.offline || data.failed ? "console-error" : (data.speaker ? "speaker" : ""),
      data.speaker && data.output ? data.speaker + " ❯ " : "");
    for (const ending of data.endings) print(messages.objectiveComplete + "\n" + ending,"goal-success");
    if(first){print(data.room.title+"\n"+data.room.description,"intro");
      print("Read objective.txt to begin. Type help for MUD verbs, or !ls to use the shell.");first=false;}
    busy=false;ended=data.ended;controls();
    if(!ended && window.matchMedia("(pointer:fine)").matches)input.focus({preventScroll:true});
  };
  saveCampaign(save,restart);
  worker.postMessage({save});
  watchdog(10000);
}
document.querySelector("form")!.onsubmit=e=>{e.preventDefault();send(input.value);};
input.onkeydown=e=>{
  if(!["ArrowUp","ArrowDown"].includes(e.key))return;
  e.preventDefault();cursor=Math.max(0,Math.min(history.length,cursor+(e.key==="ArrowUp"?-1:1)));input.value=history[cursor]||"";
};
for(const b of document.querySelectorAll<HTMLButtonElement>("[data-line]"))b.onclick=()=>send(b.dataset.line!,true);
el("new").onclick=()=>dialog.showModal();el("cancel").onclick=()=>dialog.close();
el("restart").onclick=()=>{
  dialog.close();
  start({seed:crypto.getRandomValues(new Uint32Array(1))[0],completed:0},true);
};
sprite.onclick=()=>{
  syncProvider();
  el("settings-error").textContent="";
  settings.showModal();
  el("settings-title").focus({preventScroll:true});
};
for (const tab of tabs) {
  tab.onclick=()=>selectTab(tab);
  tab.onkeydown=event=>{
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[1] : tabs[1 - tabs.indexOf(tab)];
    selectTab(target);
    target.focus();
  };
}
modeInput.onchange=syncMode;
settingsForm.addEventListener("invalid",event=>{
  const tab = tabs.find(item => el(item.getAttribute("aria-controls")!).contains(event.target as Node));
  if (tab) selectTab(tab);
},true);
providerSelect.addEventListener("input", syncProvider);
providerSelect.addEventListener("change", syncProvider);
endpointInput.oninput=()=>{
  if (providerSelect.value === "custom" && customEndpoint !== endpointInput.value) {
    customEndpoint = endpointInput.value;
    keyInput.value = "";
  }
  clearModelList();
};
keyInput.oninput=clearModelList;
modelSelect.onchange=syncModelInput;
fetchModelsButton.onclick=async()=>{
  syncProvider();
  const request = new AbortController();
  modelRequest = request;
  fetchModelsButton.disabled = true;
  modelStatus.textContent = "Loading models…";
  modelError.textContent = "";
  try {
    const models=await listModels(endpointInput.value.trim(),keyInput.value.trim(),request.signal);
    if (modelRequest !== request) return;
    const selected = modelSelect.value;
    modelOptions.replaceChildren(...models.map(model => new Option(model.id, model.id)));
    modelOptions.hidden = models.length === 0;
    modelSelect.value = models.some(model => model.id === selected) ? selected : "";
    syncModelInput();
    modelStatus.textContent = models.length
      ? `${models.length} ${models.length === 1 ? "model" : "models"} available. Choose one from the Model menu.`
      : "The provider returned no models. You can enter a model ID manually.";
  } catch(error) {
    if (modelRequest === request) {
      modelStatus.textContent = "";
      const reason = error instanceof Error ? error.message : "Unknown provider error.";
      modelError.textContent = `Could not load models. ${reason} Select Enter manually to use a model ID.`;
    }
  } finally {
    if (modelRequest === request) {
      modelRequest = undefined;
      fetchModelsButton.disabled = false;
    }
  }
};
el("dismiss").onclick=()=>settings.close();
el("disconnect").onclick=()=>{
  config=undefined;keyInput.value="";resetHistory=true;
  modelInput.value = modelSelect.value || modelInput.value;
  clearModelList();
  const saved = readSavedProvider();
  const cleared = !saved?.key || saveProvider({...saved,key:undefined});
  spriteStatus();settings.close();print("Sprite disconnected. Use MUD verbs or !command.");
  if (!cleared) print("Could not remove the saved API key from browser storage.");
};
settingsForm.onsubmit=e=>{
  e.preventDefault();
  syncProvider();
  try {
    const base = endpointInput.value.trim();
    const endpoint=completionURL(base);
    const model=modelSelect.value || modelInput.value.trim();
    if (!model) throw Error("Enter the model ID supplied by your provider.");
    const options = readSpriteOptions();
    const key = keyInput.value.trim();
    config={endpoint,model,key,options};
    const saved = saveProvider({provider:providerSelect.value,endpoint:base,model,key:key || undefined});
    resetHistory=true;spriteStatus();settings.close();
    print(options.name + " enabled. Speak naturally, or use !command to run a script directly.");
    if (!saved) print("Could not save connection settings in this browser.");
    input.focus();
  } catch(error) {
    selectTab(tabs[0]);
    el("settings-error").textContent=error instanceof Error ? error.message : "Invalid settings";
  }
};
restoreProvider();
syncMode();
start();
