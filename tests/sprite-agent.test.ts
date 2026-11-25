import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {createSession} from "../dist/session.js";
import {playAdvancedTurn} from "../src/sprite-agent.ts";
import {defaultSpriteOptions} from "../src/sprite-options.ts";

test("Pi uses tool results to continue a goal and stops after action limits or errors",async t=>{
  const requests = [];
  const replies: ({name:string; args:Record<string,unknown>} | string | number)[] = [];
  const server = createServer(async (req,res)=>{
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({url:req.url, auth:req.headers.authorization, body:JSON.parse(body)});
    const reply = replies.shift();
    if (reply === undefined || typeof reply === "number") {
      res.setHeader("Retry-After","17");
      res.writeHead(reply ?? 500).end();
      return;
    }
    const delta = typeof reply === "string" ? {content:reply} : {
      tool_calls:[{index:0,id:"call_"+requests.length,type:"function",
        function:{name:reply.name,arguments:JSON.stringify(reply.args)}}],
    };
    const chunk = (delta,finish_reason) => "data: "+JSON.stringify({
      id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",
      choices:[{index:0,delta,finish_reason}],
    })+"\n\n";
    res.setHeader("Content-Type","text/event-stream");
    res.end(chunk({role:"assistant",...delta},null) +
      chunk({},typeof reply === "string" ? "stop" : "tool_calls") + "data: [DONE]\n\n");
  }).listen(0,"127.0.0.1");
  await once(server,"listening");
  t.after(()=>server.close());

  const config = {endpoint:"http://127.0.0.1:"+server.address().port+"/v1",key:"",model:"fixture",
    options:{...defaultSpriteOptions,mode:"advanced" as const,maxSteps:2,maxTokens:256,toolResultChars:128}};
  const game = createSession(0);
  const log: {stage:string; text?:string}[] = [];
  const history = [];
  const run = () => playAdvancedTurn(game,"Read the letter and bring me to a tower.",config,
    (stage,text)=>log.push({stage,text}),history);

  replies.push({name:"mud",args:{command:"read archives/letter.txt",show:true}},
    {name:"shell",args:{script:"mkdir tower; cd tower"}}, "I found the letter and entered the tower.");
  assert.equal((await run()).output,"I found the letter and entered the tower.");
  assert.equal(requests[0].url,"/v1/chat/completions");
  assert.equal(requests[0].auth,undefined);
  assert.equal(requests[0].body.max_completion_tokens,256);
  assert.equal(requests[0].body.stream,true);
  assert.equal(requests[1].body.messages.at(-1).role,"tool");
  assert.match(requests[1].body.messages.at(-1).content,/Keeper,/);
  assert.match(requests[2].body.messages.at(-1).content,/Current path: \/expedition\/tower/);
  assert.equal(game.cwd,"/expedition/tower");
  assert.deepEqual(log.filter(item=>item.stage==="output").map(item=>item.text),[game.scene.letter]);
  assert.equal(history.length,2);

  config.options.maxSteps = 1;
  replies.push({name:"shell",args:{script:"echo once >> record; cat record"}},
    {name:"shell",args:{script:"echo twice >> record"}});
  assert.match((await run()).output,/action limit/);
  assert.equal(await game.run("read record"),"once\n");

  replies.push({name:"shell",args:{script:"echo again >> record; cat record"}},429);
  const failed = await run();
  assert.equal(failed.offline,true);
  assert.match(failed.output,/Try again in 17 seconds/);
  assert.match(failed.output,/Completed actions remain/);
  assert.equal(await game.run("read record"),"once\nagain\n");
  assert.equal(requests.length,7);
});
