import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const progressSource = readFileSync(new URL("../src/game/progress.ts", import.meta.url), "utf8");
const progressJs = stripTypeScriptTypes(progressSource, { mode: "strip" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const sync = stripTypeScriptTypes(main.slice(main.indexOf("function syncTitleRank(): void {"), main.indexOf("function syncTitleState(): void {")), { mode: "strip" });
const close = stripTypeScriptTypes(main.slice(main.indexOf("function closeTitleDialog("), main.indexOf("function selectTitleItem(")), { mode: "strip" });
const ids = new Map();
function required(id) {
  if (!ids.has(id)) ids.set(id, { style: {}, attributes: {}, hidden: false, textContent: "", setAttribute(name, value) { this.attributes[name] = value; }, focus() { this.focused = true; } });
  return ids.get(id);
}
const constants = { FIRST_BUOY: { id: "intro.buoy-1", revision: 1 }, FIRST_COURSE_ID: "intro.three-buoy-course" };

test("first lesson and saved progress keep rank, profile and settings in agreement", () => {
  const titleProfile = required("#title-profile");
  const context = { ...constants, required, elements: { titleProfile } };
  runInNewContext(`${progressJs}\n${sync}\nvar progress = recordFirstBuoyCompletion(createProgress()); progress = parseProgress(JSON.stringify(progress)); syncTitleRank();`, context);
  assert.equal(required("#title-level").textContent, "2");
  assert.equal(required("#title-rank-badge").src, "/brand/ranks/deckhand.png");
  assert.match(titleProfile.attributes["aria-label"], /Level 2, Deckhand, 100 XP/);
  assert.equal(required("#profile-level").textContent, "Level 2");
  assert.equal(required("#profile-rank").textContent, "Deckhand");
  assert.equal(required("#profile-total-xp").textContent, "100 XP total");
  assert.equal(required("#profile-next-rank").textContent, "100 XP to Sailor");
  assert.equal(required("#settings-rank").textContent, "Level 2 · Deckhand · 100 XP");
  assert.equal(required("#title-xp-ring").attributes["stroke-dashoffset"], "100");
  runInNewContext("progress = recordFirstBuoyCompletion(progress); syncTitleRank();", context);
  assert.equal(required("#profile-total-xp").textContent, "100 XP total");
});

test("all eight approved ranks retain the saved XP thresholds", () => {
  const expected = ["Landlubber", "Deckhand", "Sailor", "Helmsman", "Navigator", "Skipper", "Captain", "Sea Legend"];
  const ranks = runInNewContext(`${progressJs}\nArray.from({length: 8}, (_, i) => rankForXp(i * 100))`, constants);
  ranks.forEach((rank, index) => {
    assert.equal(rank.level, index + 1);
    assert.equal(rank.xp, index * 100);
    assert.equal(rank.rank, expected[index]);
  });
});

test("closing the profile restores the avatar focus and its expanded state", () => {
  const elements = { titleProfile: required("#profile-trigger"), titleProfilePanel: { hidden: false }, titleLogbook: required("#logbook-trigger"), titleLogbookPanel: { hidden: true }, lessonChooser: { hidden: true } };
  runInNewContext(`${close}\ncloseTitleDialog();`, { elements, required });
  assert.equal(elements.titleProfilePanel.hidden, true);
  assert.equal(elements.titleProfile.attributes["aria-expanded"], "false");
  assert.equal(elements.titleProfile.focused, true);
  assert.equal(required(".welcome-lockup").hidden, false);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="player-profile-panel"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(main, /event.code === "Tab"\) trapFocusWithin\(titleDialog, event\)/);
});
