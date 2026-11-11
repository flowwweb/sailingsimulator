import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
const strip = (source) => stripTypeScriptTypes(source, { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const academyCode = strip(read("game/academy"));
const progressCode = strip(read("game/progress"));
const main = read("main");
function extract(name) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start, name);
  return stripTypeScriptTypes(main.slice(start, end), { mode: "transform" });
}
const completionStart = main.indexOf("function renderCompletionProgress(");
const completionEnd = main.indexOf("\n}", main.indexOf("function closeCompletion(", completionStart)) + 2;
assert.ok(completionStart >= 0 && completionEnd > completionStart);
const completionCode = stripTypeScriptTypes(main.slice(completionStart, completionEnd), { mode: "transform" });
const base = { attached: .9, stall: 0, pointOfSail: "Beam reach", tackCount: 0, gybeCount: 0,
  reefed: false, heelRadians: .1, luff: 0, sailDeployment: 1, sailsRaised: true,
  forwardSpeed: 1, driveForce: 100, sheet: .6, sheetRate: 0, rudder: 0,
  apparentWindAngle: Math.PI / 2, yawRate: 0, boomAngle: -.8, desiredBoomAngle: -.8 };

test("earned points-of-sail completion advances, resets, saves and replays without invented XP", () => {
  const nodes = new Map();
  const required = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", style: {}, dataset: {}, setAttribute() {}, focus() {} });
    return nodes.get(selector);
  };
  const ctx = { FIRST_BUOY: { id: "intro.buoy-1", revision: 1, seed: 1, start: { x: 0, z: 0 }, windFromDegrees: 90, startHeadingDegrees: 0 },
    FIRST_COURSE_ID: "intro.three-buoy-course", required,
    elements: { gameShell: { inert: false }, statusToggle: { focus() {} }, status: { textContent: "" },
      statusMessage: { textContent: "" }, statusFeedback: { textContent: "" }, statusDetails: { hidden: false }, statusToggle: { setAttribute() {}, focus() {} } },
    input: { releaseAll() {} }, window: { matchMedia: () => ({ matches: true }) },
    completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false, completionNextLesson: undefined,
    cancelAnimationFrame() {}, setRadioOpen() {}, stopWeatherShelter() {}, resetRadio() {},
    storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", firstBuoy: undefined, dummyRecovery: undefined,
    crossing: undefined, anchorage: undefined, accumulator: 0, fixedStep: 1 / 60, simulationTime: 0,
    HARBOR_20: { collision: { halfLength: 2.2, halfBeam: .78 }, hull: { draft: .82 } }, activeBoat: {}, createLessonWeather: () => ({ wind: {} }),
    weatherSystem: { setConfig() {}, sample: () => ({ trueWind: {} }) }, weatherConfig: {}, weather: {},
    createLessonState: () => ({ tackCount: 0, gybeCount: 0 }), createGameState: () => ({}),
    computeSailAerodynamics: () => ({}), computeHeadsailAerodynamics: () => ({}), observeLesson: () => base,
    clearIncident() {}, clearDocking() {}, world: { setBoat() {}, resetWake() {}, resetCamera() {}, setCrossingBoat() {}, setCrossingExercise() {}, setTrainingDummy() {} },
    audio: { resetMotionState() {} }, syncWeatherControls() {}, updateHud() {},
    state: {}, previousState: {}, diagnostics: {}, headsailDiagnostics: {}, activitySession: undefined, activityView: undefined,
    lastManeuverCount: 0, lessonCompletedAt: 0, started: true, saved: "", DUMMY_COURSE: { x: 5, z: 0 },
    closeTitleDialog() {}, beginSailing() {}, degrees: (value) => value * Math.PI / 180,
    selectedActivityId: "", FAIR_WINDS_WORLD: { activities: [{ id: "anchorage-practice", x: 1400, z: -200, title: "Anchorage" }] },
    setChartOpen() {}, syncChartActivityList() {}, renderChart() {}, updateDestination() {} };
  runInNewContext(`${academyCode}\n${progressCode}\n${strip(read("game/crossing-encounter"))}\n${strip(read("game/dummy-recovery"))}\n${strip(read("game/anchoring"))}\n${strip(read("game/anchorage-exercise"))}\n${extract("setStatusOpen")}
${extract("selectedActivity")}\n${extract("selectChartActivity")}\n${extract("startAnchorage")}\n${extract("stopDummyRecovery")}\n${extract("startDummyRecovery")}\n${extract("prepareLessonAttempt")}\n${extract("resetBoat")}\n${completionCode}
    let academy = new SailingAcademy(); let progress = createProgress();
    function interruptLessonAttempt() { academy.interrupt(); }
    function persistProgress() { saved = JSON.stringify(progress); }
    academy.restoreObjective(3);`, ctx);
  // Keep all ticks in the same context so the real academy and progress state persist.
  const step = (obs) => { ctx.observation = obs; runInNewContext("{ const target = academy.objectiveIndex(); if (academy.update(1 / 60, observation)) progress = recordAcademyObjective(progress, target); }", ctx); };
  const hold = (obs) => { for (let i = 0; i < 180; i++) step(obs); };
  step({ ...base, apparentWindAngle: 70 * Math.PI / 180 });
  hold({ ...base, pointOfSail: "Close-hauled", apparentWindAngle: 48 * Math.PI / 180, rudder: .2 });
  hold({ ...base, pointOfSail: "Beam reach", apparentWindAngle: 90 * Math.PI / 180, rudder: .2 });
  hold({ ...base, pointOfSail: "Broad reach", apparentWindAngle: 128 * Math.PI / 180, rudder: .2 });
  assert.equal(runInNewContext("academy.view().stage", ctx), "lesson-complete");
  assert.equal(runInNewContext("sailingRank(progress).xp", ctx), 100);
  runInNewContext('showCompletion("Find your course", rankForXp(0)); advanceCompletion(); advanceCompletion();', ctx);
  assert.equal(runInNewContext("academy.objectiveIndex()", ctx), 6);
  assert.equal(runInNewContext("sailingRank(progress).xp", ctx), 100);
  runInNewContext("resetBoat();", ctx);
  assert.equal(runInNewContext("academy.objectiveIndex()", ctx), 6);
  assert.equal(runInNewContext("sailingRank(parseProgress(saved)).xp", ctx), 100);
  assert.equal(runInNewContext("parseProgress(saved).completedIntroductions === undefined", ctx), true);
  runInNewContext("let replayBefore = sailingRank(progress); academy.restoreObjective(3);", ctx);
  step({ ...base, apparentWindAngle: 70 * Math.PI / 180 });
  hold({ ...base, pointOfSail: "Close-hauled", apparentWindAngle: 48 * Math.PI / 180, rudder: .2 });
  hold({ ...base, pointOfSail: "Beam reach", apparentWindAngle: 90 * Math.PI / 180, rudder: .2 });
  hold({ ...base, pointOfSail: "Broad reach", apparentWindAngle: 128 * Math.PI / 180, rudder: .2 });
  assert.equal(runInNewContext("academy.view().stage", ctx), "lesson-complete");
  runInNewContext('showCompletion("Find your course", replayBefore);', ctx);
  assert.equal(required("#completion-reward").textContent, "Previously completed");
  ctx.storageUnavailable = true;
  runInNewContext('showCompletion("Find your course", sailingRank(progress));', ctx);
  assert.match(required("#completion-reward").textContent, /Storage unavailable/);
  assert.equal(runInNewContext("sailingRank(parseProgress(null)).xp", ctx), 0);

  // A real encounter, not a preset completion flag, grants the crossing reward.
  ctx.storageUnavailable = false;
  runInNewContext("closeCompletion(); crossing = new CrossingEncounter();", ctx);
  const player = { x: 0, z: 0, heading: Math.PI / 4, velocityX: 1.2, velocityZ: 1.2,
    rudder: 0, unsafe: false, sailsRaised: true, sailSide: 1 };
  ctx.player = player;
  runInNewContext("crossing.update(1 / 60, player);", ctx);
  for (let t = 0; t < 110 * 60 && runInNewContext('crossing.stage === "crossing"', ctx); t++) {
    player.heading = Math.PI / 4 + (t > 240 ? Math.PI / 4 : 0);
    player.velocityX = Math.sin(player.heading) * 1.7; player.velocityZ = Math.cos(player.heading) * 1.7;
    player.x += player.velocityX / 60; player.z += player.velocityZ / 60; player.rudder = t > 240 ? 1 : 0;
    runInNewContext("crossing.update(1 / 60, player);", ctx);
  }
  assert.equal(runInNewContext("crossing.stage", ctx), "complete");
  runInNewContext('let crossingBefore = sailingRank(progress); if (crossing.stage === "complete") { progress.completedCrossing = true; persistProgress(); showCompletion("Crossing traffic", crossingBefore); } advanceCompletion(); advanceCompletion();', ctx);
  assert.equal(runInNewContext("dummyRecovery.stage", ctx), "depart");
  assert.equal(runInNewContext("crossing === undefined", ctx), true);
  assert.equal(runInNewContext("sailingRank(parseProgress(saved)).xp", ctx), 200);

  const dummyTick = (x) => { ctx.dummyX = x; runInNewContext("dummyRecovery.update(1 / 60, { x: DUMMY_COURSE.x + dummyX, z: DUMMY_COURSE.z }, .4, false, .5 + dummyX * .002, 1, dummyX * .002, .2, 0);", ctx); };
  const travel = (from, to) => { const direction = Math.sign(to - from); for (let x = from; direction * (to - x) > 0; x += direction * .1) dummyTick(x); dummyTick(to); };
  assert.equal(runInNewContext("dummyRecovery.recover()", ctx), false);
  travel(5, 41); travel(41, 1.8); for (let i = 0; i < 190; i++) dummyTick(1.8);
  assert.equal(runInNewContext("dummyRecovery.stage", ctx), "ready");
  const recoverStart = main.indexOf('  required("#recover-training-dummy").addEventListener("click", () => {');
  const recoverEnd = main.indexOf("\n  });", recoverStart);
  assert.ok(recoverStart >= 0 && recoverEnd > recoverStart);
  const recoverBody = main.slice(main.indexOf("{", recoverStart) + 1, recoverEnd);
  runInNewContext(`(() => { ${recoverBody} })();`, ctx);
  assert.equal(ctx.elements.statusDetails.hidden, true);
  runInNewContext(`advanceCompletion(); advanceCompletion();`, ctx);
  assert.equal(runInNewContext("anchorage.stage", ctx), "approach");
  assert.equal(runInNewContext("dummyRecovery === undefined", ctx), true);
  assert.equal(runInNewContext("sailingRank(parseProgress(saved)).xp", ctx), 300);
  runInNewContext("resetBoat();", ctx);
  assert.equal(runInNewContext("anchorage.stage", ctx), "approach");
  assert.equal(runInNewContext("progress.completedAnchorage === true", ctx), false);
});


test("academy labels match the six-lesson chooser and distinguish trim practice", () => {
  const ctx = {};
  runInNewContext(academyCode + "\nlet academy = new SailingAcademy();", ctx);
  const view = (objective) => { runInNewContext("academy.restoreObjective(" + objective + ")", ctx); return runInNewContext("academy.view()", ctx); };
  assert.equal(view(0).eyebrow, "Sail trim practice · Objective 1 of 3");
  assert.equal(view(3).eyebrow, "Lesson 2 of 6 · Objective 1 of 3");
  assert.equal(view(6).eyebrow, "Lesson 3 of 6 · Objective 1 of 3");
  runInNewContext("academy.restoreLessonComplete(0)", ctx);
  assert.equal(runInNewContext("academy.view().eyebrow", ctx), "Sail trim practice complete");
  runInNewContext("academy.restoreLessonComplete(1)", ctx);
  assert.equal(runInNewContext("academy.view().eyebrow", ctx), "Lesson 2 of 6 complete");
  assert.ok(main.includes('lessonView.lesson === 0 ? "Sail trim practice"'));
});

test("completed sailing skills open the chooser from the title", () => {
  const start = main.indexOf('  elements.continueLesson.addEventListener("click", () => {');
  const end = main.indexOf('\n  });', start) + 6;
  assert.ok(start >= 0 && end > start);
  const handler = main.slice(start, end);
  let callback, chooser = 0, sailed = 0;
  const academy = { view: () => ({ stage: "complete", objective: 0 }) };
  const ctx = { academy, progress: { completedIntroductions: { "intro.three-buoy-course": 1 } }, FIRST_BUOY: { id: "intro.buoy-1" }, FIRST_COURSE_ID: "intro.three-buoy-course",
    elements: { continueLesson: { addEventListener(_event, fn) { callback = fn; } } },
    openLessonChooser() { chooser++; }, beginSailing() { sailed++; } };
  runInNewContext(handler, ctx); callback();
  assert.equal(chooser, 1); assert.equal(sailed, 0);
  academy.view = () => ({ stage: "lesson-complete", objective: 3 }); callback();
  assert.equal(chooser, 2); assert.equal(sailed, 0);
  assert.ok(readFileSync(new URL("../index.html", import.meta.url), "utf8").includes('hidden>Continue</button>'));
  assert.ok(academyCode.includes('eyebrow: "Sailing skills complete"'));
});

test("retry and free sail close status before transitioning and restore focus", () => {
  const start = main.indexOf('  elements.lessonSkip.addEventListener("click", () => {');
  const end = main.indexOf("\n  });", start) + 6;
  assert.ok(start >= 0 && end > start);
  let callback, focus = 0, action = "";
  const elements = { lessonSkip: { addEventListener(_event, fn) { callback = fn; } },
    statusDetails: { hidden: false }, status: { textContent: "" }, statusMessage: {},
    statusToggle: { setAttribute() {}, focus() { focus++; } } };
  const ctx = { elements, input: { releaseAll() {} }, state: {}, firstBuoy: { failed: true, completed: false },
    weatherShelter: undefined, incident: undefined, anchorage: undefined, crossing: undefined, dummyRecovery: undefined,
    activitySession: undefined, academy: { view: () => ({ objective: 0, stage: "trim" }), skip() { action = "free sail"; } },
    prepareLessonAttempt(kind) { assert.equal(elements.statusDetails.hidden, true); action = kind; },
    interruptLessonAttempt() {}, persistProgress() {}, updateLesson() {}, simulationTime: 0, lessonCompletedAt: 0 };
  runInNewContext(extract("setStatusOpen") + "\n" + main.slice(start, end), ctx);
  callback(); assert.equal(action, "first-buoy"); assert.equal(focus, 1);
  elements.statusDetails.hidden = false; ctx.firstBuoy = undefined;
  callback(); assert.equal(action, "free sail"); assert.equal(elements.statusDetails.hidden, true); assert.equal(focus, 2);
});

test("academy observes bounded slow-frame ticks but interrupts on contact and invalid input", () => {
  const droppedStart = main.indexOf("  if (droppedFrame && !isSimulationPaused()) {");
  const droppedEnd = main.indexOf("  if (!portrait) presentationTime", droppedStart);
  const eligibleStart = main.indexOf("        const eligible = ", main.indexOf("function loop("));
  const eligibleEnd = main.indexOf(";", eligibleStart) + 1;
  const academyStart = main.indexOf("        if (!eligible || firstBuoy || dummyRecovery || crossing)", eligibleEnd);
  const academyEnd = main.indexOf("        updateActivitySession(", academyStart);
  assert.ok(droppedStart >= 0 && droppedEnd > droppedStart && eligibleStart >= 0 && academyStart > eligibleEnd && academyEnd > academyStart);
  const dispatch = stripTypeScriptTypes(main.slice(eligibleStart, eligibleEnd) + "\n" + main.slice(academyStart, academyEnd), { mode: "transform" });
  const frame = main.slice(droppedStart, droppedEnd);
  const ctx = { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course",
    droppedFrame: true, isSimulationPaused: () => false, dummyRecovery: undefined, weatherShelter: undefined,
    crossing: undefined, firstBuoy: undefined, accumulator: 0, incident: undefined, dockedAt: undefined,
    activitySession: undefined, nextIncident: { kind: "none", severity: "none" }, fixedStep: 1 / 60,
    simulationTimeScale: 1, state: {}, diagnostics: {}, controls: {}, elements: { status: {} },
    observeLesson: () => ctx.observation, persistProgress() {}, showCompletion() {} };
  runInNewContext(`${academyCode}\n${progressCode}\nlet academy = new SailingAcademy(); let progress = createProgress(); academy.restoreObjective(3);`, ctx);
  ctx.observation = { ...base, apparentWindAngle: 70 * Math.PI / 180 };
  runInNewContext("{\n" + frame + "\n" + dispatch + "\n}", ctx);
  ctx.observation = { ...base, pointOfSail: "Close-hauled", apparentWindAngle: 48 * Math.PI / 180, rudder: .2 };
  for (let i = 0; i < 100; i++) runInNewContext("{\n" + frame + "\n" + dispatch + "\n}", ctx);
  assert.equal(runInNewContext("academy.objectiveIndex()", ctx), 4);
  assert.equal(runInNewContext("progress.completedObjectives.includes(3)", ctx), true);
  runInNewContext("academy.restoreObjective(3)", ctx);
  ctx.nextIncident = { kind: "none", severity: "touch" };
  for (let i = 0; i < 100; i++) runInNewContext("{\n" + frame + "\n" + dispatch + "\n}", ctx);
  assert.equal(runInNewContext("academy.objectiveIndex()", ctx), 3);
  ctx.nextIncident = { kind: "none", severity: "none" };
  ctx.observation = { ...base, apparentWindAngle: NaN };
  for (let i = 0; i < 100; i++) runInNewContext("{\n" + frame + "\n" + dispatch + "\n}", ctx);
  assert.equal(runInNewContext("academy.objectiveIndex()", ctx), 3);
});
