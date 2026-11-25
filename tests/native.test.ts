import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { campaignRooms } from "../src/campaign.ts";
import { solutions } from "./dungeon-solutions.ts";

const launcher = fileURLToPath(new URL("../bin/mudsh", import.meta.url));

test("the native launcher runs normal Bash in the caller's filesystem", t => {
  const workspace = mkdtempSync(join(tmpdir(), "mudsh-host-"));
  t.after(() => rmSync(workspace, {recursive:true, force:true}));
  const result = spawnSync(launcher, ["-c",
    'mkdir work && cd work && value="$BASH_VERSION" && printf "%s\n" "$value" > version && cat version'],
    {cwd:workspace, encoding:"utf8"});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\d+\.\d+/);
});

test("the native state keeps room changes and restores progress", t => {
  const workspace = mkdtempSync(join(tmpdir(), "mudsh-save-"));
  t.after(() => rmSync(workspace, {recursive:true, force:true}));
  const cli = fileURLToPath(new URL("../dist-native/game.mjs", import.meta.url));
  const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [cli, ...args],
    {cwd, env:{...process.env, MUDSH_GAME_ROOT:workspace}, encoding:"utf8"});
  const resume = run(workspace, "resume");
  assert.equal(resume.status, 0, resume.stderr);
  const first = resume.stdout.trim();
  const wrong = run(first, "submit", "wrong");
  assert.equal(wrong.status, 1);
  const found = spawnSync(launcher, ["-c", solutions[0]], {cwd:first, encoding:"utf8"});
  assert.equal(found.status, 0, found.stderr);
  const passed = run(first, "submit", found.stdout.trim());
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Objective complete!/);
  writeFileSync(join(first, "practice.txt"), "next time\n");
  const next = run(workspace, "resume");
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, /02-scriptorium/);
  assert.match(run(first, "submit", found.stdout.trim()).stderr, /already complete/);
  assert.equal(spawnSync(launcher, ["-c","cat practice.txt"], {cwd:first, encoding:"utf8"}).stdout, "next time\n");
});

test("Docker Bash solves all rooms and keeps host files and networking outside the game", {
  skip: !process.env.MUDSH_TEST_DOCKER,
}, t => {
  const profile = "verify-" + process.pid;
  const workspace = mkdtempSync(join(tmpdir(), "mudsh-outside-"));
  t.after(() => {
    spawnSync("docker", ["volume", "rm", "mudsh-ai-save-" + profile], {stdio:"ignore"});
    rmSync(workspace, {recursive:true, force:true});
  });
  const marker = join(workspace, "host.txt");
  writeFileSync(marker, "outside\n");
  const run = (script: string) => spawnSync(launcher, ["play","-c", script,"test",marker], {
    env:{...process.env, MUDSH_PROFILE:profile}, encoding:"utf8", timeout:60000,
  });
  const checks = [
    'set -euo pipefail',
    '[[ $UID -ne 0 && ! -e "$1" && ! -e /var/run/docker.sock ]]',
    '[[ $(awk \'NR>1 {print $1}\' /proc/net/route) == "" ]]',
    '[[ $(awk \'$2=="/" {print $4}\' /proc/mounts) == ro,* ]]',
    '[[ $(awk \'/^NoNewPrivs:/ {print $2}\' /proc/self/status) == 1 ]]',
    '[[ $(awk \'/^CapEff:/ {print $2}\' /proc/self/status) == 0000000000000000 ]]',
    '[[ $PWD == /expedition/01-watch-office && ! -e ../02-scriptorium ]]',
    'if mudsh submit wrong; then exit 8; fi',
    'if mudsh next; then exit 9; fi',
  ];
  for (const [index, solution] of solutions.entries()) {
    const room = campaignRooms[index];
    checks.push(`[[ "$PWD" == /expedition/${room.id} ]]`);
    if (room.output) {
      checks.push("if mudsh check; then exit 10; fi", solution, "mudsh check");
    } else {
      checks.push(`answer=$( { ${solution}; } | tail -n 1 )`, 'mudsh submit "$answer"');
    }
    if (index + 1 < campaignRooms.length) checks.push("mudsh next");
  }
  checks.push("mudsh progress");
  const result = run(checks.join("\n"));
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + "\n" + result.stderr);
  assert.equal(result.stdout.match(/Objective complete!/g)?.length, campaignRooms.length);
  assert.match(result.stdout, /13\/13 rooms cleared/);
  const reopen = run('pwd; mudsh progress');
  assert.equal(reopen.status, 0, reopen.stderr);
  assert.match(reopen.stdout, /^\/expedition\/13-scout-post/m);
  assert.match(reopen.stdout, /13\/13 rooms cleared/);
});
