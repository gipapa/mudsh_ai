import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createDungeon } from "../dist/session.js";
import { campaignRooms, roomFiles, roomFlag } from "../src/campaign.ts";
import { gpsCoordinates } from "../src/campaign-artifacts.ts";
import { solutions } from "./dungeon-solutions.ts";

test("all 13 browser rooms open in order and verify answers and extracted files", async () => {
  const game = await createDungeon({seed:42, completed:0});
  assert.equal(campaignRooms.length, solutions.length);
  assert.equal((await game.survey()).title, campaignRooms[0].title);
  assert.match(await game.run("next"), /Solve this room/);
  assert.doesNotMatch(await game.run("!ls /expedition"), /02-scriptorium/);

  for (const [index, script] of solutions.entries()) {
    const room = campaignRooms[index];
    assert.equal(game.cwd, `/expedition/${room.id}`);
    assert.match(await game.run("read objective.txt"), new RegExp(room.title));
    assert.equal(game.save.completed, index);
    assert.match(await game.run(room.output ? "check" : "submit wrong"), /missing|does not open/);
    assert.deepEqual(game.completions, []);
    const result = await game.io.shell(script, game.cwd);
    assert.equal(result.exitCode, 0, room.title + "\n" + result.stderr);
    if (index === 7) assert.match(result.stdout, /text/i);
    if (index === 8) assert.match(result.stdout, /dispatch\.txt/);
    const answer = result.stdout.trim().split("\n").at(-1);
    const submit = room.output ? "!mudsh check" : "!mudsh submit " + answer;
    assert.match(await game.run(submit), /Next room opened|All rooms cleared/, room.title + "\n" + result.stdout);
    assert.equal(game.save.completed, index + 1);
    assert.deepEqual(game.completions.splice(0), [room.ending]);
    assert.match(await game.run(submit), /already complete/);
    if (index + 1 < solutions.length) {
      const moved = await game.run("next");
      assert.equal(moved, await game.run("look"));
      assert.match(moved, /Objects: .*objective\.txt/);
    }
  }
  assert.match(await game.run("progress"), /13\/13 rooms cleared/);
  assert.equal(game.ended, false);
});

test("browser navigation prints the full survey and assigns directions beyond the compass points", async () => {
  const game = await createDungeon({seed:42, completed:0});
  const start = await game.run("look");
  assert.doesNotMatch(start, /^back · /m);
  assert.match(await game.run("go back"), /first room/);

  const records = await game.run("go records");
  assert.equal(records, await game.run("look"));
  assert.equal(records + "\n", await game.run("!mudsh look"));
  assert.match(records, /^[a-z-]+ · \[day\]$/m);
  assert.match(records, /^back · \[01-watch-office\]$/m);
  const day = await game.run("Go day");
  assert.equal(day, await game.run("look"));
  assert.match(day, /^back · \[records\]$/m);
  assert.equal(await game.run("go back"), records);
  assert.equal(await game.run("back"), start);

  await game.run("!mkdir " + Array.from({length:24}, (_, index) => "test-" + index).join(" "));
  const {exits} = await game.survey();
  const directions = new Set(exits.map(exit => exit.direction));
  assert.equal(directions.size, exits.length);
  for (const direction of ["north", "east", "south", "west", "southeast", "east-southeast"]) {
    assert.ok(directions.has(direction), direction);
  }
  const refined = exits.find(exit => exit.direction.split("-").length > 2);
  assert.ok(refined);
  assert.equal(await game.run("go " + refined.direction.toUpperCase()), await game.run("look"));
  assert.equal((await game.survey()).cwd, "/expedition/01-watch-office/" + refined.name);
});

test("the browser restores fixed room progress and keeps the same clues", async () => {
  const seed = 42;
  const start = await createDungeon({seed, completed:0});
  const answer = (await start.run("!" + solutions[0])).trim();
  await start.run("submit " + answer);
  const resume = await createDungeon(start.save);
  assert.equal(resume.cwd, "/expedition/02-scriptorium");
  assert.match(await resume.run("!ls /expedition"), /01-watch-office/);
  assert.doesNotMatch(await resume.run("!ls /expedition"), /03-offering-vault/);
  assert.equal((await resume.run("!cd ../01-watch-office; " + solutions[0])).trim(), answer);
  await resume.run("!cd ../02-scriptorium/manuscripts/east");
  assert.deepEqual((await resume.survey()).files, ["report.txt"]);
  assert.match(await resume.run("!ls -a"), /\.dispatch\.txt/);
});

test("forensic fixtures contain valid checksums, WebAssembly and JPEG coordinates", () => {
  const foundChecksums = new Set();
  const foundOutposts = new Set();
  for (let seed = 0; seed < 128; seed++) {
    const dispatch = roomFiles(seed, 9);
    const checksum = String(dispatch["receipt.txt"]).trim().slice(5);
    assert.ok(Object.entries(dispatch).some(([path, text]) =>
      path.startsWith("copies/") && createHash("md5").update(text).digest("hex") === checksum));
    foundChecksums.add(checksum);
    const scout = roomFiles(seed, 12);
    const coords = gpsCoordinates(scout["scout.jpg"] as Uint8Array)?.join("\t");
    assert.ok(coords && String(scout["outposts.txt"]).includes("\t" + coords + "\n"));
    foundOutposts.add(coords);
  }
  assert.equal(foundChecksums.size, 10);
  assert.equal(foundOutposts.size, 4);
  const golem = roomFiles(42, 10)["golem.wasm"] as Uint8Array;
  assert.equal(WebAssembly.validate(golem), true);
  assert.ok(new TextDecoder().decode(golem).includes(roomFlag(42, 10)));
});
