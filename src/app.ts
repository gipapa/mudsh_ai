import { scenes } from "./en.ts";
import type { Room } from "./world.ts";
import { drawRegion } from "./panorama.ts";
import { completionURL, listModels, type SpriteConfig } from "./sprite.ts";

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const input = el<HTMLInputElement>("command"), log = el("log"), dialog = document.querySelector("dialog")!;
let worker: Worker, busy = true, ended = false, timer = 0;
let history: string[] = [], cursor = 0;
let config: SpriteConfig | undefined, resetHistory = false;
const settings = el<HTMLDialogElement>("settings"), sprite = el<HTMLButtonElement>("sprite");
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
function spriteStatus(stage?: string) {
  sprite.textContent = stage || (config ? "Sprite enabled · Settings" : "Sprite offline · Settings");
  sprite.classList.toggle("active",!!config);
}
function watchdog(ms: number) {
  clearTimeout(timer);
  timer=window.setTimeout(()=>fail("Interpreter stopped responding. Choose New expedition to restart."),ms);
}
function print(value:string, kind="") {
  if (!value) return;
  const pre=document.createElement("pre"); pre.className=kind; pre.textContent=value;
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
      b.addEventListener("click",()=>send(item.line));list.append(b);
    }
    if(!items.length){const empty=document.createElement("span");empty.className="empty";empty.textContent="None here";list.append(empty);}
  }
}
function fail(message:string) {
  clearTimeout(timer);worker.terminate();ended=true;busy=false;controls();print(message);
}
function send(line:string) {
  if(busy||ended||!line.trim())return;
  history.push(line);cursor=history.length;input.value="";print("❯ "+line,"typed");
  busy=true;controls();worker.postMessage({line,config,resetHistory});
  resetHistory=false;
  watchdog(10000);
}
function start(){
  worker?.terminate();clearTimeout(timer);busy=true;ended=false;controls();spriteStatus();
  history=[];cursor=0;input.value="";log.replaceChildren();
  const seed=crypto.getRandomValues(new Uint32Array(1))[0], scene=scenes[seed%3];
  el("realm").textContent=scene.name;el("region").textContent=scene.region;
  el("seed").textContent="Map seed · "+seed.toString(16).padStart(8,"0").toUpperCase();
  drawRegion(document.querySelector("canvas")!,seed);
  worker=new Worker(new URL("./worker.js",import.meta.url),{type:"module"});
  worker.onerror=()=>fail("Unable to open the interpreter. Start a new expedition to retry.");
  let first=true;
  worker.onmessage=({data})=>{
    if (data.stage) {
      const executing = data.stage === "executing";
      watchdog(executing ? 10000 : 40000);
      spriteStatus(executing ? "Sprite acting…" : data.stage === "thinking" ? "Sprite listening…" : "Sprite describing…");
      if (data.command) print("Sprite ❯ "+data.command,"typed");
      return;
    }
    if (data.offline) {config=undefined;resetHistory=true;}
    spriteStatus();
    clearTimeout(timer);render(data.room);print(data.output);
    if(first){print(data.room.title+"\n"+data.room.description,"intro");
      print("Read field-note.txt to begin. Type help for MUD verbs, or !ls to use the shell.");first=false;}
    busy=false;ended=data.ended;controls();
    if(!ended && window.matchMedia("(pointer:fine)").matches)input.focus({preventScroll:true});
  };
  worker.postMessage({seed});
}
document.querySelector("form")!.onsubmit=e=>{e.preventDefault();send(input.value);};
input.onkeydown=e=>{
  if(!["ArrowUp","ArrowDown"].includes(e.key))return;
  e.preventDefault();cursor=Math.max(0,Math.min(history.length,cursor+(e.key==="ArrowUp"?-1:1)));input.value=history[cursor]||"";
};
for(const b of document.querySelectorAll<HTMLButtonElement>("[data-line]"))b.onclick=()=>send(b.dataset.line!);
el("new").onclick=()=>dialog.showModal();el("cancel").onclick=()=>dialog.close();
el("restart").onclick=()=>{dialog.close();start();};
sprite.onclick=()=>{syncProvider();el("settings-error").textContent="";settings.showModal();};
providerSelect.addEventListener("input", syncProvider);
providerSelect.addEventListener("change", syncProvider);
endpointInput.oninput=()=>{
  if (providerSelect.value === "custom") customEndpoint = endpointInput.value;
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
  clearModelList();
  spriteStatus();settings.close();print("Sprite disconnected. Use MUD verbs or !command.");
};
el<HTMLFormElement>("provider").onsubmit=e=>{
  e.preventDefault();
  syncProvider();
  try {
    const endpoint=completionURL(endpointInput.value.trim());
    const model=modelSelect.value || modelInput.value.trim();
    if (!model) throw Error("Enter the model ID supplied by your provider.");
    config={endpoint,model,key:keyInput.value.trim()};
    resetHistory=true;spriteStatus();settings.close();
    print("Sprite enabled. Speak naturally, or use !command to bypass the sprite.");
    input.focus();
  } catch(error) {el("settings-error").textContent=error instanceof Error ? error.message : "Invalid settings";}
};
syncProvider();
start();
