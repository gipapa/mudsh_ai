import { scenes } from "./en.ts";
import type { Room } from "./world.ts";
import { drawRegion } from "./panorama.ts";

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const input = el<HTMLInputElement>("command"), log = el("log"), dialog = document.querySelector("dialog")!;
let worker: Worker, busy = true, ended = false, timer = 0;
let history: string[] = [], cursor = 0;
function print(value:string, kind="") {
  if (!value) return;
  const pre=document.createElement("pre"); pre.className=kind; pre.textContent=value;
  log.append(pre); log.scrollTop=log.scrollHeight;
}
function controls() {
  input.disabled=busy||ended;
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
  busy=true;controls();worker.postMessage({line});
  timer=window.setTimeout(()=>fail("Interpreter stopped responding. Choose New expedition to restart."),10000);
}
function start(){
  worker?.terminate();clearTimeout(timer);busy=true;ended=false;controls();
  history=[];cursor=0;input.value="";log.replaceChildren();
  const seed=crypto.getRandomValues(new Uint32Array(1))[0], scene=scenes[seed%3];
  el("realm").textContent=scene.name;el("region").textContent=scene.region;
  el("seed").textContent="Map seed · "+seed.toString(16).padStart(8,"0").toUpperCase();
  drawRegion(document.querySelector("canvas")!,seed);
  worker=new Worker(new URL("./worker.js",import.meta.url),{type:"module"});
  worker.onerror=()=>fail("Unable to open the interpreter. Start a new expedition to retry.");
  let first=true;
  worker.onmessage=({data})=>{
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
start();
