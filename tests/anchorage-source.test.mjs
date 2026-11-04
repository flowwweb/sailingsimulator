import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const url = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
const boatsUrl = url(await readFile(new URL("../src/sim/boats.ts", import.meta.url), "utf8"));
const boats = await import(boatsUrl);
const model = await import(url((await readFile(new URL("../src/sim/model.ts", import.meta.url), "utf8")).replace('from "./boats";', `from "${boatsUrl}";`)));
const anchorUrl = url(await readFile(new URL("../src/game/anchoring.ts", import.meta.url), "utf8"));
const { AnchorageExercise } = await import(url((await readFile(new URL("../src/game/anchorage-exercise.ts", import.meta.url), "utf8")).replace('from "./anchoring";', `from "${anchorUrl}";`)));
const exercise = () => new AnchorageExercise({ x: 0, y: 0 }, { halfLength: 2, draft: 0.82 });
const boat = () => ({ ...model.createInitialState(), position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, heading: 0 });
const depth = () => 4.4;

test("only drops from the bow in the practice area with safe speed, depth and swing samples", () => {
  const e = exercise(), b = boat();
  assert.equal(e.drop({ ...b, position: { x: 100, y: 0 } }, depth, () => true), false);
  assert.equal(e.drop({ ...b, velocity: { x: 1, y: 0 } }, depth, () => true), false);
  assert.equal(e.drop(b, () => 0.5, () => true), false);
  assert.equal(e.drop(b, (x, y) => Math.hypot(x, y - 2) > 12 && Math.hypot(x, y - 2) < 15 ? 0.5 : 4.4, () => true), false);
  assert.equal(e.drop(b, depth, () => false), false);
  assert.equal(e.drop(b, depth, () => true), true);
  assert.deepEqual(e.anchor.position, { x: 0, y: 2 });
});

test("fixed-step boat forces set and hold a paid-out anchor before recovery can complete", () => {
  const e = exercise(); let b = boat();
  assert.equal(e.drop(b, depth, () => true), true);
  for (let i = 0; i < 5; i++) e.payOut(4.4);
  assert.equal(e.stage, "set");
  b = { ...b, position: { x: 30, y: 0 }, velocity: { x: 0.1, y: 0 }, sailsRaised: true, sailDeployment: 1 };
  let forceSeen = false;
  for (let i = 0; i < 2_400 && e.stage !== "recover"; i++) {
    const result = model.stepBoat(b, { rudder: 0, sheetRate: 0 }, { trueWind: { x: 5, y: 0 }, boat: boats.HARBOR_20 }, 1 / 60);
    const unanchored = result.state;
    b = e.step(unanchored, 4.4, 1 / 60);
    forceSeen ||= Math.hypot(b.velocity.x - unanchored.velocity.x, b.velocity.y - unanchored.velocity.y) > 1e-6;
    e.observe(1 / 60, false, 4.4);
  }
  assert.ok(forceSeen); assert.equal(e.stage, "recover"); assert.ok(e.holdSeconds >= 8);
  const fastAtAnchor = { ...b, position: { x: e.anchor.position.x, y: e.anchor.position.y - 2 }, heading: 0, velocity: { x: 1, y: 0 } };
  const fast = exercise(); fast.stage = "recover"; fast.anchor = { ...e.anchor, position: { ...e.anchor.position } };
  fast.haul(fastAtAnchor, 4.4); assert.equal(fast.stage, "recover");
  for (let i = 0; i < 60 * 180 && e.stage === "recover"; i++) {
    const target = e.anchor.position;
    const dx = target.x - b.position.x, dy = target.y - b.position.y;
    const desired = Math.atan2(dx, dy);
    const error = Math.atan2(Math.sin(desired - b.heading), Math.cos(desired - b.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - b.yawRate * 8));
    const sail = model.computeSailAerodynamics(b, { trueWind: { x: 5, y: 0 }, boat: boats.HARBOR_20 });
    const sheetTarget = Math.hypot(dx, dy) < 9 ? 1 : model.sheetForBoomAngle(sail.idealBoomAngle);
    const result = model.stepBoat(b, { rudder, sheetRate: Math.sign(sheetTarget - b.sheet), sheetTarget }, { trueWind: { x: 5, y: 0 }, boat: boats.HARBOR_20 }, 1 / 60);
    b = e.step(result.state, 4.4, 1 / 60);
    e.observe(1 / 60, false, 4.4);
    if (i % 120 === 0) e.haul(b, 4.4);
  }
  assert.equal(e.stage, "complete"); assert.equal(e.anchor, undefined);
});

test("drag, interrupted holding and an incident cannot award completion", () => {
  const e = exercise(), b = boat(); e.drop(b, depth, () => true);
  for (let i = 0; i < 5; i++) e.payOut(4.4);
  e.anchor = { ...e.anchor, set: true }; e.stage = "holding"; e.holdSeconds = 7.99;
  e.step({ ...b, position: { x: 45, y: 0 }, velocity: { x: 3, y: 0 } }, 4.4, 1/60);
  e.observe(1/60, false, 4.4);
  assert.equal(e.stage, "set"); assert.equal(e.holdSeconds, 0); assert.ok(e.anchor.dragging);
  e.observe(1/60, true, 4.4); assert.equal(e.stage, "failed");
  assert.equal(e.haul(b, 4.4), false); assert.notEqual(e.stage, "complete");
});

test("anchorage completion survives reload only when explicitly earned", async () => {
  const buoy = await readFile(new URL("../src/game/first-buoy.ts", import.meta.url), "utf8");
  const first = buoy.match(/export const FIRST_BUOY = \{[\s\S]*?\} as const;/)?.[0].replace("export ", "");
  const course = buoy.match(/export const FIRST_COURSE_ID = .*?;/)?.[0].replace("export ", "");
  assert.ok(first && course);
  const source = (await readFile(new URL("../src/game/progress.ts", import.meta.url), "utf8"))
    .replace('import { FIRST_BUOY, FIRST_COURSE_ID } from "./first-buoy";', `${first}\n${course}`);
  const saved = await import(url(source));
  assert.equal(saved.parseProgress(JSON.stringify({ ...saved.createProgress(), completedAnchorage: true })).completedAnchorage, true);
  assert.equal(saved.parseProgress(JSON.stringify({ ...saved.createProgress(), completedAnchorage: "true" })).completedAnchorage, undefined);
});

test("game wires anchor forces before hazard checks and only records completed recovery", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("const result = stepBoat(");
  const applied = main.indexOf("result.state = anchorage.step(", start);
  const incident = main.indexOf("const nextIncident = evaluateIncident(", start);
  assert.ok(start >= 0 && applied > start && incident > applied);
  assert.match(main, /anchorage\.haul\(state, d\) && anchorage\.stage === "complete"\) \{\s*progress\.completedAnchorage = true/);
  assert.match(main, /activity\?\.id === "anchorage-practice"[\s\S]*?startAnchorage\(true\)/);
});

test("the chosen cove has enough sampled swing depth at low and high practice tides", async () => {
  const bathymetry = await import(url(await readFile(new URL("../src/game/bathymetry.ts", import.meta.url), "utf8")));
  for (const tide of [-1, 0, 1]) {
    const e = new AnchorageExercise({ x: 1400, y: -200 }, { halfLength: boats.HARBOR_20.collision.halfLength, draft: boats.HARBOR_20.hull.draft });
    const vessel = { ...boat(), position: { x: 1380, y: -180 } };
    const waterDepth = (x, y) => bathymetry.depthAtTide(bathymetry.sampleLakeDepth(x, y), tide);
    assert.equal(e.drop(vessel, waterDepth, () => true), true, `failed at tide ${tide}: ${e.message}`);
  }
});

test("anchored boat remains finite while the existing wave pose and tide evolve", async () => {
  const prngUrl = url(await readFile(new URL("../src/weather/prng.ts", import.meta.url), "utf8"));
  const wavesSource = (await readFile(new URL("../src/weather/waves.ts", import.meta.url), "utf8")).replace('from "./prng";', `from "${prngUrl}";`);
  const waves = await import(url(wavesSource));
  const waveUrl = url(wavesSource);
  const poseSource = (await readFile(new URL("../src/game/wave-pose.ts", import.meta.url), "utf8"))
    .replace('from "../sim/boats";', `from "${boatsUrl}";`).replace('from "../weather/waves";', `from "${waveUrl}";`);
  const { sampleBoatWavePose } = await import(url(poseSource));
  const components = waves.buildWaveComponents({ mode: "linked", height: 0.2, length: 12, steepness: 0.2, directionFromDegrees: 90 }, 5, 90, 24001);
  const e = exercise(); let b = boat(); e.drop(b, depth, () => true);
  for (let i = 0; i < 5; i++) e.payOut(4.4);
  b = { ...b, position: { x: 30, y: 0 }, velocity: { x: 0.1, y: 0 } };
  for (let i = 0; i < 3600; i++) {
    const time = i / 60, tide = 4.4 + 0.4 * Math.sin(time / 30);
    const r = model.stepBoat(b, { rudder: 0, sheetRate: 0 }, { trueWind: { x: 5, y: 0 }, boat: boats.HARBOR_20, wavePose: sampleBoatWavePose(b, components, time, boats.HARBOR_20) }, 1 / 60);
    b = e.step(r.state, tide, 1 / 60); e.observe(1 / 60, false, tide);
    assert.ok([b.position.x, b.position.y, b.velocity.x, b.velocity.y, b.heave, e.anchor.position.x, e.anchor.position.y].every(Number.isFinite));
  }
  assert.notEqual(e.stage, "complete");
});

test("incident recovery restarts anchorage without retaining the old deployed anchor", async () => {
  const { runInNewContext } = await import("node:vm");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  function extract(name) {
    const start = main.indexOf("function " + name + "(");
    const end = main.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start);
    return stripTypeScriptTypes(main.slice(start, end), { mode: "transform" });
  }
  const old = exercise(), anchored = boat();
  assert.equal(old.drop(anchored, depth, () => true), true);
  old.observe(1 / 60, true, 4.4);
  assert.equal(old.stage, "failed"); assert.ok(old.anchor);
  const progress = { completedAnchorage: false };
  const ctx = { anchorage: old, crossing: undefined, dummyRecovery: undefined, firstBuoy: undefined,
    FAIR_WINDS_WORLD: { activities: [{ id: "anchorage-practice", x: 1400, z: -200 }] },
    activeBoat: { collision: { halfLength: 2 }, hull: { draft: 0.82 } }, AnchorageExercise,
    state: anchored, previousState: anchored, weather: { trueWind: {} }, incident: { kind: "grounding" },
    createLessonState: (_lesson, _wind, start) => ({ position: start }),
    computeSailAerodynamics: () => ({}), computeHeadsailAerodynamics: () => ({}),
    interruptLessonAttempt() {}, clearDocking() {}, clearIncident() { ctx.incident = undefined; },
    world: { resetWake() {}, resetCamera() {} }, elements: { status: {} }, progress };
  runInNewContext(extract("startAnchorage") + "\n" + extract("recoverBoat") + "\nrecoverBoat();", ctx);
  assert.notEqual(ctx.anchorage, old); assert.equal(ctx.anchorage.stage, "approach");
  assert.equal(ctx.anchorage.anchor, undefined); assert.equal(ctx.incident, undefined);
  assert.equal(ctx.state.position.x, 1380); assert.equal(ctx.state.position.z, -180);
  assert.equal(progress.completedAnchorage, false);
});
