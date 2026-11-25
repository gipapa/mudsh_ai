import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { solutions } from "./dungeon-solutions.ts";

const launcher = fileURLToPath(new URL("../bin/mudsh",import.meta.url));
type Reply = {kind: "shell" | "reply"; value: string; raw?: boolean} |
  {script: string; show?: boolean} | number | string;

async function fixture(t: TestContext) {
  const cwd = mkdtempSync(join(tmpdir(),"mudsh-sprite-"));
  t.after(() => rmSync(cwd,{recursive:true,force:true}));
  const env = {...process.env, XDG_CONFIG_HOME:join(cwd,"config")};
  mkdirSync(join(env.XDG_CONFIG_HOME,"mudsh-ai"),{recursive:true});
  const config = join(env.XDG_CONFIG_HOME,"mudsh-ai","sprite.json");
  const replies: Reply[] = [];
  const requests: {url: string; auth: string | undefined; body: any}[] = [];
  const server = createServer(async (req,res) => {
    let data = "";
    for await (const chunk of req) data += chunk;
    const body = data ? JSON.parse(data) : undefined;
    requests.push({url:req.url!,auth:req.headers.authorization,body});
    if (req.method === "GET") {
      res.end(JSON.stringify({data:[{id:"fixture"}]}));
      return;
    }
    const reply = replies.shift();
    if (typeof reply === "number" || reply === undefined) {
      res.setHeader("Retry-After","12");
      res.writeHead(reply ?? 500).end();
      return;
    }
    if (body.stream) {
      const tool = typeof reply === "object";
      const delta = tool ? {tool_calls:[{index:0,id:"call_" + requests.length,type:"function",
        function:{name:"shell",arguments:JSON.stringify(reply)}}]} : {content:reply};
      const chunk = (delta: object, finish_reason: string | null) => "data: " + JSON.stringify({
        id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",
        choices:[{index:0,delta,finish_reason}],
      }) + "\n\n";
      res.setHeader("Content-Type","text/event-stream");
      res.end(chunk({role:"assistant",...delta},null) + chunk({},tool ? "tool_calls" : "stop") + "data: [DONE]\n\n");
      return;
    }
    res.end(JSON.stringify({choices:[{finish_reason:"stop",message:{content:typeof reply === "string" ? reply : JSON.stringify(reply)}}]}));
  }).listen(0,"127.0.0.1");
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server,"listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  writeFileSync(config,JSON.stringify({endpoint:`http://127.0.0.1:${address.port}/v1`,model:"fixture",
    key:"fixture-key",options:{name:"Ember"}}),{mode:0o600});
  async function run(lines: string[], args: string[] = [], overrides: NodeJS.ProcessEnv = {}) {
    const child = spawn(launcher,args,{cwd,env:{...env,...overrides},timeout:45000,stdio:"pipe"});
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data",part => { stdout += part; });
    child.stderr.setEncoding("utf8").on("data",part => { stderr += part; });
    child.stdin.end(lines.join("\n") + "\n");
    const [code] = await once(child,"close");
    assert.equal(code,0,stderr + "\n" + stdout);
    return stdout;
  }
  return {cwd,config,requests,replies,run};
}

test("native input routes commands, local MUD verbs and simple sprite turns through the same Bash", async t => {
  const {cwd,config,requests,replies,run} = await fixture(t);
  mkdirSync(join(cwd,"library"));
  writeFileSync(join(cwd,"library","note.txt"),"Exact File Text\n");
  assert.equal((await run([],["sprite","models"])).trim(),"fixture");
  assert.equal(requests[0].url,"/v1/models");
  assert.doesNotMatch(await run([],["sprite","show"]),/fixture-key/);
  assert.equal(statSync(config).mode & 0o777,0o600);

  replies.push(429,{kind:"shell",value:"cd library; greeting=ember; cat note.txt",raw:true},
    {kind:"shell",value:"printf '%s' \"$greeting\""},"Ember is ready.",503);
  const output = await run([
    "!number=37", "Try again after a rate limit", "Look in the library and read the note", "！pwd",
    "Summarize the greeting", "!printf 'shared=%s:%s\\n' \"$number\" \"$greeting\"",
    "The provider now fails", "read note.txt", "back", "ls", "!false", "look",
    "!printf 'status=%s\\n' \"$?\"", "quit",
  ]);
  assert.match(output,/Ember ❯ .*Try again in 12 seconds/);
  assert.match(output,/Ember ❯ cd library; greeting=ember; cat note\.txt/);
  assert.match(output,/Ember ❯ Exact File Text/);
  assert.ok(output.includes(join(cwd,"library")));
  assert.match(output,/shared=37:ember/);
  assert.match(output,/Ember ❯ Ember is ready\./);
  assert.match(output,/Ember ❯ .*Ember is offline/);
  assert.match(output,/^Exact File Text$/m);
  assert.match(output,/Use a MUD verb/);
  assert.match(output,/status=1/);
  assert.equal(requests.length,6);
  assert.ok(requests.every(({auth}) => auth === "Bearer fixture-key"));
  assert.match(requests[1].body.messages[0].content,/persistent Bash session/);
  assert.equal(JSON.parse(requests[4].body.messages.at(-1).content).stdout,"ember");
});

test("native Pi Core sees each action result and persists the resulting directory", async t => {
  const {cwd,requests,replies,run} = await fixture(t);
  await run([],["sprite","set","mode","advanced"]);
  await run([],["sprite","set","maxSteps","2"]);
  replies.push({script:"mkdir tower; cd tower; printf 'first\\n' > note.txt"},
    {script:"cat note.txt",show:true},"The tower is ready.");
  const output = await run(["Prepare a tower", "!pwd", "/sprite off", "read note.txt", "quit"]);
  assert.match(output,/Ember ❯ mkdir tower; cd tower/);
  assert.match(output,/Ember ❯ cat note\.txt\nfirst/);
  assert.match(output,/Ember ❯ The tower is ready\./);
  assert.ok(output.includes(join(cwd,"tower")));
  assert.equal(requests.length,3);
  assert.match(requests[1].body.messages.at(-1).content,/Current path: .*\/tower/);
  assert.match(requests[2].body.messages.at(-1).content,/first/);
});

test("the native sprite plays a room while the dungeon Bash remains isolated", {
  skip: !process.env.MUDSH_TEST_DOCKER,
}, async t => {
  const {cwd,requests,replies,run} = await fixture(t);
  const profile = "sprite-verify-" + process.pid;
  t.after(() => spawnSync("docker",["volume","rm","mudsh-ai-save-" + profile],{stdio:"ignore"}));
  writeFileSync(join(cwd,"host-only"),"outside");
  replies.push({kind:"shell",value:`mudsh submit "$( ${solutions[0]} )" && mudsh next`,raw:true});
  const output = await run([
    `!test ! -e "${join(cwd,"host-only")}" && test -z "$(awk 'NR>1' /proc/net/route)" && echo isolated`,
    "Find the seal, submit it and enter the next room", "!pwd", "/sprite off", "progress", "quit",
  ],["play"],{MUDSH_PROFILE:profile});
  assert.match(output,/^isolated$/m);
  assert.match(output,/Ember ❯ Objective complete!/);
  assert.match(output,/\/expedition\/02-scriptorium/);
  assert.match(output,/1\/13 rooms cleared/);
  assert.equal(requests.length,1);
  assert.match(requests[0].body.messages[0].content,/isolated dungeon/);
});
