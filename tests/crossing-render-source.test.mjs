import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

test("visible crossing boat follows tide and wave; hidden boat does not sample", () => {
  const source = readFileSync("src/render/ambient-life.ts", "utf8");
  const start = source.indexOf("    if (this.crossingBoat.visible) {");
  const end = source.indexOf("    this.birds.forEach", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  let samples = 0;
  const crossingBoat = { visible: true, position: { x: 3, z: 4, y: 0 } };
  const context = { boat: { crossingBoat }, weather: { tideLevel: 1.5, waves: [] }, time: 10,
    sampleWaveHeight: (_waves, x, z, t) => { samples++; assert.deepEqual([x, z, t], [3, 4, 10]); return .4; } };
  runInNewContext(`(function(){ ${body} }).call(boat)`, context);
  assert.equal(crossingBoat.position.y, 1.9);
  crossingBoat.visible = false;
  runInNewContext(`(function(){ ${body} }).call(boat)`, context);
  assert.equal(samples, 1);
});

test("visual-only ambient boats return after the single-encounter exercise", () => {
  const source = readFileSync("src/render/ambient-life.ts", "utf8");
  const start = source.indexOf("    for (const boat of this.boats) boat.root.visible = !active;");
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf("\n  }", start));
  const boats = [{ root: { visible: true } }, { root: { visible: true } }];
  const context = { scene: { boats }, active: true };
  runInNewContext(`(function(){ ${body} }).call(scene)`, context);
  assert.ok(boats.every(boat => !boat.root.visible));
  context.active = false;
  runInNewContext(`(function(){ ${body} }).call(scene)`, context);
  assert.ok(boats.every(boat => boat.root.visible));
});

test("NPC hazard validation covers the tick that completes the encounter", () => {
  const source = readFileSync("src/main.ts", "utf8");
  const start = source.indexOf('          if (crossing.other && (crossing.stage === "crossing"');
  const end = source.indexOf("          world.setCrossingBoat", start);
  assert.ok(start >= 0 && end > start);
  let observedVelocity;
  const context = { crossing: { stage: "complete", other: { x: 2, z: 3, heading: Math.PI / 2 } },
    state: { velocity: { x: 0, y: 0 } }, previousOther: undefined, activeBoat: {}, FAIR_WINDS_WORLD: {},
    weather: { tideLevel: 0 }, CROSSING_OTHER_SPEED: 1.7,
    evaluateIncident: npc => { observedVelocity = npc.velocity; return { severity: "none", kind: "docking" }; } };
  runInNewContext(source.slice(start, end), context);
  assert.equal(context.crossing.stage, "failed");
  assert.equal(context.crossing.failure, "unsafe");
  assert.ok(Math.abs(observedVelocity.x - 1.7) < 1e-10);
  assert.ok(Math.abs(observedVelocity.y) < 1e-10);
});
