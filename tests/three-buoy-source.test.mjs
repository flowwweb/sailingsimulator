import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const world = readFileSync(new URL("../src/game/world-definition.ts", import.meta.url), "utf8");
const ids = ["juniper-buoy", "school-buoy-2", "school-buoy-3"];
const objects = ids.map((id) => {
  const match = world.match(new RegExp(`id: "${id}"[\\s\\S]*?x: (-?\\d+),\\s*z: (-?\\d+)`));
  assert.ok(match, `missing ${id}`);
  return { id, kind: "buoy", x: Number(match[1]), z: Number(match[2]) };
});
objects.push({ id: "channel-port", kind: "buoy", x: 510, z: 500 });
const source = readFileSync(new URL("../src/game/first-buoy.ts", import.meta.url), "utf8");
const code = stripTypeScriptTypes(source, { mode: "strip" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const { FirstBuoyJourney, FIRST_BUOY, FIRST_BUOY_MARKS, firstBuoyWorld } = runInNewContext(
  `${code}\n({ FirstBuoyJourney, FIRST_BUOY, FIRST_BUOY_MARKS, firstBuoyWorld });`, { FAIR_WINDS_WORLD: { objects } });

function driver(journey, dispatch = (dt, observation) => journey.update(dt, observation)) {
  let position = { x: FIRST_BUOY.start.x, y: FIRST_BUOY.start.z };
  let tick = 0;
  const sample = (p, overrides = {}) => {
    tick++;
    return dispatch(1 / 60, { position: p, heading: tick * .0005, attached: .9, stall: 0,
      pointOfSail: "Beam reach", tackCount: 0, gybeCount: 0, reefed: false, heelRadians: .1,
      luff: 0, sailDeployment: 1, sailsRaised: true, forwardSpeed: 3, driveForce: 100,
      sheet: .5 + .1 * Math.sin(tick / 400), sheetRate: .2, rudder: .2,
      apparentWindAngle: Math.PI / 2, yawRate: 0, boomAngle: -.8, desiredBoomAngle: -.8,
      unsafe: false, ...overrides });
  };
  sample(position);
  const line = (x, y, stopOnAdvance = false, overrides = {}) => {
    const from = position, initial = journey.markIndex;
    const steps = Math.ceil(Math.hypot(x - from.x, y - from.y) / .05);
    for (let i = 1; i <= steps; i++) {
      position = { x: from.x + (x - from.x) * i / steps, y: from.y + (y - from.y) * i / steps };
      sample(position, overrides);
      if (journey.completed || journey.failed || (stopOnAdvance && journey.markIndex !== initial)) break;
    }
  };
  return { line, sample, position: () => position };
}

function reachFirst(journey, direction = 1, overrides = {}) {
  const boat = driver(journey), first = FIRST_BUOY_MARKS[0];
  boat.line(first.x, first.z + 14.5, false, overrides);
  const steps = 1_000;
  for (let i = 1; i <= steps; i++) {
    const angle = Math.PI / 2 + direction * Math.PI * i / steps;
    boat.line(first.x + 14.5 * Math.cos(angle), first.z + 14.5 * Math.sin(angle), false, overrides);
  }
  boat.line(first.x, first.z - 15.5, true, overrides);
  return boat;
}

test("missed arrivals explain the actual condition and how to retry", () => {
  const cases = [
    [{ sailsRaised: false }, "Raise the sail."],
    [{ sailDeployment: 0.6 }, "Let the sail finish adjusting."],
    [{ pointOfSail: "No-go zone" }, "Turn away from the wind."],
    [{ forwardSpeed: 0.2 }, "Build a little more speed."],
    [{ forwardSpeed: 4.1 }, "Slow down before the buoy."],
    [{ yawRate: 0.12 }, "Steer more steadily."],
    [{ luff: 0.3 }, "Adjust the sail to stop it fluttering."],
    [{ stall: 0.3 }, "Ease the sail for a smoother approach."],
    [{ driveForce: 0 }, "Adjust your course and sail to keep moving."],
    [{ rudder: 0 }, "Steer the boat toward the buoy."],
  ];
  for (const [overrides, cue] of cases) {
    const journey = new FirstBuoyJourney(), boat = driver(journey), target = FIRST_BUOY_MARKS[0];
    boat.line(target.x, target.z + 14.5, false, overrides);
    assert.equal(journey.completed, false);
    assert.match(journey.objective(), /Sail outside the buoy zone, then approach again/);
    assert.ok(journey.objective().startsWith(cue), journey.objective());
    assert.ok(journey.view(boat.position()).instruction.startsWith(cue));
    boat.line(target.x, target.z + 16);
    assert.ok(journey.objective().startsWith("Sail to "));
  }
});

test("three marks are nearby and in navigable water", () => {
  const bathymetry = readFileSync(new URL("../src/game/bathymetry.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(bathymetry, { mode: "strip" }).replace(/^export /gm, "");
  const depth = runInNewContext(`${js}\n(sampleLakeDepth);`);
  for (let i = 0; i < ids.length; i++) {
    assert.ok(depth(objects[i].x, objects[i].z) > 5);
    if (i) assert.ok(Math.abs(Math.hypot(objects[i].x - objects[i - 1].x, objects[i].z - objects[i - 1].z) - 42) < 1);
  }
});

test("only the active training buoy remains in the lesson world; unrelated marks remain", () => {
  for (const id of ids) {
    const visible = firstBuoyWorld(id).objects.map((object) => object.id);
    assert.deepEqual(Array.from(visible), [id, "channel-port"]);
  }
  assert.deepEqual(Array.from(firstBuoyWorld().objects.map((object) => object.id)), ["channel-port"]);
  assert.deepEqual(objects.map((object) => object.id), [...ids, "channel-port"]);
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /evaluateIncident\([\s\S]*?firstBuoyWorld\(firstBuoy\.activeCourse\(\)\?\.id\)/);
  assert.match(main, /miniChart\.render\(state, firstBuoy \? firstBuoyWorld/);
  assert.match(main, /chart\.render\(state, firstBuoy \? firstBuoyWorld/);
  assert.match(main, /setWorldObjectVisible\(mark\.id, !firstBuoy \|\| mark\.id === firstBuoy\.activeCourse\(\)\?\.id\)/);
});

test("port rounding and both ordered arrivals award once", () => {
  const journey = new FirstBuoyJourney();
  const boat = reachFirst(journey);
  assert.equal(journey.markIndex, 1);
  assert.equal(journey.activeCourse().id, "school-buoy-2");
  boat.line(FIRST_BUOY_MARKS[1].x, FIRST_BUOY_MARKS[1].z, true);
  assert.equal(journey.markIndex, 2);
  assert.equal(journey.activeCourse().id, "school-buoy-3");
  boat.line(FIRST_BUOY_MARKS[2].x, FIRST_BUOY_MARKS[2].z, true);
  assert.equal(journey.completed, true);
  assert.equal(journey.activeCourse(), undefined);
  assert.equal(boat.sample(boat.position()), false);
});

test("arrival alone and wrong-way rounding do not advance", () => {
  const approach = new FirstBuoyJourney();
  const boat = driver(approach);
  boat.line(FIRST_BUOY_MARKS[0].x, FIRST_BUOY_MARKS[0].z + 14.5);
  assert.equal(approach.markIndex, 0);
  assert.match(approach.objective(), /Round/);
  const wrong = new FirstBuoyJourney();
  reachFirst(wrong, -1);
  assert.equal(wrong.markIndex, 0);
  assert.equal(wrong.completed, false);
});

test("accepted arc keeps the buoy to port and reverse rounding places it to starboard", () => {
  for (const angle of [Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    const toBuoy = { x: -Math.cos(angle), z: -Math.sin(angle) };
    const ccwForward = { x: -Math.sin(angle), z: Math.cos(angle) };
    const port = { x: -ccwForward.z, z: ccwForward.x };
    assert.ok(port.x * toBuoy.x + port.z * toBuoy.z > .99);
    const cwForward = { x: -ccwForward.x, z: -ccwForward.z };
    const cwPort = { x: -cwForward.z, z: cwForward.x };
    assert.ok(cwPort.x * toBuoy.x + cwPort.z * toBuoy.z < -.99);
  }
});

test("skipping the first buoy cannot complete a later mark", () => {
  const journey = new FirstBuoyJourney(), boat = driver(journey);
  boat.line(FIRST_BUOY_MARKS[2].x, FIRST_BUOY_MARKS[2].z);
  assert.equal(journey.markIndex, 0);
  assert.equal(journey.completed, false);
});

test("drawing sails permit unchanged trim; poor sail flow does not advance", () => {
  for (const bad of [{ luff: 0.3 }, { stall: 0.3 }, { driveForce: 0 }]) {
    const journey = new FirstBuoyJourney(), boat = driver(journey);
    boat.line(FIRST_BUOY_MARKS[0].x, FIRST_BUOY_MARKS[0].z + 14.5, false, { sheet: 0.6, sheetRate: 0, ...bad });
    assert.match(journey.objective(), /Sail/);
  }
  const journey = new FirstBuoyJourney(), boat = reachFirst(journey, 1, { sheet: 0.6, sheetRate: 0 });
  assert.equal(journey.markIndex, 1);
  boat.line(FIRST_BUOY_MARKS[1].x, FIRST_BUOY_MARKS[1].z, true, { sheet: 0.6, sheetRate: 0, rudder: 0 });
  assert.equal(journey.markIndex, 2);
  boat.line(FIRST_BUOY_MARKS[2].x, FIRST_BUOY_MARKS[2].z, true, { sheet: 0.6, sheetRate: 0, rudder: 0 });
  assert.equal(journey.completed, true);
});

test("interrupt preserves completed marks but clears an unfinished rounding", () => {
  const journey = new FirstBuoyJourney(), boat = driver(journey);
  boat.line(FIRST_BUOY_MARKS[0].x, FIRST_BUOY_MARKS[0].z + 14.5);
  assert.match(journey.objective(), /Round/);
  journey.interrupt();
  assert.match(journey.objective(), /Sail/);
  const advanced = new FirstBuoyJourney();
  reachFirst(advanced);
  advanced.interrupt();
  assert.equal(advanced.markIndex, 1);
  assert.equal(advanced.activeCourse().id, "school-buoy-2");
});

test("unsafe contact or a position jump fails without credit", () => {
  for (const unsafe of [true, false]) {
    const journey = new FirstBuoyJourney(), boat = driver(journey), p = boat.position();
    boat.sample({ x: p.x + (unsafe ? 0 : 100), y: p.y }, { unsafe });
    assert.equal(journey.failed, true);
    assert.equal(journey.completed, false);
  }
});


test("dropped render frames preserve witnessed first-buoy progress; real interruptions still clear it", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const dropped = main.slice(main.indexOf("  if (droppedFrame && !isSimulationPaused()) {"), main.indexOf("  if (!portrait) presentationTime"));
  assert.doesNotMatch(dropped, /firstBuoy/);
  assert.ok(main.includes("accumulator + frameDt * simulationTimeScale"));
  assert.ok(main.includes("fixedStep * 5 * simulationTimeScale"));
  assert.match(main, /window.addEventListener\("blur", interruptLessonAttempt\)/);
  assert.match(main, /document.addEventListener\("visibilitychange", interruptLessonAttempt\)/);
  assert.ok(main.includes("if (portrait || document.hidden) interruptLessonAttempt()"));
  const start = main.indexOf("        if (firstBuoy) {", main.indexOf("const eligible ="));
  const end = main.indexOf("        if (dummyRecovery) {", start);
  assert.ok(start >= 0 && end > start);
  const branch = stripTypeScriptTypes(main.slice(start, end), { mode: "transform" });
  const journey = new FirstBuoyJourney();
  let calls = 0;
  const frameLengths = [0.084, 0.120, 1];
  assert.ok(main.includes("const frameDt = Math.min(elapsed, 0.1)"));
  const ctx = { firstBuoy: journey, fixedStep: 1 / 60, observeLesson: () => ctx.observation, state: {}, diagnostics: {}, controls: {}, incident: undefined, dockedAt: undefined, nextIncident: { severity: "none", kind: "none" }, droppedFrame: true };
  const dispatch = (dt, observation) => {
    ctx.observation = observation; ctx.state = { position: observation.position, heading: observation.heading };
    ctx.nextIncident = observation.unsafe ? { severity: "touch", kind: "none" } : { severity: "none", kind: "none" };
    // The actual first-buoy dispatch runs on each retained fixed step, regardless of frame duration.
    const elapsed = frameLengths[calls % frameLengths.length];
    ctx.droppedFrame = elapsed > 5 / 60;
    assert.ok(ctx.droppedFrame);
    assert.ok(Math.min(elapsed, 0.1, 5 / 60) <= 5 / 60);
    calls++; return runInNewContext(branch, ctx);
  };
  const boat = driver(journey, dispatch), target = FIRST_BUOY_MARKS[0];
  boat.line(target.x, target.z + 14.5);
  assert.match(journey.objective(), /Round/);
  for (let i = 1; i <= 1000; i++) {
    const angle = Math.PI / 2 + Math.PI * i / 1000;
    boat.line(target.x + 14.5 * Math.cos(angle), target.z + 14.5 * Math.sin(angle));
  }
  boat.line(target.x, target.z - 15.5, true);
  assert.equal(journey.markIndex, 1);
  assert.ok(calls > 1000);
  const contact = new FirstBuoyJourney();
  ctx.firstBuoy = contact;
  const other = driver(contact, dispatch);
  other.sample(other.position(), { unsafe: true });
  assert.equal(contact.failed, true);
  const jump = new FirstBuoyJourney(); ctx.firstBuoy = jump;
  const jumping = driver(jump, dispatch), p = jumping.position();
  jumping.sample({ x: p.x + 100, y: p.y });
  assert.equal(jump.failed, true);
});

test("actual missed-buoy state clears from the HUD feedback after sailing out", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("  const completedManeuver =", main.indexOf("function updateHud(): void {"));
  const end = main.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start);
  const status = `function updateStatus() {\n${main.slice(start, end)}\n}`;
  const journey = new FirstBuoyJourney(), boat = driver(journey), first = FIRST_BUOY_MARKS[0];
  const elements = { status: { textContent: "Sail to Juniper buoy." }, statusMessage: { textContent: "Tack complete." }, statusFeedback: { textContent: "" } };
  const ctx = { touchCooldown: 0, academy: { view: () => ({ stage: "free-sail" }) }, activitySession: undefined,
    firstBuoy: journey, anchorage: undefined, dummyRecovery: undefined, crossing: undefined, weatherShelter: undefined,
    elements, state: { maneuverCount: 0, lastManeuver: "none" }, lastManeuverCount: 0, lastFirstBuoyHeadline: "Sail to Juniper buoy.",
    lastFlow: "Attached", flow: "Attached", coach: "Watch your course and speed", started: true, dockedAt: undefined,
    storageUnavailable: true, STORAGE_WARNING: "Storage unavailable" };
  boat.line(first.x, first.z + 14.5, false, { forwardSpeed: 4.1 });
  assert.match(journey.objective(), /Slow down before the buoy/);
  runInNewContext(status + " updateStatus();", ctx);
  assert.match(elements.status.textContent, /Slow down before the buoy/);
  boat.line(first.x, first.z + 15.5);
  assert.equal(journey.objective(), "Sail to Juniper buoy.");
  runInNewContext(status + " updateStatus();", ctx);
  assert.equal(elements.status.textContent, "Sail to Juniper buoy. Storage unavailable");
  assert.equal(elements.statusFeedback.textContent, "Tack complete. Storage unavailable");
});
