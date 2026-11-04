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
test("a brief undone turn or a late turn cannot earn credit", () => {
  for (const pattern of [t => t > 240 && t < 600 ? Math.PI / 4 : 0, t => t > 3600 ? Math.PI / 4 : 0]) {
    const e = new CrossingEncounter();
    const p = { x: 0, z: 0, heading: Math.PI / 4, velocityX: 1.2, velocityZ: 1.2, rudder: 0, unsafe: false, sailsRaised: true, sailSide: 1 };
    e.update(1 / 60, p);
    for (let t = 0; t < 110 * 60 && e.stage === "crossing"; t++) {
      const turn = pattern(t);
      p.heading = Math.PI / 4 + turn;
      p.velocityX = Math.sin(p.heading) * 1.7; p.velocityZ = Math.cos(p.heading) * 1.7;
      p.x += p.velocityX / 60; p.z += p.velocityZ / 60; p.rudder = turn ? 1 : 0;
      e.update(1 / 60, p);
    }
    assert.notEqual(e.stage, "complete");
  }
});
test("passing astern does not complete while the boats are closing again", () => {
  const e = new CrossingEncounter();
  e.stage = "crossing";
  e.other = { x: 0, z: 0, heading: 0 };
  e.closest = 20;
  e.closestTime = 1;
  e.elapsed = 10;
  e.turned = true;
  e.update(1 / 60, { x: 0, z: -30, velocityX: 0, velocityZ: 3,
    heading: Math.PI / 2, rudder: 0, unsafe: false, sailsRaised: true, sailSide: 1 });
  assert.equal(e.stage, "crossing");
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

test("crossing progresses on slow frames while unsafe or discontinuous samples fail", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const begin = main.indexOf("        if (crossing) {", main.indexOf("const eligible ="));
  const end = main.indexOf("          if (crossing.other &&", begin);
  assert.ok(begin >= 0 && end > begin);
  const branch = stripTypeScriptTypes(main.slice(begin, end) + "\n}", { mode: "transform" });
  const ctx = { crossing: new CrossingEncounter(), incident: undefined, nextIncident: { severity: "none", kind: "none" },
    dockedAt: undefined, droppedFrame: true, fixedStep: 1 / 60, state: {}, controls: {} };
  const player = { x: 0, z: 0, heading: Math.PI / 4, velocityX: 1.2, velocityZ: 1.2, rudder: 0 };
  const dispatch = (unsafe = false) => {
    ctx.nextIncident = { severity: unsafe ? "touch" : "none", kind: "none" };
    ctx.state = { position: { x: player.x, y: player.z }, velocity: { x: player.velocityX, y: player.velocityZ },
      heading: player.heading, sailsRaised: true, sailSide: 1 };
    ctx.controls = { rudder: player.rudder };
    runInNewContext(branch, ctx);
  };
  dispatch(); assert.equal(ctx.crossing.stage, "crossing");
  for (let t = 0; t < 110 * 60 && ctx.crossing.stage === "crossing"; t++) {
    const turn = t > 240 ? Math.PI / 4 : 0;
    player.heading = Math.PI / 4 + turn;
    player.velocityX = Math.sin(player.heading) * 1.7; player.velocityZ = Math.cos(player.heading) * 1.7;
    player.x += player.velocityX / 60; player.z += player.velocityZ / 60; player.rudder = turn ? 1 : 0;
    dispatch();
  }
  assert.equal(ctx.crossing.stage, "complete"); assert.ok(ctx.crossing.closest >= 10);
  ctx.crossing = new CrossingEncounter(); dispatch(true); assert.equal(ctx.crossing.stage, "failed");
  ctx.crossing = new CrossingEncounter(); player.x = 0; player.z = 0; player.heading = Math.PI / 4;
  player.velocityX = 1.2; player.velocityZ = 1.2; player.rudder = 0; dispatch(); player.x += 100; dispatch();
  assert.equal(ctx.crossing.stage, "failed"); assert.equal(ctx.crossing.failure, "conditions");
});
