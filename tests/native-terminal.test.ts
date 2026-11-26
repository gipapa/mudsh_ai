import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";

const launcher = fileURLToPath(new URL("../bin/mudsh",import.meta.url));
const loginLauncher = fileURLToPath(new URL("../bin/login/mudsh",import.meta.url));
const prompt = /mudsh \[[^\r\n]+\] ❯ /u;

function fixture(t: TestContext, file: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const cwd = mkdtempSync(join(tmpdir(),"mudsh-terminal-"));
  const child = spawn(file,args,{cwd, cols:100, rows:24, env:{...process.env,
    TERM:"xterm-256color", HISTFILE:"/dev/null", INPUTRC:"/dev/null",
    BASH_SILENCE_DEPRECATION_WARNING:"1", XDG_CONFIG_HOME:join(cwd,"config"), ...env}});
  let output = "";
  let offset = 0;
  child.onData(data => { output += data; });
  let done = false;
  const exited = new Promise<number>(resolve => child.onExit(({exitCode}) => {
    done = true;
    resolve(exitCode);
  }));
  t.after(() => {
    if (!done) child.kill();
    rmSync(cwd,{recursive:true,force:true});
  });
  const wait = async (pattern: RegExp) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const visible = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\r/gu,"");
      const match = pattern.exec(visible.slice(offset));
      if (match) {
        offset += match.index + match[0].length;
        return;
      }
      if (done) break;
      await delay(25);
    }
    assert.fail(`Expected ${pattern} in terminal output\n${output}`);
  };
  return {cwd, wait, send:(text: string) => child.write(text), exited};
}

async function verifyJobs(session: ReturnType<typeof fixture>) {
  const {send,wait} = session;
  // Print a marker once the job has the terminal so Ctrl-Z cannot race Bash startup.
  send("!sh -c 'printf \"%s\\n\" foreground-ready; exec sleep 30'\r");
  await wait(/\nforeground-ready\n/u);
  send("\x1a");
  await wait(/Stopped/u);
  await wait(prompt);
  send("!jobs\r");
  await wait(/Stopped/u);
  await wait(prompt);
  send("!bg\r");
  await wait(/\[1\]\+ .*sleep 30.*&/u);
  await wait(prompt);
  send("!fg\r");
  await wait(/\nsh -c .*sleep 30/u);
  send("\x03");
  await wait(prompt);
  send('!printf "status=%s\\n" "$?"\r');
  await wait(/\nstatus=130\n/u);
  await wait(prompt);
}

test("the MUD terminal delegates Tab and job control to the same live Bash", {timeout:25000}, async t => {
  const session = fixture(t,launcher,[]);
  const {cwd,send,wait,exited} = session;
  mkdirSync(join(cwd,"library"));
  writeFileSync(join(cwd,"library","rare note.txt"),"file completion worked\n");
  await wait(prompt);
  send("go lib\t\r");
  await wait(/mudsh \[library\] ❯ /u);
  send("！cat rar\t\r");
  await wait(/\nfile completion worked\n/u);
  await wait(prompt);
  send("read rare no\t\r");
  await wait(/\nfile completion worked\n/u);
  await wait(prompt);
  send("!_mudsh_test_complete() { COMPREPLY=(nightwatch); }; complete -F _mudsh_test_complete printf\r");
  await wait(prompt);
  send("!printf nightw\t\r");
  await wait(/\nnightwatch\n/u);
  await wait(prompt);
  await verifyJobs(session);
  send("!exit 7\r");
  assert.equal(await exited,7);
});

test("the chsh entry point opens Bash in login mode and accepts shell command arguments", {timeout:10000}, async t => {
  const account = mkdtempSync(join(tmpdir(),"mudsh-login-test-"));
  t.after(() => rmSync(account,{recursive:true,force:true}));
  writeFileSync(join(account,".bash_profile"),"mudsh_test_profile=login-profile-loaded\n");
  writeFileSync(join(account,".bash_logout"),"printf '%s\\n' login-logout-ran\n");
  const {send,wait,exited} = fixture(t,loginLauncher,[],{HOME:account, PATH:"/usr/bin:/bin"});
  await wait(prompt);
  send('!shopt -q login_shell && printf "%s\\n" "$mudsh_test_profile"\r');
  await wait(/\nlogin-profile-loaded\n/u);
  await wait(prompt);
  send("quit\r");
  await wait(/\nlogin-logout-ran\n/u);
  assert.equal(await exited,0);
  const command = spawnSync(loginLauncher,["-c",'printf "%s" "$1"',"mudsh","remote command"],{encoding:"utf8"});
  assert.equal(command.status,0,command.stderr);
  assert.equal(command.stdout,"remote command");
});

test("the isolated dungeon has native completion and foreground jobs", {
  skip:!process.env.MUDSH_TEST_DOCKER, timeout:30000,
}, async t => {
  const profile = "terminal-verify-" + process.pid;
  const session = fixture(t,launcher,["play"],{MUDSH_PROFILE:profile});
  t.after(() => {
    spawnSync("docker",["rm","-f","mudsh-ai-" + profile],{stdio:"ignore"});
    spawnSync("docker",["volume","rm","mudsh-ai-save-" + profile],{stdio:"ignore"});
  });
  await session.wait(/mudsh \[The Watch Office\] ❯ /u);
  session.send("!cat obj\t | head -n 1\r");
  await session.wait(/\nThe Watch Office\n/u);
  await session.wait(prompt);
  await verifyJobs(session);
  session.send("quit\r");
  assert.equal(await session.exited,0);
});
