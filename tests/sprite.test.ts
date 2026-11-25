import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {createSession} from "../dist/session.js";
import {completionURL, listModels, modelsURL, playTurn} from "../src/sprite.ts";
import {defaultSpriteOptions} from "../src/sprite-options.ts";

test("accept base and full endpoint URLs",()=>{
  assert.equal(completionURL("https://example.org/api/v1/"),"https://example.org/api/v1/chat/completions");
  assert.equal(completionURL("http://localhost:8080/v1/chat/completions"),"http://localhost:8080/v1/chat/completions");
  assert.throws(()=>completionURL("http://example.org/v1"));
  assert.equal(modelsURL("https://api.groq.com/openai/v1"),"https://api.groq.com/openai/v1/models");
  assert.equal(modelsURL("https://api.openai.com/v1/chat/completions"),"https://api.openai.com/v1/models");
});

test("sprite turns use the configured HTTP provider and the existing expedition",async t=>{
  const requests = [];
  const answers: (string | number | {code:string; retryAfter?:string})[] = [];
  const server=createServer(async(req,res)=>{
    let text="";
    for await (const chunk of req) text+=chunk;
    requests.push({url:req.url,auth:req.headers.authorization,body:JSON.parse(text)});
    const answer=answers.shift();
    if (typeof answer === "object") {
      if (answer.retryAfter) res.setHeader("Retry-After",answer.retryAfter);
      res.writeHead(429,{"Content-Type":"application/json"});
      res.end(JSON.stringify({error:{code:answer.code,message:"Provider detail not for display"}}));
      return;
    }
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
  const direction = (await game.survey()).exits.find(exit=>exit.name==="archives").direction;
  answers.push(JSON.stringify({kind:"shell",value:"cd archives && cat letter.txt",raw:true}));
  assert.equal((await run("Go "+direction+" and read the letter")).output,game.scene.letter);
  assert.equal(game.cwd,"/expedition/archives");
  assert.equal(commands.at(-1),"cd archives && cat letter.txt");
  assert.match(requests.at(-1).body.messages[0].content,/Resolve directions and room titles using the supplied exits/);
  assert.doesNotMatch(requests.at(-1).body.messages[0].content,/"kind":"mud"/);
  answers.push('{"kind":"shell","value":"mkdir tower; cd tower"}',"You are in the tower.");
  assert.equal((await run("build a tower and enter it")).output,"You are in the tower.");
  assert.equal(game.cwd,"/expedition/archives/tower");
  assert.equal(commands.at(-1),"mkdir tower; cd tower");
  answers.push('{"kind":"shell","value":"echo once >> record; cat record"}',503);
  const failedSummary=await run("record a visit");
  assert.equal(failedSummary.offline,true);
  assert.match(failedSummary.output,/Command finished \(exit 0\)\.\nonce\n$/);
  assert.equal(await game.run("read record"),"once\n");
  const beforeLimit = requests.length;
  answers.push({code:"rate_limit_exceeded",retryAfter:"17"}, {code:"insufficient_quota",retryAfter:"30"}, 429);
  for (const message of [/Try again in 17 seconds/, /Check API billing and usage limits/, /Check API quota and usage limits/]) {
    const result = await run("make a room");
    assert.equal(result.offline,true);
    assert.match(result.output,message);
    assert.match(result.output,/No action ran/);
    assert.doesNotMatch(result.output,/Provider detail not for display/);
  }
  assert.equal(requests.length,beforeLimit+3);
  for(const answer of [401,"unstructured text",'{"kind":"mud","value":"!mkdir unexpected"}']){
    answers.push(answer);
    const failed=await run("make a room");
    assert.equal(failed.offline,true);assert.match(failed.output,/No action ran/);
  }
  assert.deepEqual((await game.survey()).exits,[]);

  const simple = {...config,options:{...defaultSpriteOptions,name:"Ember",maxTokens:256,historyTurns:0,
    roomEntries:1,summarize:false,temperature:0.25,effort:"low" as const,instructions:"Keep it brief."}};
  const beforeSimple = requests.length;
  const history = [{role:"user" as const,content:"Old prompt"}];
  answers.push('{"kind":"shell","value":"echo raw output"}');
  const raw = await playTurn(createSession(0),"Say something",simple,()=>{},history);
  assert.equal(raw.output,"raw output\n");
  assert.equal(requests.length,beforeSimple+1);
  const request = requests.at(-1).body;
  assert.equal(request.max_completion_tokens,256);
  assert.equal(request.reasoning_effort,"low");
  assert.equal(request.temperature,0.25);
  assert.equal(request.messages.length,2);
  assert.match(request.messages[0].content,/Keep it brief/);
  assert.match(request.messages[0].content,/You are "Ember"/);
  assert.equal(JSON.parse(request.messages[1].content).room.exits.length,1);
  assert.deepEqual(history,[]);
});

test("model listing reads the OpenAI-compatible data array",async t=>{
  let limited = false;
  const server=createServer((req,res)=>{
    assert.equal(req.url,"/v1/models");
    assert.equal(req.headers.authorization,"Bearer list-key");
    if (limited) {
      res.writeHead(429,{"Retry-After":"1"}).end();
      return;
    }
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({object:"list",data:[{id:"zeta",owned_by:"Z"},{id:"alpha",owned_by:"A"},{id:12}]}));
  }).listen(0,"127.0.0.1");
  await once(server,"listening");t.after(()=>server.close());
  const endpoint = "http://127.0.0.1:"+server.address().port+"/v1/chat/completions";
  const models=await listModels(endpoint,"list-key");
  assert.deepEqual(models.map(model=>model.id),["alpha","zeta"]);
  limited = true;
  await assert.rejects(listModels(endpoint,"list-key"),/Try again in 1 second\./);
});
