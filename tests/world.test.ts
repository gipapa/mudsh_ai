import test from "node:test";
import assert from "node:assert/strict";
import {createSession} from "../dist/session.js";
import {route} from "../src/world.ts";
import {sceneForSeed} from "../src/en.ts";
test("both prefixes bypass the sprite and bare shell syntax never does", () => {
  for (const online of [true,false]) for (const prefix of ["!","！"]) assert.equal(route(prefix+"pwd",online),"shell");
  assert.equal(route("git status",true),"sprite"); assert.equal(route("git status",false),"mud");
});
for (const seed of [0,1,2,112]) test("room and shell stay synchronized, seed "+seed,async () => {
  const game = createSession(seed);
  const initial = await game.survey();
  assert.deepEqual(initial,await createSession(seed).survey());
  assert.match(await game.run("git status"),/sprite is offline/);
  await game.run("!mkdir tower");
  const expanded = await game.survey();
  for (const e of initial.exits) assert.deepEqual(expanded.exits.find(x=>x.name===e.name),e);
  await game.run("go tower");
  assert.equal(await game.run("！pwd"),"/expedition/tower\n");
  await game.run("back");
  const scene = sceneForSeed(seed);
  const exit = initial.exits.find(e=>e.name===scene.folders[0]);
  await game.run("go "+exit.direction);
  await game.survey();
  assert.match(await game.run("!ls -l"),/letter\.txt/);
  assert.equal(game.objectiveComplete,false);
  assert.equal(await game.run("read letter.txt"),scene.letter);
  assert.equal(game.objectiveComplete,true);
  assert.equal(game.ended,false);
  assert.equal(await game.run("!cat letter.txt | head -n 1"),scene.letter.split("\n")[0]+"\n");
  await game.run("!cd ../tower; PWD=/fake");
  assert.equal((await game.survey()).cwd,"/expedition/tower");
  await game.run("!echo hello > stone"); assert.equal(await game.run("read stone"),"hello\n");
  await game.run("quit"); assert.match(await game.run("!pwd"),/ended/);
});

test("the observatory can be solved using only MUD verbs, including a leading zero", async () => {
  const game = createSession(75);
  assert.equal(game.scene.name,"Tideglass Observatory");
  assert.match(await game.run("read field-note.txt"),/first two digits.*last two/);
  assert.match(await game.run("help"),/unlock CODE/);
  await game.run("go chartroom");
  const first = (await game.run("read star-chart.txt")).match(/([0-9]{2})\s*$/)?.[1];
  await game.run("back");
  await game.run("go tide-room");
  const last = (await game.run("read tide-ledger.txt")).match(/([0-9]{2})\s*$/)?.[1];
  const code = first + last;
  assert.match(code,/^0[0-9]{3}$/);
  assert.match(await game.run("unlock " + code),/no chest/);
  await game.run("back");
  await game.run("go vault");
  assert.match(await game.run("read chest.txt"),/locked/);
  assert.match(await game.run("unlock " + code.slice(1)),/four-digit/);
  assert.match(await game.run("unlock 9999"),/incorrect/);
  assert.match(await game.run("!cat chest.txt"),/locked/);
  assert.equal(game.objectiveComplete,false);
  assert.match(await game.run("unlock " + code),/Tideglass Lens/);
  assert.equal(game.objectiveComplete,true);
  assert.match(await game.run("!cat chest.txt"),/Tideglass Lens/);
});

test("the shell unlock command uses the current expedition's password and chest", async () => {
  const game = createSession(3);
  const attempted = await game.io.shell("cd vault && unlock 0036",game.cwd);
  assert.notEqual(attempted.exitCode,0);
  assert.match(attempted.stderr,/incorrect/);
  assert.equal(game.objectiveComplete,false);

  const result = await game.io.shell("cd vault && unlock 3237 && cat chest.txt",game.cwd);
  assert.equal(result.exitCode,0);
  assert.equal(result.cwd,"/expedition/vault");
  assert.match(result.stdout,/Tideglass Lens/);
  assert.equal(game.objectiveComplete,true);
  game.move(result.cwd);
  assert.match(await game.run("read chest.txt"),/Tideglass Lens/);
  assert.match(await createSession(3).run("read vault/chest.txt"),/locked/);
});
