import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

test("radio voice only plays when ready and audible, and stop cancels it", () => {
  const source = readFileSync(new URL("../src/audio/game-audio.ts", import.meta.url), "utf8");
  const begin = source.indexOf("  playRadioNotice():");
  const end = source.indexOf("  getSettings():", begin);
  const muteBegin = source.indexOf("  toggleMute():");
  const muteEnd = source.indexOf("  setChannelVolume(", muteBegin);
  assert.ok(begin >= 0 && end > begin);
  assert.ok(muteBegin >= 0 && muteEnd > muteBegin);
  const methods = stripTypeScriptTypes(`class Radio {\n${source.slice(begin, end)}\n${source.slice(muteBegin, muteEnd)}\n}`, { mode: "strip" });
  const Radio = runInNewContext(`${methods}\nRadio`);
  const radio = new Radio();
  let started = 0, stopped = 0;
  radio.context = { state: "running", createBufferSource: () => ({ connect() {}, start() { started++; }, stop() { stopped++; } }) };
  radio.boatBus = {};
  radio.settings = { muted: false };
  assert.equal(radio.playRadioNotice(), 0);
  radio.radioNotice = { duration: 17.1 };
  assert.equal(radio.playRadioNotice(), 17.1);
  assert.equal(started, 1);
  radio.stopRadioNotice();
  radio.stopRadioNotice();
  assert.equal(stopped, 1);
  radio.persistSettings = () => {};
  radio.applyChannelGains = () => {};
  radio.playRadioNotice();
  radio.toggleMute();
  assert.equal(stopped, 2);
  assert.equal(radio.playRadioNotice(), 0);
  radio.settings.muted = false;
  radio.context.state = "suspended";
  assert.equal(radio.playRadioNotice(), 0);
  assert.equal(started, 2);
});

test("spoken notice keeps its subtitle visible for the audio duration", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const begin = source.indexOf("function showRadioSubtitle(");
  const end = source.indexOf("\n}", begin) + 2;
  assert.ok(begin >= 0 && end > begin);
  const fn = stripTypeScriptTypes(source.slice(begin, end), { mode: "strip" });
  const subtitle = { hidden: true }, text = { textContent: "" };
  const context = { radioSubtitleSeconds: 0, required: (selector) => selector === "#radio-subtitle" ? subtitle : text };
  runInNewContext(`${fn}\nshowRadioSubtitle("Safety traffic", 17.1);`, context);
  assert.equal(subtitle.hidden, false);
  assert.equal(text.textContent, "Safety traffic");
  assert.equal(context.radioSubtitleSeconds, 17.1);
});

test("radio subtitle uses an accessible icon and avoids simulated VHF prefix", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const icons = readFileSync(new URL("../public/brand/fairwinds-icons.svg", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(html, /id="radio-subtitle"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="radio-subtitle"[\s\S]*?#fw-radio[\s\S]*?id="radio-subtitle-text"/);
  assert.match(html, /id="radio-toggle"[^>]*aria-label="Radio"/);
  assert.match(icons, /id="fw-radio"/);
  assert.doesNotMatch(main, /showRadioSubtitle\("Simulated VHF/);
});

test("hiding the tab stops the voice and clears the subtitle without waiting for a frame", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const begin = source.indexOf("function handleRadioVisibilityChange(");
  const end = source.indexOf("\n}", begin) + 2;
  assert.ok(begin >= 0 && end > begin);
  const fn = stripTypeScriptTypes(source.slice(begin, end), { mode: "strip" });
  const subtitle = { hidden: false };
  let stops = 0;
  const context = { document: { hidden: false }, audio: { stopRadioNotice: () => { stops++; } },
    radioSubtitleSeconds: 12, required: () => subtitle };
  runInNewContext(`${fn}\nhandleRadioVisibilityChange();`, context);
  assert.equal(stops, 0);
  assert.equal(subtitle.hidden, false);
  context.document.hidden = true;
  runInNewContext("handleRadioVisibilityChange();", context);
  assert.equal(stops, 1);
  assert.equal(subtitle.hidden, true);
  assert.equal(context.radioSubtitleSeconds, 0);
});
