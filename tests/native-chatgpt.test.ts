import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { highlightWorldText } from "../src/object-text.ts";
import { campaignRooms } from "../src/campaign.ts";

test("room references include the whole name and leave surrounding punctuation plain", () => {
  const mark = (text: string) => highlightWorldText(text, value => "[" + value + "]");
  assert.equal(mark(campaignRooms[0].task),"Find [night-orders.txt] somewhere under [records/]. Read it and submit the flag inside.");
  assert.equal(mark("Read .dusk-seal, dispatch.tar.gz and copies/receipt.txt."),
    "Read [.dusk-seal], [dispatch.tar.gz] and [copies/receipt.txt].");
  assert.equal(mark("east-southeast · [manuscripts]\nback · [The Watch Office]"),
    "east-southeast · [[manuscripts]]\nback · [[The Watch Office]]");
});

test("the host shell connects through Codex and reuses its login on subsequent sessions", t => {
  const launcher = fileURLToPath(new URL("../bin/mudsh",import.meta.url));
  const account = mkdtempSync(join(tmpdir(),"mudsh-chatgpt-"));
  t.after(() => rmSync(account,{recursive:true,force:true}));
  const env = {...process.env, HOME:account, XDG_CONFIG_HOME:account, PATH:account + ":" + process.env.PATH};
  const run = (args: string[], input = "") => spawnSync(launcher,["chatgpt",...args],{cwd:account,env,input,encoding:"utf8",timeout:15000});
  writeFileSync(join(account,"codex"),`#!/bin/sh
if [ "$1" = login ]; then
  if [ "$2" = status ]; then
    [ -f "$HOME/signed-in" ] || { echo "Logged in using an API key" >&2; exit 0; }
    echo "Logged in using ChatGPT" >&2
  else
    echo "$1 $2" >> "$HOME/logins"
    touch "$HOME/signed-in"
  fi
elif [ "$1" = exec ]; then
  cat > "$HOME/request.json"
  echo '{"kind":"shell","value":"greeting=hello; echo connected","raw":true}'
else exit 1
fi
`,{mode:0o755});
  assert.equal(run(["status"]).status,1);
  assert.equal(run(["login","--device-auth"]).status,0);
  assert.equal(run(["login"]).status,0);
  assert.equal(readFileSync(join(account,"logins"),"utf8"),"login --device-auth\n");
  assert.equal(run(["status"]).status,0);
  const result = run([],"Greet me\n!echo state=$greeting\n/sprite off\nquit\n");
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/ChatGPT ❯ connected/);
  assert.match(result.stdout,/state=hello/);
  assert.match(readFileSync(join(account,"request.json"),"utf8"),/Greet me/);
});
