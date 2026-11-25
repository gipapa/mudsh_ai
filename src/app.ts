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
const providers = {openai:"https://api.openai.com/v1",groq:"https://api.groq.com/openai/v1"} as const;
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
sprite.onclick=()=>{el("settings-error").textContent="";settings.showModal();};
el<HTMLSelectElement>("provider-select").onchange=e=>{
  const provider=(e.target as HTMLSelectElement).value as keyof typeof providers;
  if (provider in providers) el<HTMLInputElement>("endpoint").value=providers[provider];
  el<HTMLInputElement>("model").value="";
  el("model-options").replaceChildren();
  el("model-status").textContent="";
};
el("fetch-models").onclick=async()=>{
  const button=el<HTMLButtonElement>("fetch-models"), status=el("model-status");
  button.disabled=true;status.textContent="Loading models…";
  try {
    const models=await listModels(el<HTMLInputElement>("endpoint").value.trim(),el<HTMLInputElement>("key").value.trim());
    const options=el("model-options");options.replaceChildren(...models.map(model=>{
      const option=document.createElement("option");option.value=model.id;option.label=model.ownedBy ? model.id+" · "+model.ownedBy : model.id;return option;
    }));
    status.textContent=models.length+" models loaded. You can still type another model ID.";
    if (!el<HTMLInputElement>("model").value && models[0]) el<HTMLInputElement>("model").value=models[0].id;
  } catch(error) {status.textContent=error instanceof Error ? error.message+" Type a model ID manually." : "Could not load models. Type a model ID manually.";}
  finally {button.disabled=false;}
};
el("dismiss").onclick=()=>settings.close();
el("disconnect").onclick=()=>{
  config=undefined;el<HTMLInputElement>("key").value="";resetHistory=true;
  spriteStatus();settings.close();print("Sprite disconnected. Use MUD verbs or !command.");
};
el<HTMLFormElement>("provider").onsubmit=e=>{
  e.preventDefault();
  try {
    const endpoint=completionURL(el<HTMLInputElement>("endpoint").value.trim());
    const model=el<HTMLInputElement>("model").value.trim();
    if (!model) throw Error("Enter the model ID supplied by your provider.");
    config={endpoint,model,key:el<HTMLInputElement>("key").value.trim()};
    resetHistory=true;spriteStatus();settings.close();
    print("Sprite enabled. Speak naturally, or use !command to bypass the sprite.");
    input.focus();
  } catch(error) {el("settings-error").textContent=error instanceof Error ? error.message : "Invalid settings";}
};
start();
