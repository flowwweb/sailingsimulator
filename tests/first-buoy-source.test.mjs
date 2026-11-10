import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const lesson = readFileSync(new URL("../src/game/first-buoy.ts", import.meta.url), "utf8");
const world = readFileSync(new URL("../src/game/world-definition.ts", import.meta.url), "utf8");
const hud = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const start = hud.indexOf("  const completedManeuver =", hud.indexOf("function updateHud(): void {"));
const end = hud.indexOf("\n}", start);
assert.ok(start >= 0 && end > start);
const status = `function updateStatus() {\n${hud.slice(start, end)}\n} updateStatus();`;
function statusContext(context) {
  context.touchCooldown ??= 0;
  context.academy ??= { view: () => ({ stage: "free-sail" }) };
  context.activitySession ??= undefined;
  return context;
}


test("first buoy starts about 41m outside the arrival boundary, facing the mark", () => {
  const definition = lesson.match(/export const FIRST_BUOY = (\{[\s\S]*?\}) as const;/);
  const target = world.match(/id: "juniper-buoy",[\s\S]*?x: ([\d.-]+),\s*z: ([\d.-]+)/);
  assert.ok(definition && target);
  const first = runInNewContext(`(${definition[1]})`);
  const dx = Number(target[1]) - first.start.x;
  const dz = Number(target[2]) - first.start.z;
  const distance = Math.hypot(dx, dz);
  assert.ok(distance > 54 && distance < 58);
  assert.ok(distance - first.radiusM > first.minTravelM);
  assert.ok(Math.abs(Math.atan2(dx, dz) * 180 / Math.PI - first.startHeadingDegrees) < 2);
});

test("objective and failure take priority only in the first-buoy lesson", () => {
  for (const [firstBuoy, expected] of [
    [{ failed: false, completed: false, objective: () => "Sail to Juniper buoy." }, "Sail to Juniper buoy."],
    [{ failed: true, completed: false }, "Journey failed. Open status to retry."],
    [{ failed: false, completed: true }, "Three buoys reached under control. Journey complete."],
    [undefined, "Attached. Flow attached."],
  ]) {
    const elements = { status: { textContent: "Ready" }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
    const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, elements, firstBuoy, state: { maneuverCount: 0, lastManeuver: "none" },
      lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
      dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(status, statusContext(context));
    assert.equal(elements.status.textContent, expected);
    assert.equal(elements.statusMessage.textContent,
      firstBuoy && !firstBuoy.failed && !firstBuoy.completed
        ? "Sail looks steady. Watch your course and speed."
        : expected);
  }
});

test("crossing status makes the active instruction and failure visible", () => {
  for (const [stage, expected] of [["build-speed", "Sail northeast to begin the crossing."], ["crossing", "Keep clear of the starboard-tack boat."], ["failed", "Crossing failed. Open status to retry."], ["complete", "Crossing complete."]]) {
    const elements = { status: { textContent: "Ready" }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
    const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, weatherShelter: undefined, crossing: { stage }, elements, firstBuoy: undefined, state: { maneuverCount: 0, lastManeuver: "none" },
      lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
      dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(status, statusContext(context));
    assert.equal(elements.status.textContent, expected);
  }
});

test("collision warning survives an Attached flow update above the academy objective, then gives way after cooldown", () => {
  const startTouch = hud.indexOf("          if (touchCooldown <= 0) {");
  const endTouch = hud.indexOf("\n          }", startTouch) + 12;
  assert.ok(startTouch >= 0 && endTouch > startTouch);
  const touch = hud.slice(startTouch, endTouch);
  const elements = { status: { textContent: "Luffing. Sheet in." }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
  const context = statusContext({ touchCooldown: 0, nextIncident: { object: { name: "Juniper buoy" } },
    academy: { view: () => ({ stage: "close-hauled", title: "Sail close-hauled", feedback: "Trim gently." }) },
    anchorage: undefined, dummyRecovery: undefined, crossing: undefined, weatherShelter: undefined, firstBuoy: undefined, activitySession: undefined,
    elements, state: { maneuverCount: 0, lastManeuver: "none" }, lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true, dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" });
  runInNewContext(`${touch}\n${status}`, context);
  assert.equal(elements.status.textContent, "Touched Juniper buoy. Steer clear and continue.");
  assert.equal(elements.statusMessage.textContent, elements.status.textContent);
  assert.equal(elements.statusFeedback.textContent, "");
  runInNewContext(status, context);
  assert.equal(elements.status.textContent, "Touched Juniper buoy. Steer clear and continue.");
  context.touchCooldown = 0;
  runInNewContext(status, context);
  assert.equal(elements.status.textContent, "Sail close-hauled");
  assert.equal(elements.statusMessage.textContent, "Trim gently.");
});

test("weather failure remains visible through sail feedback and clears its destination", () => {
  const elements = { status: { textContent: "Ready" }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
  const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, crossing: undefined, firstBuoy: undefined,
    weatherShelter: { stage: "failed" }, activityView: { instruction: "Contact interrupted this attempt. Recover the boat, then retry.", completed: false },
    activitySession: { activity: { id: "weather-shelter" } }, elements,
    state: { maneuverCount: 1, lastManeuver: "tack" }, lastManeuverCount: 0,
    lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
  runInNewContext(`${status} updateStatus();`, statusContext(context));
  assert.equal(elements.status.textContent, "Contact interrupted this attempt. Recover the boat, then retry.");
  assert.equal(elements.statusMessage.textContent, elements.status.textContent);
  const startCourse = hud.indexOf("function activeCourse(): WorldActivity | undefined {");
  const endCourse = hud.indexOf("\n}", startCourse) + 2;
  assert.ok(startCourse >= 0 && endCourse > startCourse);
  const course = hud.slice(startCourse, endCourse).replace("function activeCourse(): WorldActivity | undefined", "function activeCourse()");
  assert.equal(runInNewContext(`${course}; activeCourse();`, context), undefined);
  context.weatherShelter = { stage: "forecast" };
  context.activityView.instruction = "Forecast: wind increasing. Plan your return to Juniper.";
  runInNewContext(`${status} updateStatus();`, statusContext(context));
  assert.equal(elements.status.textContent, context.activityView.instruction);
  assert.equal(runInNewContext(`${course}; activeCourse();`, context).id, "weather-shelter");
});

test("anchorage and weather use their own active chart destinations", () => {
  const start = hud.indexOf("function activeCourse():");
  const end = hud.indexOf("\nfunction selectedActivity", start);
  assert.ok(start >= 0 && end > start);
  const course = hud.slice(start, end).replace("function activeCourse(): WorldActivity | undefined", "function activeCourse()");
  const anchorActivity = { id: "anchorage-practice" };
  const context = { lastFirstBuoyHeadline: "", anchorage: { stage: "holding" }, weatherShelter: undefined, dummyRecovery: undefined, firstBuoy: undefined,
    FAIR_WINDS_WORLD: { activities: [anchorActivity] }, activityView: undefined, activitySession: undefined };
  assert.equal(runInNewContext(`${course}; activeCourse();`, context), anchorActivity);
  context.anchorage.stage = "complete";
  assert.equal(runInNewContext(`${course}; activeCourse();`, context), undefined);
  context.anchorage.stage = "failed";
  assert.equal(runInNewContext(`${course}; activeCourse();`, context), undefined);
  assert.match(hud, /firstBuoy \|\| dummyRecovery \|\| weatherShelter \|\| anchorage \? activeCourse\(\) : selectedActivity\(\)/);
});

test("first-buoy objective retains action feedback and storage warning across updates", () => {
  for (const message of ["Sound muted.", "Reefed mainsail.", "Tack complete."]) {
    const elements = { status: { textContent: message }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
    const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, elements, firstBuoy: { failed: false, completed: false, objective: () => "Sail to Juniper buoy." },
      state: { maneuverCount: 0, lastManeuver: "none" }, lastManeuverCount: 0,
      lastFlow: "Attached", flow: "Attached", coach: "Flow attached", started: true,
      dockedAt: undefined, storageUnavailable: true, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(`${status} updateStatus();`, statusContext(context));
    assert.equal(elements.status.textContent, "Sail to Juniper buoy. Storage unavailable");
    assert.equal(elements.statusMessage.textContent, `${message} Storage unavailable`);
    assert.equal(elements.statusFeedback.textContent, elements.statusMessage.textContent);
  }
});

test("first-buoy objective retains actual maneuver and flow transitions", () => {
  for (const [state, lastFlow, flow, coach, expected] of [
    [{ maneuverCount: 1, lastManeuver: "tack" }, "Attached", "Attached", "Flow attached", "Tack complete. Build speed on the new side and retrim."],
    [{ maneuverCount: 1, lastManeuver: "gybe" }, "Attached", "Attached", "Flow attached", "Gybe complete. The boom crossed with the wind astern; steady the helm and retrim."],
    [{ maneuverCount: 0, lastManeuver: "none" }, "Attached", "Luffing", "Sheet in or bear away", "Luffing. Sheet in or bear away."],
  ]) {
    const elements = { status: { textContent: "Sail to Juniper buoy." }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
    const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, elements, firstBuoy: { failed: false, completed: false, objective: () => "Sail to Juniper buoy." }, state,
      lastManeuverCount: 0, lastFlow, flow, coach, started: true, dockedAt: undefined,
      storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(`${status} updateStatus();`, statusContext(context));
    assert.equal(elements.status.textContent, "Sail to Juniper buoy.");
    assert.equal(elements.statusMessage.textContent, expected);
    assert.equal(elements.statusFeedback.textContent, expected);
  }
});

test("opening details and restarting a lesson do not lose or reuse feedback", () => {
  const openStart = hud.indexOf("function setStatusOpen(");
  const openEnd = hud.indexOf("\n}", openStart) + 2;
  const open = hud.slice(openStart, openEnd)
    .replace("open: boolean, restoreFocus = true): void", "open, restoreFocus = true)");
  const resetStart = hud.indexOf('  firstBuoy = kind === "first-buoy"', hud.indexOf("function prepareLessonAttempt("));
  const resetEnd = hud.indexOf("  progress.activeIntroduction", resetStart);
  const reset = hud.slice(resetStart, resetEnd);
  assert.ok(openStart >= 0 && openEnd > openStart && resetStart >= 0 && resetEnd > resetStart);
  const elements = { status: { textContent: "Sound muted." }, statusMessage: { textContent: "" },
    statusFeedback: { textContent: "" }, statusDetails: { hidden: true },
    statusToggle: { setAttribute() {}, focus() {} } };
  const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, elements, input: { releaseAll() {} }, firstBuoy: { failed: false, completed: false, objective: () => "Sail to Juniper buoy." },
    state: { maneuverCount: 0, lastManeuver: "none" }, lastManeuverCount: 0,
    lastFlow: "Attached", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable",
    kind: "first-buoy", FirstBuoyJourney: class { failed = false; completed = false; objective() { return "Sail to Juniper buoy."; } } };
  runInNewContext(`${status} ${open}; setStatusOpen(true);`, statusContext(context));
  assert.equal(elements.statusMessage.textContent, "Sound muted.");
  assert.equal(elements.statusFeedback.textContent, "Sound muted.");
  runInNewContext(reset, statusContext(context));
  assert.equal(elements.statusFeedback.textContent, "");
  runInNewContext(status, statusContext(context));
  assert.equal(elements.statusFeedback.textContent, "Sail looks steady. Watch your course and speed.");
  context.firstBuoy.failed = true;
  runInNewContext(status, statusContext(context));
  assert.equal(elements.status.textContent, "Journey failed. Open status to retry.");
  assert.equal(elements.statusFeedback.textContent, "");
  context.firstBuoy = undefined;
  runInNewContext(status, statusContext(context));
  assert.equal(elements.statusFeedback.textContent, "");
});


test("status pauses sailing without erasing the attempt and resumes on close", () => {
  function extract(name) {
    const start = hud.indexOf("function " + name + "(");
    const end = hud.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start, name);
    return stripTypeScriptTypes(hud.slice(start, end), { mode: "transform" });
  }
  const start = hud.indexOf("  if (simulationPaused) {");
  const end = hud.indexOf("  if (canControlBoat()", start);
  assert.ok(start >= 0 && end > start);
  const pausedBranch = hud.slice(start, end);
  let interrupted = 0, released = 0;
  const firstBuoy = { failed: false, completed: false, interrupt() { interrupted++; } };
  const state = { x: 12 }, elements = { statusDetails: { hidden: true }, status: { textContent: "" }, statusMessage: {}, statusToggle: { setAttribute() {}, focus() {} } };
  const ctx = { elements, firstBuoy, state, previousState: {}, accumulator: 0.03, started: true, paused: false,
    developmentPreviewFrozen: false, portrait: false, document: { hidden: false }, simulationPaused: false,
    isConditionsOpen: () => false, isChartOpen: () => false, required: () => ({ hidden: true }),
    input: { releaseAll() { released++; } }, audio: { stopRadioNotice() {} }, radioSubtitleSeconds: 0,
    academy: { interrupt() { interrupted++; } }, dummyRecovery: undefined, crossing: undefined };
  runInNewContext(extract("setStatusOpen") + "\n" + extract("isSimulationPaused") + "\n" + extract("isNonStatusSimulationPaused"), statusContext(ctx));
  runInNewContext("setStatusOpen(true); simulationPaused = isSimulationPaused();", statusContext(ctx));
  assert.equal(ctx.simulationPaused, true);
  assert.equal(ctx.accumulator, 0);
  assert.equal(ctx.previousState, state);
  runInNewContext(pausedBranch, statusContext(ctx));
  assert.equal(interrupted, 0);
  assert.ok(released > 0);
  runInNewContext("setStatusOpen(false); simulationPaused = isSimulationPaused();", statusContext(ctx));
  assert.equal(ctx.simulationPaused, false);
  ctx.document.hidden = true; ctx.simulationPaused = true;
  runInNewContext(pausedBranch, statusContext(ctx));
  assert.equal(interrupted, 2, "hidden page interrupts both academy and buoy");
});

test("a slow frame while status is open does not clear lesson witnesses", () => {
  const begin = hud.indexOf("  if (droppedFrame && !isSimulationPaused()) {");
  const end = hud.indexOf("  if (!portrait) presentationTime", begin);
  assert.ok(begin >= 0 && end > begin);
  function extract(name) {
    const start = hud.indexOf("function " + name + "(");
    const finish = hud.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && finish > start);
    return stripTypeScriptTypes(hud.slice(start, finish), { mode: "transform" });
  }
  let interruptions = 0;
  const ctx = { droppedFrame: true, started: true, paused: false, developmentPreviewFrozen: false,
    elements: { statusDetails: { hidden: false } }, required: () => ({ hidden: true }),
    isConditionsOpen: () => false, isChartOpen: () => false, accumulator: 0,
    academy: { interrupt() { interruptions++; } }, dummyRecovery: { interrupt() { interruptions++; } },
    weatherShelter: { interrupt() { interruptions++; } } };
  runInNewContext(extract("isSimulationPaused") + "\n" + extract("isNonStatusSimulationPaused"), statusContext(ctx));
  runInNewContext(hud.slice(begin, end), statusContext(ctx));
  assert.equal(interruptions, 0);
  ctx.elements.statusDetails.hidden = true;
  runInNewContext(hud.slice(begin, end), statusContext(ctx));
  assert.equal(interruptions, 0);
});

test("missed buoy cue clears on exit without becoming sail feedback", () => {
  let objective = "Slow down before the buoy. Sail outside the buoy zone, then approach again.";
  const elements = { status: { textContent: "Sail to Juniper buoy." }, statusMessage: { textContent: "Tack complete. Build speed on the new side and retrim." }, statusFeedback: { textContent: "" } };
  const context = { lastFirstBuoyHeadline: "", anchorage: undefined, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, elements,
    firstBuoy: { failed: false, completed: false, objective: () => objective }, state: { maneuverCount: 0, lastManeuver: "none" },
    lastManeuverCount: 0, lastFlow: "Attached", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
  runInNewContext(`${status} updateStatus();`, statusContext(context));
  assert.equal(elements.status.textContent, objective);
  objective = "Sail to Juniper buoy.";
  runInNewContext(`${status} updateStatus();`, statusContext(context));
  assert.equal(elements.status.textContent, objective);
  assert.equal(elements.statusFeedback.textContent, "Tack complete. Build speed on the new side and retrim.");
});
