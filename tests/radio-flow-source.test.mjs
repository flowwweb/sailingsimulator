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
  ctx.state.position.x = 400; update(); assert.equal(node("#radio-next-step").textContent, "Write your call, then transmit.");
  assert.match(radio.call(400, "   "), /Write your call/); assert.equal(radio.awaiting, false);
  node("#radio-message").value = "Juniper Marina, this is Fair Winds. Request a berth. Over."; update();
  assert.equal(node("#radio-next-step").textContent, "Transmit your call.");
  assert.match(radio.call(400, node("#radio-message").value), /Request a berth/); update();
  assert.equal(node("#radio-next-step").textContent, "Wait for the marina's reply.");
  for (let i = 0; i < 21; i++) radio.update(.1);
  update(); assert.equal(node("#radio-next-step").textContent, "Return to channel 16 to keep watch.");
  radio.selectChannel(16); update(); assert.equal(node("#radio-next-step").textContent, "Channel 16 selected. Continue sailing.");
  node("#radio-panel").hidden = true; update(); assert.equal(node("#radio-marina-hint").hidden, true);
  radio.reset(); ctx.state.position.x = NaN; update(); assert.equal(node("#radio-marina-hint").hidden, true);
});

test("the call handler transmits only the player's non-empty simulated text and reset clears it", () => {
  const radioSource = readFileSync(new URL("../src/game/harbor-radio.ts", import.meta.url), "utf8");
  const radioJs = stripTypeScriptTypes(radioSource, { mode: "transform" }).replace(/^export /gm, "");
  const HarborRadio = runInNewContext(`${radioJs}\nHarborRadio`), harborRadio = new HarborRadio();
  harborRadio.selectChannel(80); harborRadio.listen();
  const nodes = new Map();
  const required = selector => { if (!nodes.has(selector)) nodes.set(selector, { value: "", textContent: "", disabled: false, hidden: false }); return nodes.get(selector); };
  const start = main.indexOf('  required("#radio-call").addEventListener("click", () => {');
  const end = main.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start);
  const body = stripTypeScriptTypes(main.slice(main.indexOf("{", start) + 1, end), { mode: "transform" });
  let subtitle = "";
  const ctx = { harborRadio, harborDistance: () => 100, required, showRadioSubtitle: text => { subtitle = text; },
    audio: { stopRadioNotice() {} }, setRadioOpen() {}, radioNotices: { reset() {} }, radioSubtitleSeconds: 0 };
  runInNewContext(`(() => { ${body} })();`, ctx);
  assert.equal(harborRadio.awaiting, false); assert.match(subtitle, /Write your call/);
  required("#radio-message").value = "  Juniper Marina, this is Fair Winds.\nMy position: 100 m off. Request berth. Over.  ";
  runInNewContext(`(() => { ${body} })();`, ctx);
  assert.equal(harborRadio.awaiting, true); assert.equal(required("#radio-channel").disabled, true);
  assert.equal(subtitle, "Juniper Marina, this is Fair Winds. My position: 100 m off. Request berth. Over.");
  assert.equal(required("#radio-caption").textContent, subtitle);
  runInNewContext(`${functionSource("resetRadio")}\nresetRadio();`, ctx);
  assert.equal(harborRadio.awaiting, false); assert.equal(required("#radio-message").value, "");
  assert.equal(required("#radio-channel").disabled, false);
});

function keyboardFixture() {
  class Element { dataset = {}; isContentEditable = false; closest() { return null; } }
  class Button extends Element {} class Input extends Element {} class Select extends Element {} class TextArea extends Element {}
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null }), window = new EventTarget();
  const context = { HTMLElement: Element, HTMLButtonElement: Button, HTMLInputElement: Input, HTMLSelectElement: Select, HTMLTextAreaElement: TextArea,
    document, window, performance };
  const source = stripTypeScriptTypes(readFileSync(new URL("../src/game/input.ts", import.meta.url), "utf8"), { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
  const { GameInput, isTextEntryTarget } = runInNewContext(`${source}\n({ GameInput, isTextEntryTarget })`, context);
  const input = new GameInput({ querySelector: () => null, querySelectorAll: () => [] });
  const dispatch = (target, code, type = "keydown", repeat = false) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries({ target, code, repeat })) Object.defineProperty(event, key, { value });
    window.dispatchEvent(event); return event;
  };
  return { Element, TextArea, Input, Select, context, input, dispatch, isTextEntryTarget };
}

test("textarea and contenteditable typing cannot trigger gameplay shortcuts outside a dialog", () => {
  const fixture = keyboardFixture(), { Element, TextArea, input, dispatch } = fixture;
  try {
    const editable = new Element(); editable.isContentEditable = true;
    for (const target of [new TextArea(), editable]) for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyX", "KeyR", "KeyM", "KeyC", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]) {
      assert.equal(dispatch(target, code).defaultPrevented, false);
      assert.equal(input.read().rudder, 0); assert.equal(input.read().sheetRate, 0); assert.equal(input.isFastForwarding(), false);
      assert.equal(input.consumeReef(), false); assert.equal(input.consumeSails(), false); assert.equal(input.consumeReset(), false);
      assert.equal(input.consumeMute(), false); assert.equal(input.consumeConditions(), false);
      assert.equal(dispatch(target, code, "keyup").defaultPrevented, false);
    }
    const background = new Element(); dispatch(background, "KeyD"); assert.equal(input.read().rudder, 1);
    dispatch(new TextArea(), "KeyD", "keyup"); assert.equal(input.read().rudder, 0);
  } finally { input.destroy(); }
});

test("the main global chart and title shortcuts ignore editors while radio Escape stays native", () => {
  const fixture = keyboardFixture(), { Element, TextArea, Input, Select, isTextEntryTarget } = fixture;
  const start = main.indexOf('  window.addEventListener("keydown", (event) => {');
  const end = main.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start);
  const body = stripTypeScriptTypes(`(event => { ${main.slice(main.indexOf("{", start) + 1, end)} })`, { mode: "strip" });
  const nodes = new Map();
  const required = selector => { if (!nodes.has(selector)) nodes.set(selector, { hidden: true, contains: () => true }); return nodes.get(selector); };
  let chartOpened = false, radioClosed = false, titleMoves = 0;
  const context = { isTextEntryTarget, required, document: fixture.context.document, started: true, paused: false,
    isConditionsOpen: () => false, isChartOpen: () => false, setChartOpen: open => { chartOpened = open; },
    setRadioOpen: open => { radioClosed = !open; }, startTitleAudio() {}, moveTitleSelection: () => { titleMoves++; },
    elements: { statusDetails: { hidden: true }, lessonChooser: { hidden: true }, titleLogbookPanel: { hidden: true }, titleProfilePanel: { hidden: true } } };
  const run = (target, code) => {
    const event = new Event("keydown", { cancelable: true });
    for (const [key, value] of Object.entries({ target, code, repeat: false })) Object.defineProperty(event, key, { value });
    context.event = event; runInNewContext(`${body}(event);`, context); return event;
  };
  try {
    const editable = new Element(); editable.isContentEditable = true;
    for (const target of [new TextArea(), editable, new Input(), new Select()]) {
      assert.equal(run(target, "KeyN").defaultPrevented, false); assert.equal(chartOpened, false);
      context.started = false; run(target, "ArrowDown"); assert.equal(titleMoves, 0); context.started = true;
    }
    run(new Element(), "KeyN"); assert.equal(chartOpened, true);
    context.started = false; run(new Element(), "ArrowDown"); assert.equal(titleMoves, 1); context.started = true;
    required("#radio-panel").hidden = false;
    assert.equal(run(new TextArea(), "Escape").defaultPrevented, true); assert.equal(radioClosed, true);
  } finally { fixture.input.destroy(); }
});
