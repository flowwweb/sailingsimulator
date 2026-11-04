import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const read = (path) => readFile(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
const url = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
const boatsUrl = url(await read("sim/boats"));
const boats = await import(boatsUrl);
const modelUrl = url((await read("sim/model")).replace('from "./boats";', `from "${boatsUrl}";`));
const model = await import(modelUrl);
const bathUrl = url(await read("game/bathymetry"));
const bath = await import(bathUrl);
const townUrl = url(await read("game/town-solids"));
const worldSource = (await read("game/world-definition")).replace('from "./bathymetry";', `from "${bathUrl}";`).replace('from "./town-solids";', `from "${townUrl}";`);
const worldUrl = url(worldSource);
const world = await import(worldUrl);
const dockingUrl = url(await read("game/docking"));
const hazardsSource = (await read("game/hazards"))
  .replace('from "../sim/model";', `from "${modelUrl}";`).replace('from "../sim/boats";', `from "${boatsUrl}";`)
  .replace('from "./docking";', `from "${dockingUrl}";`).replace('from "./bathymetry";', `from "${bathUrl}";`)
  .replace('from "./world-definition";', `from "${worldUrl}";`);
const hazards = await import(url(hazardsSource));
const anchorUrl = url(await read("game/anchoring"));
const exerciseSource = (await read("game/anchorage-exercise")).replace('from "./anchoring";', `from "${anchorUrl}";`);
const { AnchorageExercise } = await import(url(exerciseSource));
const prngUrl = url(await read("weather/prng"));
const wavesSource = (await read("weather/waves")).replace('from "./prng";', `from "${prngUrl}";`);
const wavesUrl = url(wavesSource);
const waves = await import(wavesUrl);
const poseSource = (await read("game/wave-pose")).replace('from "../sim/boats";', `from "${boatsUrl}";`).replace('from "../weather/waves";', `from "${wavesUrl}";`);
const { sampleBoatWavePose } = await import(url(poseSource));
const lessonSource = await read("game/lesson-session");
const start = lessonSource.indexOf("export function createLessonState(");
const end = lessonSource.indexOf("\nexport function observeLesson", start);
assert.ok(start >= 0 && end > start);
const lessonFunction = stripTypeScriptTypes(lessonSource.slice(start, end), { mode: "transform" }).replace("export function", "function");
const createLessonState = runInNewContext(`${lessonFunction}; createLessonState`, model);
const main = await read("main");
const swingStart = main.indexOf("function anchorSwingClear(");
const swingEnd = main.indexOf("\nfunction startAnchorage", swingStart);
assert.ok(swingStart >= 0 && swingEnd > swingStart);
const swingFunction = stripTypeScriptTypes(main.slice(swingStart, swingEnd), { mode: "transform" });
const clearOfObjects = runInNewContext(`${swingFunction}; anchorSwingClear`, { FAIR_WINDS_WORLD: world.FAIR_WINDS_WORLD });

// Reproducible game-model scenario: practice spawn, fixed 7.5 m/s easterly wind,
// linked waves (seed 8143), current tide, actual collision world and 1/60 s steps.
test("sails from the practice start, sets, holds and recovers without teleporting or contact", () => {
  const wind = { x: -7.5, y: 0 };
  const components = waves.buildWaveComponents({ mode: "linked", height: .3, length: 22, steepness: .25, directionFromDegrees: 90 }, 7.5, 90, 8143);
  const e = new AnchorageExercise({ x: 1400, y: -200 }, { halfLength: boats.HARBOR_20.collision.halfLength, draft: boats.HARBOR_20.hull.draft });
  let b = createLessonState(0, wind, { x: 1380, z: -180 });
  const tideAt = (time) => Math.sin(((time / 600 + 2.4) / 12.42) * Math.PI * 2) * 0.6;
  const depthAt = (x, y, time) => bath.depthAtTide(bath.sampleLakeDepth(x, y), tideAt(time));
  assert.equal(e.drop(b, (x, y) => depthAt(x, y, 0), clearOfObjects), true, e.message);
  while (e.anchor.rode < 5 * (depthAt(e.anchor.position.x, e.anchor.position.y, 0) + .6)) e.payOut(depthAt(e.anchor.position.x, e.anchor.position.y, 0));
  let tick = 0;
  const step = (controls) => {
    const time = tick++ / 60, previous = b;
    const result = model.stepBoat(previous, controls, { trueWind: wind, boat: boats.HARBOR_20, wavePose: sampleBoatWavePose(previous, components, time, boats.HARBOR_20) }, 1 / 60);
    const depth = depthAt(e.anchor.position.x, e.anchor.position.y, time);
    b = e.step(result.state, depth, 1 / 60);
    const incident = hazards.evaluateIncident(b, boats.HARBOR_20, world.FAIR_WINDS_WORLD, tideAt(time), undefined, previous);
    assert.equal(incident.severity, "none", `incident at ${time.toFixed(1)}s: ${incident.kind}`);
    assert.notEqual(incident.kind, "docking");
    e.observe(1 / 60, false, depth);
  };
  while (tick < 60 * 120 && e.stage !== "recover") {
    const error = Math.atan2(Math.sin(-b.heading), Math.cos(-b.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - b.yawRate * 8));
    step({ rudder, sheetTarget: .6, sheetRate: Math.sign(.6 - b.sheet) });
  }
  assert.equal(e.stage, "recover", `failed to hold: ${e.stage}, ${e.message}`);
  assert.ok(e.holdSeconds >= 8);
  const returnStart = tick;
  while (tick < returnStart + 60 * 240 && e.stage === "recover") {
    const target = e.anchor.position, dx = target.x - b.position.x, dy = target.y - b.position.y;
    const desired = Math.atan2(dx, dy), error = Math.atan2(Math.sin(desired - b.heading), Math.cos(desired - b.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - b.yawRate * 8));
    const sail = model.computeSailAerodynamics(b, { trueWind: wind, boat: boats.HARBOR_20 });
    const sheetTarget = Math.hypot(dx, dy) < 9 ? 1 : model.sheetForBoomAngle(sail.idealBoomAngle);
    step({ rudder, sheetTarget, sheetRate: Math.sign(sheetTarget - b.sheet) });
    if (tick % 120 === 0) e.haul(b, depthAt(e.anchor.position.x, e.anchor.position.y, tick / 60));
  }
  assert.equal(e.stage, "complete", `failed to recover: ${e.message}`);
  assert.equal(e.anchor, undefined);
});
