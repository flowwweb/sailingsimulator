import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
function functionSource(name) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  return stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
}

test("radio controls do not disable the sailing helm", () => {
  const context = { bootComplete: true, started: true, incident: undefined,
    document: { hidden: false }, window: { matchMedia: () => ({ matches: false }) },
    isSimulationPaused: () => false, elements: { statusDetails: { hidden: true } } };
  assert.equal(runInNewContext(`${functionSource("canControlBoat")}\ncanControlBoat()`, context), true);
  context.incident = {};
  assert.equal(runInNewContext(`${functionSource("canControlBoat")}\ncanControlBoat()`, context), false);
});

test("incident cancels radio before showing incident controls", () => {
  const calls = [];
  const element = () => ({ textContent: "", dataset: {}, classList: { add() {} }, hidden: true });
  const context = { resetRadio: () => calls.push("radio reset"), interruptLessonAttempt: () => calls.push("interrupt"),
    incident: undefined, incidentElapsed: 0, activeBoat: { name: "Dinghy" },
    elements: { gameShell: element(), incident: element(), incidentTitle: element(), incidentBody: element(), status: element() },
    requestAnimationFrame: (callback) => callback() };
  runInNewContext(`${functionSource("beginIncident")}\nbeginIncident({ kind: 'collision', severity: 'impact' });`, context);
  assert.deepEqual(calls, ["radio reset", "interrupt"]);
  assert.equal(context.elements.incident.hidden, false);
});

test("marina call guidance follows the real radio interaction without interrupting the first buoy lesson", () => {
  const radioSource = readFileSync(new URL("../src/game/harbor-radio.ts", import.meta.url), "utf8");
  const radioJs = stripTypeScriptTypes(radioSource, { mode: "transform" }).replace(/^export /gm, "");
  const HarborRadio = runInNewContext(`${radioJs}\nHarborRadio`);
  const radio = new HarborRadio();
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: "", hidden: selector === "#radio-panel" || selector === "#radio-marina-hint", attrs: {},
      getAttribute(name) { return this.attrs[name]; }, setAttribute(name, value) { this.attrs[name] = value; } });
    return nodes.get(selector);
  };
  const ctx = { harborRadio: radio, harborDock: { x: 0, z: 0 }, state: { position: { x: 401, y: 0 } },
    started: true, firstBuoy: undefined, incident: undefined, required: node };
  const sync = `${functionSource("harborDistance")}\n${functionSource("updateRadioGuidance")}\nupdateRadioGuidance();`;
  const update = () => runInNewContext(sync, ctx);
  update(); assert.equal(node("#radio-marina-hint").hidden, true);
  ctx.state.position.x = 400; update();
  assert.equal(node("#radio-marina-hint").hidden, false);
  assert.equal(node("#radio-toggle").getAttribute("aria-label"), "Radio: call Juniper Marina");
  ctx.firstBuoy = {}; update(); assert.equal(node("#radio-marina-hint").hidden, true);
  ctx.firstBuoy = undefined; node("#radio-panel").hidden = false; update();
  assert.equal(node("#radio-next-step").textContent, "Tune to Juniper Marina's channel 80.");
  radio.selectChannel(80); update(); assert.equal(node("#radio-next-step").textContent, "Listen on channel 80 before calling.");
  radio.listen(); ctx.state.position.x = 401; update();
  assert.equal(node("#radio-next-step").textContent, "Sail within 400 m of Juniper Marina to call.");
  ctx.state.position.x = 400; update(); assert.equal(node("#radio-next-step").textContent, "Call Juniper Marina.");
  assert.match(radio.call(400), /Request a visitor berth/); update();
  assert.equal(node("#radio-next-step").textContent, "Wait for the marina's reply.");
  for (let i = 0; i < 21; i++) radio.update(.1);
  update(); assert.equal(node("#radio-next-step").textContent, "Return to channel 16 to keep watch.");
  radio.selectChannel(16); update(); assert.equal(node("#radio-next-step").textContent, "Channel 16 selected. Continue sailing.");
  node("#radio-panel").hidden = true; update(); assert.equal(node("#radio-marina-hint").hidden, true);
  radio.reset(); ctx.state.position.x = NaN; update(); assert.equal(node("#radio-marina-hint").hidden, true);
});
