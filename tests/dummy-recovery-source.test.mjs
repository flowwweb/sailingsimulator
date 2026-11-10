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

test("the existing dummy HUD shows assessor guidance, bearing and real hold progress", () => {
  const session = make(); travel(session, 5, 41); travel(session, 41, 1.8);
  for (let i = 0; i < 60; i++) tick(session, 1.8);
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("function updateLesson(");
  const end = main.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  const update = stripTypeScriptTypes(main.slice(start, end), { mode: "transform" });
  const headlineStart = main.indexOf("  const academyView = academy.view();", main.indexOf("function updateHud("));
  const headlineEnd = main.indexOf("\n}", headlineStart);
  assert.ok(headlineStart > 0 && headlineEnd > headlineStart);
  const headline = stripTypeScriptTypes(main.slice(headlineStart, headlineEnd), { mode: "transform" });
  const coachStart = main.indexOf("  const coach =", main.indexOf("function updateHud("));
  const coachEnd = main.indexOf("  const rudderDegrees", coachStart);
  const coachOutputStart = main.indexOf("  elements.coach.textContent = coach;", coachEnd);
  const coachOutputEnd = main.indexOf("  elements.marker.style", coachOutputStart);
  assert.ok(coachStart > 0 && coachEnd > coachStart && coachOutputStart > coachEnd && coachOutputEnd > coachOutputStart);
  const coachSource = stripTypeScriptTypes(main.slice(coachStart, coachEnd) + main.slice(coachOutputStart, coachOutputEnd), { mode: "transform" });
  const navigation = stripTypeScriptTypes(readFileSync(new URL("../src/game/course-navigation.ts", import.meta.url), "utf8"), { mode: "transform" }).replace(/^export /gm, "");
  const courseMetrics = runInNewContext(`${navigation}\ncourseMetrics`);
  const nodes = new Map();
  const required = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(selector);
  };
  const elements = Object.fromEntries(["gameShell", "lessonCard", "lessonEyebrow", "lessonTitle", "lessonInstruction", "lessonProgress", "lessonSkip", "status", "statusMessage", "statusFeedback", "coach", "statusCue", "motion"].map(name => [name, required(name)]));
  const context = { anchorage: undefined, crossing: undefined, dummyRecovery: session,
    DUMMY_COURSE: { x: 0, z: 0 }, state: { position: { x: 1.8, y: 0 }, velocity: { x: 0, y: 0 }, heading: 0 },
    firstBuoy: undefined, activitySession: undefined, academy: { view: () => ({ stage: "free-sail" }) }, completedManeuver: false,
    flow: "Lowered", pointOfSailName: "Beam reach", collisionNotice: "", storageUnavailable: false, weatherShelter: undefined,
    elements, required, courseMetrics, formatChartDistance: value => `${Math.round(value)} m` };
  const render = () => runInNewContext(`${update}\nupdateLesson();\n(() => { ${coachSource}\n${headline} })();`, context);
  render();
  assert.equal(elements.lessonInstruction.textContent, "Hold steady · 1.0 / 3 s");
  assert.equal(elements.status.textContent, elements.lessonInstruction.textContent);
  assert.equal(elements.coach.textContent, elements.lessonInstruction.textContent);
  assert.equal(elements.statusMessage.textContent, elements.lessonInstruction.textContent);
  assert.equal(elements.statusMessage.hidden, true);
  assert.equal(required("#status-objective-detail").hidden, false);
  assert.ok(!elements.statusCue.textContent.includes("Hold steady"));
  assert.ok(!elements.statusCue.textContent.includes("Hoist"));
  assert.equal(elements.statusFeedback.textContent, "");
  assert.equal(required("#status-objective-detail").textContent, elements.lessonInstruction.textContent);
  assert.match(required("#status-lesson-progress").textContent, /2 m · 270°$/);
  assert.ok(parseFloat(elements.lessonProgress.style.width) > 30 && parseFloat(elements.lessonProgress.style.width) < 40);
  assert.equal(required("#recover-training-dummy").hidden, true);
  context.collisionNotice = "Touched Juniper buoy. Steer clear and continue."; render();
  assert.equal(elements.status.textContent, context.collisionNotice);
  assert.equal(elements.statusMessage.textContent, context.collisionNotice);
  assert.equal(elements.statusMessage.hidden, false);
  context.collisionNotice = "";
  for (let i = 0; i < 60; i++) tick(session, 1.8);
  render(); assert.equal(elements.lessonInstruction.textContent, "Hold steady · 2.0 / 3 s");
  assert.equal(elements.status.textContent, elements.lessonInstruction.textContent);
  assert.equal(required("#status-objective-detail").textContent, elements.lessonInstruction.textContent);
  for (let i = 0; i < 130; i++) tick(session, 1.8);
  render(); assert.equal(elements.lessonProgress.style.width, "100%");
  assert.equal(required("#recover-training-dummy").hidden, false);
  assert.equal(elements.lessonInstruction.textContent, "Open status to recover the dummy.");
  assert.equal(elements.status.textContent, elements.lessonInstruction.textContent);
  assert.equal(elements.coach.textContent, elements.lessonInstruction.textContent);
  assert.ok(!elements.statusCue.textContent.includes("Hoist"));
  session.interrupt(); render();
  assert.equal(elements.lessonProgress.style.width, "0%");
  assert.equal(required("#recover-training-dummy").hidden, true);
  assert.equal(elements.lessonInstruction.textContent, "Trim and steer back alongside.");
  assert.equal(elements.status.textContent, elements.lessonInstruction.textContent);
  assert.equal(elements.coach.textContent, elements.lessonInstruction.textContent);
  assert.equal(elements.statusMessage.textContent, elements.lessonInstruction.textContent);
  assert.ok(!elements.statusCue.textContent.includes("Hoist"));
  assert.equal(session.recover(), false);
  const departing = make(); tick(departing, 5);
  context.dummyRecovery = departing; context.state.position.x = 5; render();
  assert.equal(elements.coach.textContent, "Hoist sail to make way");
  assert.ok(elements.statusMessage.textContent.includes("Hoist"));
  const returning = make(); travel(returning, 5, 41);
  context.dummyRecovery = returning; context.state.position.x = 41; context.flow = "Attached";
  elements.motion.textContent = "Heel 8°"; render();
  assert.equal(elements.statusCue.textContent, "Attached. Heel 8°");
  assert.equal(required("#status-objective-detail").textContent, "Return alongside the dummy.");
  assert.equal(elements.statusMessage.hidden, true);
  const summaryStart = main.indexOf("  const statusSummary =", main.indexOf("function updateHud("));
  const summary = main.slice(summaryStart, main.indexOf("\n", summaryStart));
  assert.equal(runInNewContext(`${summary}\nstatusSummary;`, { flow: "Attached", coach: "Return alongside the dummy." }), "Attached. Return alongside the dummy.");
});
