import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/game/dummy-recovery.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "transform" }).replace(/^export /gm, "");
const DummyRecovery = runInNewContext(`${js}\nDummyRecovery`);
const make = () => new DummyRecovery({ x: 0, z: 0 }, { halfLength: 2.2, halfBeam: 0.78 });
const tick = (s, x, speed = 0.4) => s.update(1 / 60, { x, z: 0 }, speed, false, 0.5 + x * 0.002, 1, x * 0.002, 0.2, 0);
function travel(s, from, to) {
  const direction = Math.sign(to - from);
  for (let x = from; direction * (to - x) > 0; x += direction * 0.1) tick(s, x);
  tick(s, to);
}

test("recovery requires departure, an alongside hold and an explicit action", () => {
  const s = make();
  assert.equal(s.recover(), false);
  travel(s, 5, 41);
  assert.equal(s.stage, "return");
  travel(s, 41, 7);
  for (let i = 0; i < 190; i++) tick(s, 7);
  assert.equal(s.stage, "return");
  travel(s, 7, 1.8);
  for (let i = 0; i < 190; i++) tick(s, 1.8);
  assert.equal(s.stage, "ready");
  assert.equal(s.recover(), true);
  assert.equal(s.recover(), false);
});

test("interruption and unsafe contact do not award a recovery", () => {
  const s = make();
  travel(s, 5, 20);
  s.interrupt();
  assert.equal(s.needsDepartureStart({ x: 20, z: 0 }), true);
  s.update(1 / 60, { x: 20, z: 0 }, 0, true, 0.5, 0, 0, 0, 0);
  assert.equal(s.stage, "failed");
  assert.equal(s.recover(), false);
});

test("contact during departure fails even if the boat subsequently sails away", () => {
  const s = make();
  tick(s, 5);
  assert.equal(s.stage, "depart");
  travel(s, 5, 1.4);
  assert.equal(s.stage, "failed");
  travel(s, 1.4, 41);
  assert.equal(s.stage, "failed");
  assert.equal(s.recover(), false);
});

test("the five-metre abeam spawn starts clear of the hull", () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const s = new DummyRecovery({ x: 5 * Math.cos(heading), z: -5 * Math.sin(heading) }, { halfLength: 2.2, halfBeam: 0.78 });
    s.update(1 / 60, { x: 0, z: 0 }, 0, false, 0.5, 0, heading, 0, 0);
    assert.equal(s.stage, "depart");
    assert.equal(s.needsDepartureStart({ x: 0, z: 0 }), false);
  }
});

test("a bow-on approach cannot count as alongside recovery", () => {
  const s = make();
  travel(s, 5, 41);
  travel(s, 41, 3);
  for (let i = 0; i < 190; i++) s.update(1 / 60, { x: 3, z: 0 }, 0.2, false, 0.6, 0, Math.PI / 2, 0, 0);
  assert.equal(s.stage, "return");
  assert.equal(s.recover(), false);
});

test("either side is reachable without allowing hull overlap", () => {
  for (const side of [-1, 1]) {
    const s = make();
    travel(s, side * 5, side * 41);
    travel(s, side * 41, side * 1.8);
    for (let i = 0; i < 190; i++) tick(s, side * 1.8);
    assert.equal(s.stage, "ready");
  }
  const contact = make();
  travel(contact, 5, 41);
  travel(contact, 41, 1.4);
  assert.equal(contact.stage, "failed");
});

test("dummy recovery advances on slow frames but still rejects unsafe contact and position jumps", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const droppedStart = main.indexOf("  if (droppedFrame && !isSimulationPaused()) {");
  const droppedEnd = main.indexOf("  if (!portrait) presentationTime", droppedStart);
  const begin = main.indexOf("        if (dummyRecovery) {", main.indexOf("const eligible ="));
  const end = main.indexOf("        if (crossing) {", begin);
  assert.ok(droppedStart >= 0 && droppedEnd > droppedStart && begin >= 0 && end > begin);
  const branch = stripTypeScriptTypes(main.slice(droppedStart, droppedEnd) + "\n" + main.slice(begin, end), { mode: "transform" });
  const ctx = { droppedFrame: true, isSimulationPaused: () => false, weatherShelter: undefined, accumulator: 0,
    dummyRecovery: make(), incident: undefined, nextIncident: { severity: "none", kind: "none" }, dockedAt: undefined,
    fixedStep: 1 / 60, state: {}, controls: {} };
  const sample = (x, unsafe = false) => {
    ctx.state = { position: { x, y: 0 }, velocity: { x: .4, y: 0 }, sheet: .5 + x * .002, heading: x * .002, yawRate: 0 };
    ctx.controls = { sheetRate: 1, rudder: .2 };
    ctx.nextIncident = { severity: unsafe ? "touch" : "none", kind: "none" };
    runInNewContext(branch, ctx);
  };
  const line = (from, to) => { const dir = Math.sign(to - from); for (let x = from; dir * (to - x) > 0; x += dir * .1) sample(x); sample(to); };
  line(5, 41); assert.equal(ctx.dummyRecovery.stage, "return");
  line(41, 1.8); for (let i = 0; i < 190; i++) sample(1.8);
  assert.equal(ctx.dummyRecovery.stage, "ready"); assert.equal(ctx.dummyRecovery.recover(), true);
  ctx.dummyRecovery = make(); sample(5); sample(5, true); assert.equal(ctx.dummyRecovery.stage, "failed");
  ctx.dummyRecovery = make(); sample(5); sample(100); assert.equal(ctx.dummyRecovery.stage, "failed");
});
