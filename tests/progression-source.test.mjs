import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const source = readFileSync(new URL("../src/game/progress.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const evaluate = (code) => runInNewContext(`${js}\n${code}`, { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course" });

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
  const context = { required, elements: { statusToggle, gameShell: { inert: false } }, input: { releaseAll() {} },
    window: { matchMedia: () => ({ matches: false }) }, firstBuoy: {}, completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false,
    performance: { now: () => 0 }, requestAnimationFrame: (fn) => { callback = fn; return 1; }, cancelAnimationFrame() { callback = undefined; },
    storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 1,
    sailingRank: () => ({ xp: 100, level: 2, rank: "Deckhand", levelXp: 0 }),
    completionProgressFrame: evaluate("completionProgressFrame") };
  runInNewContext(`${functions}\nshowCompletion("Find your course", { xp: 0, level: 1, rank: 'Newcomer', levelXp: 0 });`, context);
  assert.equal(required("#completion-screen").hidden, false);
  assert.equal(context.elements.gameShell.inert, true);
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
  context.nextLessonObjective = () => 0;
  context.prepareLessonAttempt = () => { context.startedNext = true; };
  runInNewContext("advanceCompletion();", context);
  assert.equal(required("#completion-screen").hidden, true);
  assert.equal(context.next, 0);
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
  const context = { required, elements: { gameShell: { inert: false }, statusToggle: { focus() {} } },
    input: { releaseAll() {} }, window: { matchMedia: () => ({ matches: true }) }, firstBuoy: {},
    completionAnimationFrame: undefined, completionPendingRank: undefined, completionRevealing: false, requestAnimationFrame: () => { scheduled++; return 1; },
    cancelAnimationFrame() {}, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 0,
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
  assert.equal(required("#completion-continue").textContent, "Continue sailing");
});
