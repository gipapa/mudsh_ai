import { sceneForSeed } from "./en.ts";

// A seeded pixel illustration of the current region, drawn once per expedition.
export function drawRegion(canvas: HTMLCanvasElement, seed: number) {
  canvas.width=640; canvas.height=128;
  const ctx=canvas.getContext("2d");
  if (!ctx) return;
  let state=seed;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const {id} = sceneForSeed(seed);
  const palette={
    castle: ["#1d383b","#627a68","#d9c79a","#465e54","#334d46","#203933"],
    dungeon: ["#242d41","#677085","#e1cfab","#4d5966","#374454","#252f40"],
    mine: ["#393435","#9a7052","#efc387","#78664e","#544e40","#333b32"],
    observatory: ["#172c48","#79778b","#f0d9b3","#566575","#354b64","#1d2e44"],
  }[id];
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{
    ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);
  };
  for(let y=0;y<128;y+=4) {
    const g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,palette[0]);g.addColorStop(1,palette[1]);
    ctx.fillStyle=g;ctx.fillRect(0,y,640,4);
  }
  for(let i=0;i<110;i++)rect(random()*640,random()*84,1,1,palette[2]);
  for(let y=-15;y<=15;y++){const w=Math.floor(Math.sqrt(225-y*y));rect(536-w,34+y,2*w,1,palette[2]);}
  for(let layer=0;layer<3;layer++){
    let top=70+layer*14,goal=top;
    for(let x=0;x<640;x+=2){
      if(x%32===0)goal=48+layer*19+random()*31;
      top+=(goal-top)*.10+(random()-.48)*2;
      rect(x,top,2,128,palette[3+layer]);
      if(random()<.3)rect(x,top+2,1,2,palette[Math.max(1,2+layer)]);
    }
  }
  const stone=palette[5], glow=palette[2];
  if(id==="castle"){
    for(const [x,y,w] of [[413,64,18],[449,51,22],[489,68,16]]){
      rect(x,y,w,49,stone);
      for(let i=0;i<w;i+=6)rect(x+i,y-4,3,5,stone);
      rect(x+w/2-1,y+7,2,4,glow);
      rect(x+w/2,y-17,1,13,stone);rect(x+w/2,y-17,9,4,palette[2]);
    }
    rect(421,81,80,28,stone);for(let x=423;x<500;x+=8)rect(x,78,4,4,stone);
  }else if(id==="dungeon"){
    for(let x=0;x<640;x+=2){const n=Math.abs(Math.sin(x*.045)*Math.sin(x*.082));rect(x,0,2,5+n*28,stone);}
    for(let i=0;i<5;i++){const x=412+i*22;rect(x,70,8,40,stone);rect(x-3,67,14,4,stone);rect(x+1,79,2,5,glow);}
    rect(408,61,107,7,stone);
  }else if(id==="mine"){
    for(let i=0;i<4;i++){rect(403+i*28,75-i*5,5,45,stone);rect(400+i*28,73-i*5,34,5,stone);}
    rect(447,89,20,8,stone);rect(450,97,3,3,stone);rect(462,97,3,3,stone);rect(485,68,3,4,glow);
  }else{
    rect(430,78,70,36,stone);rect(423,75,84,5,stone);
    for(let y=0;y<25;y++){
      const width=Math.floor(Math.sqrt(625-y*y));
      rect(465-width,75-y,width*2,1,stone);
    }
    for(let i=0;i<23;i++)rect(469+i,56-i*.55,2,5,stone);
    rect(491,43,5,5,glow);
    for(const x of [442,462,482])rect(x,87,5,9,glow);
  }
  for(let i=0;i<190;i++){const x=random()*640,y=108+random()*20;rect(x,y,1+Math.floor(random()*4),1,palette[4]);}
}
