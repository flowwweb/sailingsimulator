import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const recovery = stripTypeScriptTypes(main.slice(main.indexOf("function recoverBoat(): void {"), main.indexOf("function beginIncident(")), { mode: "strip" });
const headlineStart = main.indexOf("  // Active lessons lead with the action;");
const headline = stripTypeScriptTypes(main.slice(headlineStart, main.indexOf("\n  if (anchorage) {", headlineStart)), { mode: "strip" });
const activitySource = readFileSync(new URL("../src/game/activity-session.ts", import.meta.url), "utf8");
const activityJs = stripTypeScriptTypes(activitySource, { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const ActivitySession = runInNewContext(`${activityJs}\nActivitySession`, { SHELTER_DEPARTURE_DISTANCE: 150 });

test("deep-water recovery ends interrupted activities before teleportation can earn distance or arrival credit", () => {
  const observation = { dt: .1, x: 1000, z: 1000, speed: 2, heading: 0, attached: 1, tackCount: 0, reefed: false, heelRadians: 0, depth: 8, incident: false };
  for (const id of ["broadwater-crossing", "channel-departure"]) {
    const session = new ActivitySession({ id, x: 0, z: 0, title: "Practice passage", kind: "navigation" });
    assert.equal(session.update(observation).completed, false);
    let persisted = 0, shelterStopped = 0;
    const context = { anchorage: undefined, crossing: undefined, dummyRecovery: undefined, firstBuoy: undefined,
      activitySession: session, activityView: { completed: false }, interruptLessonAttempt() {},
      stopWeatherShelter() { shelterStopped++; }, state: { position: { x: 1000, y: 1000 } }, previousState: {},
      FAIR_WINDS_WORLD: { recoverySpawn: { x: 0, y: 0 } }, createGameState: spawn => ({ position: { ...spawn }, velocity: { x: 0, y: 0 } }),
      computeSailAerodynamics() {}, computeHeadsailAerodynamics() {}, diagnostics: {}, headsailDiagnostics: {}, weather: { trueWind: {} }, activeBoat: {},
      academy: { skip() {} }, persistProgress() { persisted++; }, audio: { resetMotionState() {} }, lessonCompletedAt: 0, simulationTime: 1, lastManeuverCount: 3,
      clearDocking() {}, clearIncident() {}, world: { resetWake() {} }, elements: { status: { textContent: "" } } };
    runInNewContext(`${recovery}\nrecoverBoat();`, context);
    assert.equal(context.activitySession, undefined);
    assert.equal(context.activityView, undefined);
    assert.equal(context.state.position.x, 0);
    assert.equal(context.previousState, context.state);
    assert.equal(shelterStopped, 1);
    assert.equal(persisted, 1);
    assert.match(context.elements.status.textContent, /Practice passage on the chart to retry/);
  }
});

test("academy and dummy actions lead the status while contextual trim feedback stays separate", () => {
  const status = (stage, title, dummyRecovery) => {
    const elements = { status: { textContent: "Luffing. Sheet in or bear away." }, statusMessage: {}, lessonInstruction: { textContent: "Sail 40 m away from the dummy, then turn back." } };
    const context = { academy: { view: () => ({ stage, title, feedback: "Ease the sail as you turn." }) }, firstBuoy: undefined, activitySession: undefined, dummyRecovery, anchorage: undefined, crossing: undefined, completedManeuver: false, coach: "Sheet in or bear away", elements };
    runInNewContext(`(() => { ${headline} })()`, context);
    return elements;
  };
  for (const [stage, title] of [["close-hauled", "Sail close-hauled"], ["beam-reach", "Settle on a beam reach"], ["tack", "Make one clean tack"]]) {
    const elements = status(stage, title);
    assert.equal(elements.status.textContent, title);
    assert.equal(elements.statusMessage.textContent, "Ease the sail as you turn.");
  }
  const dummy = status("free-sail", "Free sail", { stage: "depart" });
  assert.match(dummy.status.textContent, /Sail 40 m away/);
  assert.equal(dummy.statusMessage.textContent, "Sheet in or bear away");
  const free = status("free-sail", "Free sail");
  assert.equal(free.status.textContent, "Luffing. Sheet in or bear away.");
});
