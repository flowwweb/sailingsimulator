import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const source = readFileSync(new URL("../src/game/progress.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const evaluate = (code) => runInNewContext(`${js}\n${code}`, { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course" });

const appSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
function appFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  const end = appSource.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start, name);
  return stripTypeScriptTypes(appSource.slice(start, end), { mode: "strip" });
}
function appListener(marker) {
  const start = appSource.indexOf(marker);
  const end = appSource.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start, marker);
  return stripTypeScriptTypes(`(event => {${appSource.slice(appSource.indexOf("{", start) + 1, end)}\n})`, { mode: "strip" });
}
const resetId = "00000000-0000-4000-8000-000000000001";
const freshProgress = () => evaluate("createProgress()");
const captainProgress = () => evaluate("parseProgress(JSON.stringify(recordFirstBuoyCompletion({ ...createProgress(), completedObjectives: [3,4,5,6,7,8], completedDummyRecovery: true, completedCrossing: true, completedAnchorage: true, voyages: 6, distanceSailed: 900 })))");
function progressStoreContext(current, stored, legacy = null) {
  const store = new Map();
  if (stored !== null) store.set("fair-winds-progress-v2", JSON.stringify(stored));
  if (legacy !== null) store.set("fair-winds-progress-v1", JSON.stringify(legacy));
  const nodes = new Map();
  const required = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, dataset: {}, textContent: "", focus() {} });
    return nodes.get(id);
  };
  const classList = { add() {}, remove() {} };
  const ctx = { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course",
    progress: current, pendingProgressReset: false, storageUnavailable: false, writeBlocked: false, writes: 0,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => {
      if (ctx.writeBlocked) throw new Error("Quota exceeded");
      ctx.writes++; store.set(key, value);
    } },
    required, state: { tackCount: 0, gybeCount: 0 }, started: true, voyageCounted: true, progressDistanceSinceSave: 49,
    firstBuoy: {}, dummyRecovery: {}, crossing: {}, anchorage: {}, activitySession: {}, activityView: {},
    academy: { objective: 8, reset() { this.objective = 0; } },
    checkpointLesson: (p, academy) => ({ ...p, academyObjective: academy.objective }),
    restoreLesson: (academy, p) => { academy.objective = p.academyObjective ?? 0; },
    stopWeatherShelter() {}, world: { setCrossingBoat() {}, setCrossingExercise() {}, setTrainingDummy() {} },
    input: { releaseAll() {} }, completionAnimationFrame: 123, completionPendingRank: { level: 7 }, completionNextLesson: "anchorage",
    completionRevealing: true, cancelled: 0, cancelAnimationFrame() { ctx.cancelled++; },
    requestAnimationFrame() { throw new Error("A reset must not schedule a stale rank reveal"); },
    titleExitTimeout: 0, accumulator: 0, resetRadio() {}, setPauseOpen() {}, interruptLessonAttempt() {},
    setConditionsOpen() {}, setChartOpen() {}, syncTitleState() { ctx.titleSynced = true; }, syncTitleRank() {},
    syncChartActivityList() {}, updateLesson() {}, titleMenuItems: () => [required("learn")],
    audio: { resetMotionState() {} }, window: { clearTimeout() {}, matchMedia: () => ({ matches: false }), confirm: () => true },
    settingsTabs: { select() {} }, crypto: { randomUUID: () => resetId },
    elements: { gameShell: { inert: true, classList }, welcome: { hidden: true, classList }, continueLesson: { focus() {} },
      statusToggle: { focus() {} }, status: {}, settingsResetLogbook: { focus() {} }, settingsLogbookSummary: {} },
  };
  const names = ["loadStoredValue", "saveStoredValue", "loadSavedProgress", "refreshSavedProgress", "persistProgress",
    "applyProgressReset", "stopDummyRecovery", "closeCompletion", "returnToTitle", "showCompletion"];
  runInNewContext(`${js}\n${names.map(appFunction).join("\n")}`, ctx);
  return { ctx, store, required, run: code => runInNewContext(code, ctx) };
}

test("one-time save migration preserves legacy credit and a canonical zero reset always wins", () => {
  const legacy = captainProgress();
  const h = progressStoreContext(freshProgress(), null, legacy);
  h.run("progress = loadSavedProgress();");
  assert.equal(h.run("sailingRank(progress).xp"), 600);
  assert.equal(JSON.parse(h.store.get("fair-winds-progress-v2")).voyages, 6);
  assert.equal(JSON.parse(h.store.get("fair-winds-progress-v1")).voyages, 6);
  h.store.set("fair-winds-progress-v2", JSON.stringify({ ...freshProgress(), resetId }));
  h.run("progress = loadSavedProgress();");
  assert.equal(h.run("sailingRank(progress).xp"), 0);
  h.store.set("fair-winds-progress-v1", JSON.stringify(legacy));
  h.run("progress = loadSavedProgress();");
  assert.equal(h.run("sailingRank(progress).xp"), 0, "old release writes cannot replace the canonical reset");
  h.store.set("fair-winds-progress-v2", "{broken");
  h.run("progress = loadSavedProgress();");
  assert.equal(h.run("sailingRank(progress).xp"), 0, "present canonical data never reimports the old backup");
});

test("a stale new tab preserves newer credit without advancing its academy cursor", () => {
  const stale = evaluate("recordFirstBuoyCompletion(createProgress())");
  const h = progressStoreContext(stale, captainProgress());
  h.ctx.academy.objective = 0;
  assert.equal(h.run("persistProgress()"), true);
  assert.equal(h.run("sailingRank(progress).xp"), 600);
  assert.equal(JSON.parse(h.store.get("fair-winds-progress-v2")).academyObjective, 0);
});

test("remote reset at the save boundary cancels old scenarios, rewards and late completion", () => {
  for (const old of [freshProgress(), captainProgress()]) {
    const reset = { ...freshProgress(), resetId };
    const h = progressStoreContext(old, reset);
    assert.equal(h.run("persistProgress()"), false);
    assert.equal(h.run("sailingRank(progress).xp"), 0);
    assert.equal(h.ctx.progress.resetId, resetId);
    assert.equal(h.ctx.started, false);
    assert.equal(h.ctx.academy.objective, 0);
    for (const key of ["firstBuoy", "dummyRecovery", "crossing", "anchorage", "activitySession", "activityView", "completionPendingRank", "completionNextLesson"]) assert.equal(h.ctx[key], undefined, key);
    assert.equal(h.ctx.cancelled, 1);
    h.run('showCompletion("Old completion", { xp: 600, level: 7, rank: "Captain", levelXp: 0 });');
    assert.equal(h.required("#completion-screen").hidden, true);
    assert.equal(h.ctx.titleSynced, true);
  }
});

test("queued storage events reread the current generation instead of trusting stale event data", () => {
  const h = progressStoreContext(captainProgress(), { ...freshProgress(), resetId });
  h.ctx.event = { key: "fair-winds-progress-v2", newValue: JSON.stringify(captainProgress()) };
  h.run(`${appListener('window.addEventListener("storage", (event) => {')}(event);`);
  assert.equal(h.run("sailingRank(progress).xp"), 0);
  assert.equal(h.ctx.progress.resetId, resetId);
  assert.equal(h.ctx.started, false);
});

test("explicit reset names the lost credit, survives failed writes and retries without restoring old credit", () => {
  const h = progressStoreContext(captainProgress(), captainProgress(), captainProgress());
  let prompt = "";
  h.ctx.window.confirm = message => { prompt = message; return true; };
  h.ctx.writeBlocked = true;
  h.run(`${appListener('elements.settingsResetLogbook.addEventListener("click", () => {')}(null);`);
  assert.match(prompt, /rank, XP, completed lessons/);
  assert.equal(h.ctx.pendingProgressReset, true);
  assert.equal(h.run("sailingRank(progress).xp"), 0);
  assert.match(h.ctx.elements.settingsLogbookSummary.textContent, /has not been saved yet/);
  h.run("persistProgress();");
  assert.equal(h.run("sailingRank(progress).xp"), 0);
  h.ctx.writeBlocked = false;
  h.run("persistProgress();");
  assert.equal(h.ctx.pendingProgressReset, false);
  assert.equal(JSON.parse(h.store.get("fair-winds-progress-v2")).resetId, resetId);
  assert.equal(h.run("sailingRank(parseProgress(localStorage.getItem(PROGRESS_STORAGE_KEY))).xp"), 0);
  assert.equal(h.run("sailingRank(parseProgress(localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY))).xp"), 600);
});

test("storage failures preserve in-memory play and credit without treating failed reads as resets", () => {
  const local = { ...captainProgress(), resetId };
  const h = progressStoreContext(local, local);
  h.ctx.localStorage.getItem = () => { throw new Error("Storage denied"); };
  assert.equal(h.run("persistProgress()"), true, "a read failure must not stop Begin sailing");
  assert.equal(h.run("sailingRank(progress).xp"), 600);
  assert.equal(h.ctx.progress.resetId, resetId);
  assert.equal(h.ctx.started, true);
  assert.equal(h.ctx.storageUnavailable, true);
  assert.equal(h.ctx.writes, 0, "do not replace a save that could not be read");
  h.ctx.localStorage.getItem = key => h.store.get(key) ?? null;
  h.ctx.writeBlocked = true;
  assert.equal(h.run("persistProgress()"), true, "ordinary failed writes retain in-memory sailing");
  assert.equal(h.run("sailingRank(progress).xp"), 600);
  assert.equal(h.ctx.started, true);
});

test("Continue starts the approved three-buoy course for fresh and legacy-only profiles", () => {
  const listener = appListener('elements.continueLesson.addEventListener("click", () => {');
  for (const p of [freshProgress(), evaluate("recordFirstBuoyCompletion(createProgress())"),
    evaluate('({ ...createProgress(), completedIntroductions: { [FIRST_BUOY.id]: 1 } })')]) {
    const ctx = { progress: p, FIRST_BUOY: { id: "intro.buoy-1" }, FIRST_COURSE_ID: "intro.three-buoy-course",
      startFirstBuoy() { ctx.result = "first-course"; }, academy: { view: () => ({ objective: 0, stage: "free-sail" }), resume() {} },
      state: {}, beginSailing() {}, prepareLessonAttempt() { ctx.result = "resume-academy"; }, activitySession: {}, activityView: {} };
    runInNewContext(`${listener}(null);`, ctx);
    assert.equal(ctx.result, p.completedIntroductions?.["intro.three-buoy-course"] === 1 ? "resume-academy" : "first-course");
  }
});

test("crossing completion survives reload and grants XP once", () => {
  const result = evaluate(`(() => {
    const saved = parseProgress(JSON.stringify({ ...createProgress(), completedCrossing: true }));
    return { xp: sailingRank(saved).xp, replay: sailingRank({ ...saved, completedCrossing: true }).xp,
      invalid: sailingRank(parseProgress(JSON.stringify({ ...createProgress(), completedCrossing: "true" }))).xp,
      final: sailingRank({ ...saved, completedDummyRecovery: true, completedLessons: [0, 1, 2], completedIntroductions: { [FIRST_BUOY.id]: FIRST_BUOY.revision } }) };
  })()`);
  assert.equal(result.xp, 100); assert.equal(result.replay, 100); assert.equal(result.invalid, 0);
  assert.equal(result.final.level, 7); assert.equal(result.final.rank, "Captain");
});

test("dummy recovery earns XP once and sixth level has a distinct rank", () => {
  const result = evaluate(`(() => {
    const p = { ...createProgress(), completedDummyRecovery: true };
    const saved = parseProgress(JSON.stringify(p));
    return { first: sailingRank(p).xp, reload: sailingRank(saved).xp,
      invalid: sailingRank(parseProgress(JSON.stringify({ ...p, completedDummyRecovery: "true" }))).xp,
      level: rankForXp(500).level, rank: rankForXp(500).rank };
  })()`);
  assert.equal(result.first, 100);
  assert.equal(result.reload, 100);
  assert.equal(result.invalid, 0);
  assert.equal(result.level, 6);
  assert.equal(result.rank, "Skipper");
});

test("earned lessons survive reload and replays never duplicate XP", () => {
  const result = evaluate(`
    let p = createProgress();
    const start = sailingRank(p).xp;
    p = recordFirstBuoyCompletion(p);
    p = parseProgress(JSON.stringify(p));
    const first = sailingRank(p).xp;
    p = recordFirstBuoyCompletion(p);
    for (const target of [0, 1, 2]) p = recordAcademyObjective(p, target);
    const level = sailingRank(p).level;
    p = parseProgress(JSON.stringify(p));
    p = recordAcademyObjective(p, 2);
    ({ start, first, level, end: sailingRank(p).xp });
  `);
  assert.equal(result.start, 0);
  assert.equal(result.first, 100);
  assert.equal(result.level, 3);
  assert.equal(result.end, 200);
});

test("first journey levels up and crossing animation fills before revealing Deckhand", () => {
  const result = evaluate(`({ first: sailingRank(recordFirstBuoyCompletion(createProgress())),
    start: completionProgressFrame(0, 100, 0), middle: completionProgressFrame(0, 100, 450),
    threshold: completionProgressFrame(0, 100, 900), end: completionProgressFrame(0, 100, 1150),
    replay: completionProgressFrame(100, 100, 0), later: rankForXp(400) })`);
  assert.equal(result.first.level, 2);
  assert.equal(result.first.rank, "Deckhand");
  assert.equal(result.start.levelXp, 0);
  assert.equal(result.middle.levelXp, 50);
  assert.equal(result.threshold.levelXp, 100);
  assert.equal(result.threshold.level, 1);
  assert.equal(result.end.levelXp, 0);
  assert.equal(result.end.rank, "Deckhand");
  assert.equal(result.end.done, true);
  assert.equal(result.replay.done, true);
  assert.equal(result.later.rank, "Navigator");
});

test("multi-level progression reveals each threshold before continuing", () => {
  const result = evaluate(`({ first: completionProgressFrame(50, 250, 900),
    next: completionProgressFrame(50, 250, 1150), second: completionProgressFrame(50, 250, 2050),
    end: completionProgressFrame(50, 250, 3200) })`);
  assert.equal(result.first.levelXp, 100);
  assert.equal(result.next.rank, "Deckhand");
  assert.equal(result.next.levelXp, 0);
  assert.equal(result.second.levelXp, 100);
  assert.equal(result.end.level, 3);
  assert.equal(result.end.levelXp, 50);
  assert.equal(result.end.done, true);
});

test("selection, partial targets and unrecognized introduction revisions earn no XP", () => {
  const result = evaluate(`
    let p = { ...createProgress(), activeIntroduction: FIRST_BUOY.id,
      completedIntroductions: { [FIRST_BUOY.id]: 2 } };
    p = recordAcademyObjective(p, 0);
    sailingRank(parseProgress(JSON.stringify(p))).xp;
  `);
  assert.equal(result, 0);
});

test("legacy one-buoy credit is preserved but never asserts the three-buoy course", () => {
  const result = evaluate(`
    let p = parseProgress(JSON.stringify({ ...createProgress(), completedIntroductions: { [FIRST_BUOY.id]: 1 } }));
    const before = sailingRank(p).xp;
    const courseBefore = p.completedIntroductions?.[FIRST_COURSE_ID];
    p = parseProgress(JSON.stringify(recordFirstBuoyCompletion(p)));
    ({ before, courseBefore, after: sailingRank(p).xp, courseAfter: p.completedIntroductions?.[FIRST_COURSE_ID] });
  `);
  assert.equal(result.before, 100);
  assert.equal(result.courseBefore, undefined);
  assert.equal(result.after, 100);
  assert.equal(result.courseAfter, 1);
});

test("completion reveals the earned reward and closes back to sailing", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("function renderCompletionProgress(");
  const end = main.indexOf("\n}", main.indexOf("function closeCompletion(", start)) + 2;
  assert.ok(start >= 0 && end > start);
  const functions = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  const nodes = new Map();
  const required = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", style: {}, dataset: {}, writes: {},
      setAttribute(name, value) { this[name] = value; this.writes[name] = (this.writes[name] ?? 0) + 1; }, focus() { this.focused = true; } });
    return nodes.get(selector);
  };
  const statusToggle = { focus() { this.focused = true; } };
  let callback;
  const context = { started: true, anchorage: undefined, dummyRecovery: undefined, crossing: undefined, required, elements: { statusToggle, gameShell: { inert: false } }, input: { releaseAll() {} },
    window: { matchMedia: () => ({ matches: false }) }, firstBuoy: {}, completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false,
    performance: { now: () => 0 }, requestAnimationFrame: (fn) => { callback = fn; return 1; }, cancelAnimationFrame() { callback = undefined; },
    setRadioOpen(open) { context.radioOpen = open; },
    storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 1,
    sailingRank: () => ({ xp: 100, level: 2, rank: "Deckhand", levelXp: 0 }),
    completionProgressFrame: evaluate("completionProgressFrame") };
  runInNewContext(`${functions}\nshowCompletion("Find your course", { xp: 0, level: 1, rank: 'Landlubber', levelXp: 0 });`, context);
  assert.equal(required("#completion-screen").hidden, false);
  assert.equal(context.elements.gameShell.inert, true);
  assert.equal(context.radioOpen, false);
  assert.equal(context.accumulator, 0);
  assert.equal(required("#completion-reward").textContent, "+100 XP earned");
  assert.equal(required("#completion-level-number").textContent, "Level 1");
  assert.equal(required("#completion-rank").textContent, " · Landlubber");
  assert.equal(required("#completion-continue").textContent, "See your rank");
  callback(450);
  assert.equal(required("#completion-screen").dataset.animating, "true");
  callback(900);
  assert.equal(required("#completion-screen").dataset.animating, "false", "the boat stops bobbing while XP holds at the threshold");
  assert.equal(required(".completion-track")["aria-valuenow"], "100");
  assert.equal(required(".completion-fill").style.width, "100%");
  assert.equal(required(".completion-marker").style.left, "100%");
  callback(1150);
  assert.equal(required("#completion-level-number").textContent, "Level 1");
  assert.equal(required("#completion-rank").textContent, " · Landlubber");
  assert.equal(required(".completion-track")["aria-valuenow"], "100");
  assert.equal(required(".completion-track").writes["aria-valuenow"], 1);
  assert.match(required(".completion-track")["aria-valuetext"], /Level 1, Landlubber: 100 of 100 XP.*100 XP total/);
  assert.equal(required("#completion-continue").focused, true);
  runInNewContext("advanceCompletion();", context);
  assert.equal(required("#completion-screen").dataset.stage, "level-up");
  assert.equal(required("#completion-heading").textContent, "Level up!");
  assert.equal(required("#completion-level-number").textContent, "Level 2");
  assert.equal(required("#completion-rank").textContent, " Deckhand");
  assert.equal(required("#completion-rank-badge").src, "/brand/ranks/deckhand.png");
  assert.equal(required("#completion-screen").dataset.animating, "false");
  assert.equal(required(".completion-track")["aria-valuenow"], "0");
  assert.equal(required(".completion-track").writes["aria-valuenow"], 2);
  assert.equal(required("#completion-continue").textContent, "Next lesson");
  runInNewContext(`${functions}\ncloseCompletion();`, context);
  assert.equal(required("#completion-screen").hidden, true);
  assert.equal(context.elements.gameShell.inert, false);
  assert.equal(statusToggle.focused, true);
  runInNewContext(`showCompletion("First buoy", { xp: 0, level: 1, rank: "Landlubber", levelXp: 0 }); advanceCompletion();`, context);
  assert.equal(callback, undefined);
  assert.equal(required("#completion-level-number").textContent, "Level 2");
  context.academy = { restoreObjective(index) { context.next = index; } };
  context.nextLessonObjective = (_progress, lesson) => lesson * 3;
  context.prepareLessonAttempt = () => { context.startedNext = true; };
  runInNewContext("advanceCompletion();", context);
  assert.equal(required("#completion-screen").hidden, true);
  assert.equal(context.next, 3);
  assert.equal(context.startedNext, true);
});

test("the final rank fills completion truthfully after the Captain threshold and on replay", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("function renderCompletionProgress(");
  const end = main.indexOf("\n}", main.indexOf("function closeCompletion(", start)) + 2;
  assert.ok(start >= 0 && end > start);
  const functions = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  const nodes = new Map();
  const required = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", style: {}, dataset: {},
      setAttribute(name, value) { this[name] = value; }, focus() {} });
    return nodes.get(selector);
  };
  const finalRank = { xp: 700, level: 8, rank: "Sea Legend", levelXp: 0 };
  const context = { started: true, required, anchorage: {}, dummyRecovery: undefined, crossing: undefined, firstBuoy: undefined,
    elements: { gameShell: { inert: false } }, input: { releaseAll() {} },
    window: { matchMedia: () => ({ matches: true }) }, completionAnimationFrame: undefined,
    completionPendingRank: undefined, completionRevealing: false, completionNextLesson: undefined,
    cancelAnimationFrame() {}, setRadioOpen() {}, storageUnavailable: false, progress: {}, accumulator: 0,
    sailingRank: () => finalRank };
  runInNewContext(`${functions}\nshowCompletion("Anchorage practice", { xp: 600, level: 7, rank: "Captain", levelXp: 0 });`, context);
  assert.equal(required("#completion-level-number").textContent, "Level 7");
  assert.match(required("#completion-xp").textContent, /100 \/ 100 XP to next level/);
  assert.match(required(".completion-track")["aria-valuetext"], /Captain: 100 of 100 XP toward the next level/);
  runInNewContext("advanceCompletion();", context);
  const assertFinalRank = () => {
    assert.equal(required("#completion-level-number").textContent, "Level 8");
    assert.match(required("#completion-rank").textContent, /Sea Legend/);
    assert.equal(required("#completion-xp").textContent, "All ranks earned · 700 XP total");
    assert.equal(required(".completion-fill").style.width, "100%");
    assert.equal(required(".completion-marker").style.left, "100%");
    assert.equal(required(".completion-track")["aria-valuenow"], "100");
    assert.equal(required(".completion-track")["aria-label"], "Sailing ranks complete");
    assert.match(required(".completion-track")["aria-valuetext"], /Sea Legend: all ranks earned, 700 XP total/);
    assert.doesNotMatch(required(".completion-track")["aria-valuetext"], /next level/);
  };
  assertFinalRank();
  runInNewContext('showCompletion("Anchorage practice", sailingRank(progress));', context);
  assert.equal(required("#completion-reward").textContent, "Previously completed");
  assertFinalRank();
});

test("completion blocks held Enter, NumpadEnter and Space repeats while preserving fresh activation and dialog keys", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf('  window.addEventListener("keydown", (event) => {');
  const end = main.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start);
  const handler = stripTypeScriptTypes(`(event => { ${main.slice(main.indexOf("{", start) + 1, end)} })`, { mode: "strip" });
  let trapped = 0, closed = 0;
  const context = { required: selector => ({ hidden: selector !== "#completion-screen" }),
    trapFocusWithin() { trapped++; }, closeCompletion() { closed++; } };
  const run = (code, repeat) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: repeat } });
    context.event = event; runInNewContext(`${handler}(event);`, context);
    return event;
  };
  for (const code of ["Enter", "NumpadEnter", "Space"]) {
    assert.equal(run(code, true).defaultPrevented, true, `${code} auto-repeat cannot activate Continue`);
    assert.equal(run(code, false).defaultPrevented, false, `${code} fresh press retains native button activation`);
  }
  run("Tab", false); assert.equal(trapped, 1);
  assert.equal(run("Escape", false).defaultPrevented, true); assert.equal(closed, 1);
});

test("rotating with a completion open isolates the game and restores dialog focus", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf('  const portrait = window.matchMedia("(orientation: portrait)").matches;', main.indexOf("function loop("));
  const end = main.indexOf("  if (portrait || document.hidden)", start);
  assert.ok(start >= 0 && end > start);
  const body = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  const completion = { hidden: false, inert: false };
  const button = { focused: 0, focus() { this.focused++; } };
  const context = { window: { matchMedia: () => ({ matches: true }) }, wasPortrait: false,
    elements: { gameShell: { inert: false } }, required: (selector) => selector === "#completion-screen" ? completion : button };
  runInNewContext(`function sync() {\n${body}\n} sync();`, context);
  assert.equal(context.elements.gameShell.inert, true);
  assert.equal(completion.inert, true);
  context.window.matchMedia = () => ({ matches: false });
  runInNewContext("sync();", context);
  assert.equal(context.elements.gameShell.inert, true);
  assert.equal(completion.inert, false);
  assert.equal(button.focused, 1);
});

test("reduced motion and replay show the final rank without scheduling animation", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("function renderCompletionProgress(");
  const end = main.indexOf("\n}", main.indexOf("function closeCompletion(", start)) + 2;
  const functions = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  const nodes = new Map();
  const required = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", style: {}, dataset: {}, setAttribute() {}, focus() {} });
    return nodes.get(selector);
  };
  let scheduled = 0;
  const context = { started: true, anchorage: undefined, dummyRecovery: undefined, crossing: undefined, required, elements: { gameShell: { inert: false }, statusToggle: { focus() {} } },
    input: { releaseAll() {} }, window: { matchMedia: () => ({ matches: true }) }, firstBuoy: {},
    completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false, requestAnimationFrame: () => { scheduled++; return 1; },
    cancelAnimationFrame() {}, setRadioOpen() {}, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 0,
    sailingRank: () => ({ xp: 100, level: 2, rank: "Deckhand", levelXp: 0 }) };
  runInNewContext(`${functions}\nshowCompletion("First buoy", { xp: 0, level: 1, rank: "Landlubber", levelXp: 0 });`, context);
  assert.equal(required("#completion-level-number").textContent, "Level 1");
  assert.equal(required("#completion-rank").textContent, " · Landlubber");
  assert.equal(required(".completion-marker").style.left, "100%");
  assert.equal(scheduled, 0);
  runInNewContext("advanceCompletion();", context);
  assert.equal(required("#completion-heading").textContent, "Level up!");
  assert.equal(required("#completion-rank").textContent, " Deckhand");
  runInNewContext(`showCompletion("First buoy", { xp: 100, level: 2, rank: "Deckhand", levelXp: 0 });`, context);
  assert.equal(required("#completion-reward").textContent, "Previously completed");
  assert.equal(required("#completion-level-number").textContent, "Level 2");
  assert.equal(required("#completion-rank").textContent, " · Deckhand");
  assert.equal(required("#completion-continue").textContent, "Next lesson");
  assert.equal(scheduled, 0);
  context.progress = { completedLessons: [0, 1, 2] };
  runInNewContext(`showCompletion("First buoy", { xp: 100, level: 2, rank: "Deckhand", levelXp: 0 });`, context);
  assert.equal(required("#completion-continue").textContent, "Next lesson");
});

test("anchorage completion grants one saved level and a distinct final rank", () => {
  const result = evaluate(`(() => {
    const earned = { ...createProgress(), completedAnchorage: true };
    const saved = parseProgress(JSON.stringify(earned));
    const all = { ...saved, completedCrossing: true, completedDummyRecovery: true,
      completedLessons: [0, 1, 2], completedIntroductions: { [FIRST_BUOY.id]: FIRST_BUOY.revision } };
    return { first: sailingRank(earned), saved: sailingRank(saved), replay: sailingRank({ ...saved, completedAnchorage: true }),
      invalid: sailingRank(parseProgress(JSON.stringify({ ...createProgress(), completedAnchorage: "true" }))),
      legacy: sailingRank(parseProgress(JSON.stringify({ ...createProgress(), version: 1, completedAnchorage: true }))),
      final: sailingRank(all) };
  })()`);
  assert.equal(result.first.xp, 100); assert.equal(result.first.rank, "Deckhand");
  assert.equal(result.saved.xp, 100); assert.equal(result.replay.xp, 100);
  assert.equal(result.invalid.xp, 0); assert.equal(result.legacy.xp, 0);
  assert.equal(result.final.level, 8); assert.equal(result.final.rank, "Sea Legend");
});

test("completion advances through the visible six lessons even on replay", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("function renderCompletionProgress(");
  const end = main.indexOf("\n}", main.indexOf("function closeCompletion(", start)) + 2;
  const functions = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  for (const [from, expected] of [["buoy", "academy:1"], ["points", "academy:2"], ["maneuvers", "crossing"], ["crossing", "dummy"], ["dummy", "anchorage"], ["anchorage", "sailing"]]) {
    const nodes = new Map();
    const required = selector => { if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", style: {}, dataset: {}, setAttribute() {}, focus() {} }); return nodes.get(selector); };
    let actual = "sailing";
    const context = { started: true, required, anchorage: from === "anchorage" ? {} : undefined, dummyRecovery: from === "dummy" ? {} : undefined,
      crossing: from === "crossing" ? {} : undefined, firstBuoy: from === "buoy" ? {} : undefined,
      academy: { view: () => ({ lesson: from === "points" ? 1 : 2 }), restoreObjective: index => { actual = `academy:${index / 3}`; } },
      nextLessonObjective: (_progress, lesson) => lesson * 3, prepareLessonAttempt() {}, startCrossing() { actual = "crossing"; },
      startDummyRecovery() { actual = "dummy"; }, selectChartActivity(id) { actual = id === "anchorage-practice" ? "anchorage" : id; },
      elements: { gameShell: { inert: false }, statusToggle: { focus() {} } }, input: { releaseAll() {} }, window: { matchMedia: () => ({ matches: false }) },
      completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false, completionNextLesson: undefined,
      cancelAnimationFrame() {}, setRadioOpen() {}, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: { completedLessons: [0, 1, 2] }, accumulator: 0,
      sailingRank: () => ({ xp: 700, level: 8, rank: "Sea Legend", levelXp: 0 }) };
    runInNewContext(`${functions}\nshowCompletion("Replay", { xp: 700, level: 8, rank: "Sea Legend", levelXp: 0 }); advanceCompletion();`, context);
    assert.equal(actual, expected, from);
  }
});

test("completing the buoy journey saves the next lesson before pressing Next", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const academySrc = readFileSync(new URL("../src/game/academy.ts", import.meta.url), "utf8");
  const session = readFileSync(new URL("../src/game/lesson-session.ts", import.meta.url), "utf8");
  const academyJs = stripTypeScriptTypes(academySrc, { mode: "strip" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
  const start = session.indexOf("export function checkpointLesson(");
  assert.ok(start >= 0);
  const sessionJs = stripTypeScriptTypes(session.slice(start), { mode: "strip" }).replace(/^export /gm, "");
  const completionStart = main.indexOf("            progress = recordFirstBuoyCompletion(progress);");
  const completionEnd = main.indexOf("            elements.status.textContent", completionStart);
  assert.ok(completionStart >= 0 && completionEnd > completionStart);
  const completion = main.slice(completionStart, completionEnd);
  const ctx = { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course" };
  const result = runInNewContext(js + "\n" + academyJs + "\n" + sessionJs + `
    let progress = { ...createProgress(), activeIntroduction: FIRST_BUOY.id, voyages: 1 };
    let academy = new SailingAcademy(); academy.skip();
    let saved;
    function persistProgress() { progress = checkpointLesson(progress, academy); saved = JSON.stringify(progress); }
  ` + completion + `
    let restored = parseProgress(saved); let nextAcademy = new SailingAcademy(); restoreLesson(nextAcademy, restored);
    ({ active: restored.activeIntroduction, objective: nextAcademy.objectiveIndex(), stage: nextAcademy.view().stage,
       xp: sailingRank(restored).xp, replayXp: sailingRank(recordFirstBuoyCompletion(restored)).xp });`, ctx);
  assert.equal(result.active, undefined);
  assert.equal(result.objective, 3);
  assert.equal(result.stage, "close-hauled");
  assert.equal(result.xp, 100);
  assert.equal(result.replayXp, 100);
});
