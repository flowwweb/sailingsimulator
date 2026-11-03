import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runInNewContext } from "node:vm";

const lesson = readFileSync(new URL("../src/game/first-buoy.ts", import.meta.url), "utf8");
const world = readFileSync(new URL("../src/game/world-definition.ts", import.meta.url), "utf8");
const hud = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const start = hud.indexOf("  const completedManeuver =", hud.indexOf("function updateHud(): void {"));
const end = hud.indexOf("\n}", start);
assert.ok(start >= 0 && end > start);
const status = `function updateStatus() {\n${hud.slice(start, end)}\n} updateStatus();`;

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
    const context = { elements, firstBuoy, state: { maneuverCount: 0, lastManeuver: "none" },
      lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
      dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(status, context);
    assert.equal(elements.status.textContent, expected);
    assert.equal(elements.statusMessage.textContent,
      firstBuoy && !firstBuoy.failed && !firstBuoy.completed
        ? "Sail looks steady. Watch your course and speed."
        : expected);
  }
});

test("first-buoy objective retains action feedback and storage warning across updates", () => {
  for (const message of ["Sound muted.", "Reefed mainsail.", "Tack complete."]) {
    const elements = { status: { textContent: message }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
    const context = { elements, firstBuoy: { failed: false, completed: false, objective: () => "Sail to Juniper buoy." },
      state: { maneuverCount: 0, lastManeuver: "none" }, lastManeuverCount: 0,
      lastFlow: "Attached", flow: "Attached", coach: "Flow attached", started: true,
      dockedAt: undefined, storageUnavailable: true, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(`${status} updateStatus();`, context);
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
    const context = { elements, firstBuoy: { failed: false, completed: false, objective: () => "Sail to Juniper buoy." }, state,
      lastManeuverCount: 0, lastFlow, flow, coach, started: true, dockedAt: undefined,
      storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(`${status} updateStatus();`, context);
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
  const context = { elements, input: { releaseAll() {} }, firstBuoy: { failed: false, completed: false, objective: () => "Sail to Juniper buoy." },
    state: { maneuverCount: 0, lastManeuver: "none" }, lastManeuverCount: 0,
    lastFlow: "Attached", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable",
    kind: "first-buoy", FirstBuoyJourney: class { failed = false; completed = false; objective() { return "Sail to Juniper buoy."; } } };
  runInNewContext(`${status} ${open}; setStatusOpen(true);`, context);
  assert.equal(elements.statusMessage.textContent, "Sound muted.");
  assert.equal(elements.statusFeedback.textContent, "Sound muted.");
  runInNewContext(reset, context);
  assert.equal(elements.statusFeedback.textContent, "");
  runInNewContext(status, context);
  assert.equal(elements.statusFeedback.textContent, "Sail looks steady. Watch your course and speed.");
  context.firstBuoy.failed = true;
  runInNewContext(status, context);
  assert.equal(elements.status.textContent, "Journey failed. Open status to retry.");
  assert.equal(elements.statusFeedback.textContent, "");
  context.firstBuoy = undefined;
  runInNewContext(status, context);
  assert.equal(elements.statusFeedback.textContent, "");
});
