import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
const source = stripTypeScriptTypes(readFileSync("src/game/crossing-encounter.ts", "utf8"), { mode: "strip" }).replace(/^export /gm, "");
const { CrossingEncounter } = runInNewContext(source + "\n({CrossingEncounter})");
function run(turn, steer = true) {
  const encounter = new CrossingEncounter();
  const player = { x: 0, z: 0, heading: Math.PI / 4, velocityX: 1.2, velocityZ: 1.2, rudder: 0, unsafe: false, sailsRaised: true, sailSide: 1 };
  encounter.update(1 / 60, player);
  for (let t = 0; t < 110 * 60 && encounter.stage === "crossing"; t++) {
    player.heading = Math.PI / 4 + (t > 240 ? turn : 0);
    player.velocityX = Math.sin(player.heading) * 1.7; player.velocityZ = Math.cos(player.heading) * 1.7;
    player.x += player.velocityX / 60; player.z += player.velocityZ / 60;
    player.rudder = steer ? Math.sign(turn) : 0;
    encounter.update(1 / 60, player);
  }
  return encounter;
}
test("unchanged converging course fails; a turn passing astern clears", () => {
  const noAction = run(0); assert.equal(noAction.stage, "failed"); assert.ok(noAction.closest < 10);
  const avoiding = run(Math.PI / 4); assert.equal(avoiding.stage, "complete"); assert.ok(avoiding.closest > 10);
});
test("turn without player steering cannot earn credit and unsafe observation fails", () => {
  assert.equal(run(Math.PI / 4, false).stage, "failed");
  const e = new CrossingEncounter(); e.update(1 / 60, { x: 0, z: 0, velocityX: 0, velocityZ: 0, heading: 0, rudder: 0, unsafe: true, sailsRaised: true, sailSide: 1 });
  assert.equal(e.stage, "failed");
});
test("leaving the opposite-tack sailing conditions ends the exercise", () => {
  for (const change of [{ sailSide: -1 }, { sailsRaised: false }]) {
    const e = new CrossingEncounter();
    const player = { x: 0, z: 0, heading: Math.PI / 4, velocityX: 1.2, velocityZ: 1.2, rudder: 0, unsafe: false, sailsRaised: true, sailSide: 1 };
    e.update(1 / 60, player); assert.equal(e.stage, "crossing");
    e.update(1 / 60, { ...player, ...change });
    assert.equal(e.stage, "failed"); assert.equal(e.failure, "conditions");
  }
});
test("does not start when the simulated setup would be overtaking", () => {
  const e = new CrossingEncounter();
  const player = { x: 0, z: 0, heading: Math.PI / 4, velocityX: -1, velocityZ: 3, rudder: 0, unsafe: false, sailsRaised: true, sailSide: 1 };
  e.update(1 / 60, player);
  assert.equal(e.stage, "failed"); assert.equal(e.failure, "conditions");
});
