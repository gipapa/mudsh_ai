import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {createSession} from "../dist/session.js";
import {completionURL, playTurn} from "../src/sprite.ts";

test("accept base and full endpoint URLs",()=>{
  assert.equal(completionURL("https://example.org/api/v1/"),"https://example.org/api/v1/chat/completions");
  assert.equal(completionURL("http://localhost:8080/v1/chat/completions"),"http://localhost:8080/v1/chat/completions");
  assert.throws(()=>completionURL("http://example.org/v1"));
});

test("sprite turns use the configured HTTP provider and the existing expedition",async t=>{
  const requests = [];
  const answers: (string | number)[] = [];
  const server=createServer(async(req,res)=>{
    let text="";
    for await (const chunk of req) text+=chunk;
    requests.push({url:req.url,auth:req.headers.authorization,body:JSON.parse(text)});
    const answer=answers.shift();
    if(typeof answer !== "string"){res.writeHead(answer ?? 500).end();return;}
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({choices:[{message:{role:"assistant",content:answer},finish_reason:"stop"}]}));
  }).listen(0,"127.0.0.1");
  await once(server,"listening");
  t.after(()=>server.close());
  const config={endpoint:"http://127.0.0.1:"+server.address().port+"/v1",model:"fixture",key:"demo-only"};
  const game=createSession(0);
  const commands:string[]=[];
  const run=(line:string)=>playTurn(game,line,config,(_,command)=>{if(command)commands.push(command);});
  assert.equal((await run("！pwd")).output,"/expedition\n");
  assert.equal(requests.length,0);
  answers.push('{"kind":"reply","value":"Hello, traveler!"}');
  assert.equal((await run("Hi")).output,"Hello, traveler!");
  assert.equal(requests[0].url,"/v1/chat/completions");
  assert.equal(requests[0].auth,"Bearer demo-only");
  assert.equal(requests[0].body.model,"fixture");
  assert.match(requests[0].body.messages.at(-1).content,/The Gatehouse/);
  answers.push('{"kind":"mud","value":"go archives"}','{"kind":"mud","value":"read letter.txt"}');
  await run("visit the archive");
  assert.equal((await run("read the letter")).output,game.scene.letter);
  answers.push('{"kind":"shell","value":"mkdir tower; cd tower"}',"You are in the tower.");
  assert.equal((await run("build a tower and enter it")).output,"You are in the tower.");
  assert.equal(game.cwd,"/expedition/archives/tower");
  assert.equal(commands.at(-1),"!mkdir tower; cd tower");
  answers.push('{"kind":"shell","value":"echo once >> record; cat record"}',503);
  const failedSummary=await run("record a visit");
  assert.equal(failedSummary.offline,true);
  assert.match(failedSummary.output,/Command finished \(exit 0\)\.\nonce\n$/);
  assert.equal(await game.run("read record"),"once\n");
  for(const answer of [401,"unstructured text",'{"kind":"mud","value":"!mkdir unexpected"}']){
    answers.push(answer);
    const failed=await run("make a room");
    assert.equal(failed.offline,true);assert.match(failed.output,/No action ran/);
  }
  assert.deepEqual((await game.survey()).exits,[]);
});
