import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const source = readFileSync(new URL("../src/game/progress.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const evaluate = (code) => runInNewContext(`${js}\n${code}`, { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 } });

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
  assert.equal(result.first, 50);
  assert.equal(result.level, 2);
  assert.equal(result.end, 100);
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

test("completion reveals the earned reward and closes back to sailing", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("function showCompletion(");
  const end = main.indexOf("\n}", main.indexOf("function closeCompletion(", start)) + 2;
  assert.ok(start >= 0 && end > start);
  const functions = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  const nodes = new Map();
  const required = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, textContent: "", style: {},
      setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; } });
    return nodes.get(selector);
  };
  const statusToggle = { focus() { this.focused = true; } };
  const context = { required, elements: { statusToggle }, input: { releaseAll() {} },
    storageUnavailable: false, STORAGE_WARNING: "Storage unavailable", progress: {}, accumulator: 1,
    sailingRank: () => ({ xp: 100, level: 2, rank: "Crew", levelXp: 0 }) };
  runInNewContext(`${functions}\nshowCompletion("Find your course", { xp: 50, level: 1 });`, context);
  assert.equal(required("#completion-screen").hidden, false);
  assert.equal(context.accumulator, 0);
  assert.equal(required("#completion-reward").textContent, "+50 XP earned");
  assert.equal(required("#completion-level").textContent, "Level up! · Level 2 · Crew");
  assert.equal(required(".completion-track")["aria-valuenow"], "0");
  assert.equal(required("#completion-continue").focused, true);
  runInNewContext(`${functions}\ncloseCompletion();`, context);
  assert.equal(required("#completion-screen").hidden, true);
  assert.equal(statusToggle.focused, true);
});
