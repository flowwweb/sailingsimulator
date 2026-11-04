import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const source = readFileSync(new URL("../src/game/progress.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const evaluate = (code) => runInNewContext(`${js}\n${code}`, { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course" });

test("crossing completion survives reload and grants XP once", () => {
  const result = evaluate(`(() => {
    const saved = parseProgress(JSON.stringify({ ...createProgress(), completedCrossing: true }));
    return { xp: sailingRank(saved).xp, replay: sailingRank({ ...saved, completedCrossing: true }).xp,
      invalid: sailingRank(parseProgress(JSON.stringify({ ...createProgress(), completedCrossing: "true" }))).xp,
      final: sailingRank({ ...saved, completedDummyRecovery: true, completedLessons: [0, 1, 2], completedIntroductions: { [FIRST_BUOY.id]: FIRST_BUOY.revision } }) };
  })()`);
  assert.equal(result.xp, 100); assert.equal(result.replay, 100); assert.equal(result.invalid, 0);
  assert.equal(result.final.level, 7); assert.equal(result.final.rank, "Skipper");
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
  assert.equal(result.rank, "Navigator");
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
  assert.equal(result.later.rank, "Voyager");
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
  const context = { anchorage: undefined, dummyRecovery: undefined, crossing: undefined, required, elements: { statusToggle, gameShell: { inert: false } }, input: { releaseAll() {} },
    window: { matchMedia: () => ({ matches: false }) }, firstBuoy: {}, completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false,
    performance: { now: () => 0 }, requestAnimationFrame: (fn) => { callback = fn; return 1; }, cancelAnimationFrame() { callback = undefined; },
    setRadioOpen(open) { context.radioOpen = open; },
    storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 1,
    sailingRank: () => ({ xp: 100, level: 2, rank: "Deckhand", levelXp: 0 }),
    completionProgressFrame: evaluate("completionProgressFrame") };
  runInNewContext(`${functions}\nshowCompletion("Find your course", { xp: 0, level: 1, rank: 'Newcomer', levelXp: 0 });`, context);
  assert.equal(required("#completion-screen").hidden, false);
  assert.equal(context.elements.gameShell.inert, true);
  assert.equal(context.radioOpen, false);
  assert.equal(context.accumulator, 0);
  assert.equal(required("#completion-reward").textContent, "+100 XP earned");
  assert.equal(required("#completion-level-number").textContent, "Level 1");
  assert.equal(required("#completion-rank").textContent, " · Newcomer");
  assert.equal(required("#completion-continue").textContent, "See your rank");
  callback(900);
  assert.equal(required(".completion-track")["aria-valuenow"], "100");
  assert.equal(required(".completion-fill").style.width, "100%");
  assert.equal(required(".completion-marker").style.left, "100%");
  callback(1150);
  assert.equal(required("#completion-level-number").textContent, "Level 1");
  assert.equal(required("#completion-rank").textContent, " · Newcomer");
  assert.equal(required(".completion-track")["aria-valuenow"], "100");
  assert.equal(required(".completion-track").writes["aria-valuenow"], 1);
  assert.match(required(".completion-track")["aria-valuetext"], /Level 1, Newcomer: 100 of 100 XP.*100 XP total/);
  assert.equal(required("#completion-continue").focused, true);
  runInNewContext("advanceCompletion();", context);
  assert.equal(required("#completion-screen").dataset.stage, "level-up");
  assert.equal(required("#completion-heading").textContent, "Level up!");
  assert.equal(required("#completion-level-number").textContent, "Level 2");
  assert.equal(required("#completion-rank").textContent, " Deckhand");
  assert.equal(required(".completion-track")["aria-valuenow"], "0");
  assert.equal(required(".completion-track").writes["aria-valuenow"], 2);
  assert.equal(required("#completion-continue").textContent, "Next lesson");
  runInNewContext(`${functions}\ncloseCompletion();`, context);
  assert.equal(required("#completion-screen").hidden, true);
  assert.equal(context.elements.gameShell.inert, false);
  assert.equal(statusToggle.focused, true);
  runInNewContext(`showCompletion("First buoy", { xp: 0, level: 1, rank: "Newcomer", levelXp: 0 }); advanceCompletion();`, context);
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
  const context = { anchorage: undefined, dummyRecovery: undefined, crossing: undefined, required, elements: { gameShell: { inert: false }, statusToggle: { focus() {} } },
    input: { releaseAll() {} }, window: { matchMedia: () => ({ matches: true }) }, firstBuoy: {},
    completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false, requestAnimationFrame: () => { scheduled++; return 1; },
    cancelAnimationFrame() {}, setRadioOpen() {}, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 0,
    sailingRank: () => ({ xp: 100, level: 2, rank: "Deckhand", levelXp: 0 }) };
  runInNewContext(`${functions}\nshowCompletion("First buoy", { xp: 0, level: 1, rank: "Newcomer", levelXp: 0 });`, context);
  assert.equal(required("#completion-level-number").textContent, "Level 1");
  assert.equal(required("#completion-rank").textContent, " · Newcomer");
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
  assert.equal(result.final.level, 8); assert.equal(result.final.rank, "Captain");
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
    const context = { required, anchorage: from === "anchorage" ? {} : undefined, dummyRecovery: from === "dummy" ? {} : undefined,
      crossing: from === "crossing" ? {} : undefined, firstBuoy: from === "buoy" ? {} : undefined,
      academy: { view: () => ({ lesson: from === "points" ? 1 : 2 }), restoreObjective: index => { actual = `academy:${index / 3}`; } },
      nextLessonObjective: (_progress, lesson) => lesson * 3, prepareLessonAttempt() {}, startCrossing() { actual = "crossing"; },
      startDummyRecovery() { actual = "dummy"; }, selectChartActivity(id) { actual = id === "anchorage-practice" ? "anchorage" : id; },
      elements: { gameShell: { inert: false }, statusToggle: { focus() {} } }, input: { releaseAll() {} }, window: { matchMedia: () => ({ matches: false }) },
      completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false, completionNextLesson: undefined,
      cancelAnimationFrame() {}, setRadioOpen() {}, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: { completedLessons: [0, 1, 2] }, accumulator: 0,
      sailingRank: () => ({ xp: 700, level: 8, rank: "Captain", levelXp: 0 }) };
    runInNewContext(`${functions}\nshowCompletion("Replay", { xp: 700, level: 8, rank: "Captain", levelXp: 0 }); advanceCompletion();`, context);
    assert.equal(actual, expected, from);
  }
});
