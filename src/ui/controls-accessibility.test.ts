import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameInput } from "../game/input";
import { bindTabList, trapFocusWithin } from "./primitives";
import { createLessonState, observeLesson } from "../game/lesson-session";
import { SailingAcademy } from "../game/academy";
import { computeSailAerodynamics, stepBoat } from "../sim/model";
import { castOffRequested } from "../game/docking";

// Minimal DOM event fixture; native browser focus/activation remains a separate check.
class Element extends EventTarget {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  tabIndex = 0;
  hidden = false;
  disabled = false;
  id = "";
  tagName = "DIV";
  parent?: Element;
  classList = { toggle() {} };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  closest(selector: string): Element | null {
    for (let element: Element | undefined = this; element; element = element.parent) {
      if (selector === "[hidden]" && element.hidden) return element;
      if (selector.includes('[role="dialog"]') && element.getAttribute("role") === "dialog") return element;
      if (selector.includes("summary") && element.tagName === "SUMMARY") return element;
    }
    return null;
  }
  focus() { doc.activeElement = this; }
  setPointerCapture() {}
  hasPointerCapture() { return true; }
  releasePointerCapture() {}
  clientWidth = 844;
}
class Button extends Element {}
class Input extends Element { value = "1"; }
class Select extends Element {}
class Root extends Element {
  elements: Element[] = [];
  querySelector(selector: string) { return this.elements.find(e => selector === "#" + e.id) ?? null; }
  querySelectorAll(selector: string) {
    const data = { "[data-control]": "control", "[data-sail-action]": "sailAction", "[data-ui-tab]": "uiTab", "[data-ui-panel]": "uiPanel" }[selector];
    return data ? this.elements.filter(e => e.dataset[data] !== undefined) : this.elements.filter(e => (e instanceof Button || e instanceof Input || e instanceof Select || (selector.includes("summary") && e.tagName === "SUMMARY")) && !e.disabled);
  }
}
let doc: EventTarget & { activeElement: Element | null; hidden: boolean };
let win: EventTarget;
let clock: number;
let input: GameInput | undefined;
const event = (type: string, properties: Record<string, unknown> = {}) => {
  const result = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(properties)) Object.defineProperty(result, name, { value });
  return result;
};
beforeEach(() => {
  doc = Object.assign(new EventTarget(), { activeElement: null, hidden: false });
  win = new EventTarget(); clock = 0;
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("HTMLElement", Element); vi.stubGlobal("HTMLButtonElement", Button);
  vi.stubGlobal("HTMLInputElement", Input); vi.stubGlobal("HTMLSelectElement", Select);
  vi.stubGlobal("performance", { now: () => clock });
});

describe("direct trim and canvas steering", () => {
  let canvas: Element, slider: Input, enabled: boolean;
  const setup = () => {
    const root = new Root(); canvas = new Element(); canvas.id = "lake";
    slider = new Input(); slider.id = "hud-sheet"; root.elements = [canvas, slider]; enabled = true;
    input = new GameInput(root as unknown as ParentNode, () => enabled);
  };
  const pointer = (type: string, x: number, extra: Record<string, unknown> = {}) => event(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, ...extra });
  const trim = (value: number) => { slider.value = String(value); slider.dispatchEvent(event("input")); };

  it("applies a slider target once, observes intent and casts off only on fresh movement", () => {
    setup(); trim(.55); const controls = input!.read(.93);
    expect(controls).toEqual({ rudder: 0, sheetRate: -1, sheetTarget: .55, headsailRate: 0 });
    expect(castOffRequested(controls, neutral)).toBe(true);
    const state = createLessonState(0, { x: -6, y: 0 });
    expect(stepBoat(state, controls, { trueWind: { x: -6, y: 0 } }, 1 / 60).state.sheet).toBe(.55);
    expect(input!.read(.55)).toEqual(neutral);
    trim(.4); expect(castOffRequested(input!.read(.55), controls)).toBe(true);
    slider.value = ".2"; expect(input!.read(.55)).toEqual(neutral);
    trim(.55); expect(castOffRequested(input!.read(.55), neutral)).toBe(false);
    trim(.2); input!.releaseAll(); expect(input!.read(.55)).toEqual(neutral);
  });
  it("earns Trim using a slider event, the actual model and fixed-step observation", () => {
    setup(); const wind = { x: -6, y: 0 }, academy = new SailingAcademy();
    let state = createLessonState(0, wind);
    academy.update(1 / 60, observeLesson(state, computeSailAerodynamics(state, { trueWind: wind }), neutral));
    trim(.55);
    for (let i = 0; i < 900 && academy.objectiveIndex() === 0; i++) {
      const controls = input!.read(state.sheet), result = stepBoat(state, controls, { trueWind: wind }, 1 / 60);
      state = result.state; academy.update(1 / 60, observeLesson(state, result.sail, controls));
    }
    expect(academy.objectiveIndex()).toBe(1);
  });
  it("clamps finite values and rejects disabled, invalid or interrupted trim", () => {
    setup(); trim(2); expect(input!.read(.5).sheetTarget).toBe(1);
    trim(-1); expect(input!.read(.5).sheetTarget).toBe(0);
    trim(NaN); expect(input!.read(.5)).toEqual(neutral);
    enabled = false; trim(.2); enabled = true; expect(input!.read(.5)).toEqual(neutral);
    trim(.2); enabled = false; expect(input!.read(.5)).toEqual(neutral);
    enabled = true; expect(input!.read(.5)).toEqual(neutral);
    trim(.2); win.dispatchEvent(event("blur")); expect(input!.read(.5)).toEqual(neutral);
  });
  it("steers proportionally in either direction with a dead zone, clamps and centers", () => {
    setup(); canvas.dispatchEvent(pointer("pointerdown", 400));
    canvas.dispatchEvent(pointer("pointermove", 405)); expect(input!.read().rudder).toBe(0);
    canvas.dispatchEvent(pointer("pointermove", 480)); const right = input!.read().rudder; expect(right).toBeGreaterThan(0); expect(right).toBeLessThan(1);
    canvas.dispatchEvent(pointer("pointermove", 320)); expect(input!.read().rudder).toBeCloseTo(-right);
    canvas.dispatchEvent(pointer("pointermove", 800)); expect(input!.read().rudder).toBe(1);
    canvas.dispatchEvent(pointer("pointerup", 800)); expect(input!.read()).toEqual(neutral);
  });
  for (const reason of ["pointercancel", "lostpointercapture", "blur", "hidden", "releaseAll", "modal", "second-pointer"]) it(`clears a gesture on ${reason} without stale rearming`, () => {
    setup(); canvas.dispatchEvent(pointer("pointerdown", 400)); canvas.dispatchEvent(pointer("pointermove", 500)); expect(input!.read().rudder).toBeGreaterThan(0);
    if (reason === "blur") win.dispatchEvent(event("blur"));
    else if (reason === "hidden") { doc.hidden = true; doc.dispatchEvent(event("visibilitychange")); doc.hidden = false; }
    else if (reason === "releaseAll") input!.releaseAll();
    else if (reason === "modal") { enabled = false; expect(input!.read()).toEqual(neutral); enabled = true; }
    else if (reason === "second-pointer") win.dispatchEvent(pointer("pointerdown", 420, { pointerId: 2, isPrimary: false }));
    else canvas.dispatchEvent(pointer(reason, 500));
    canvas.dispatchEvent(pointer("pointermove", 600)); expect(input!.read()).toEqual(neutral);
  });
  it("ignores mouse, nonprimary and modal starts; keyboard fallback remains independent", () => {
    setup();
    for (const extra of [{ pointerType: "mouse" }, { isPrimary: false }]) { canvas.dispatchEvent(pointer("pointerdown", 400, extra)); canvas.dispatchEvent(pointer("pointermove", 500, extra)); expect(input!.read()).toEqual(neutral); }
    enabled = false; canvas.dispatchEvent(pointer("pointerdown", 400)); enabled = true; canvas.dispatchEvent(pointer("pointermove", 500)); expect(input!.read()).toEqual(neutral);
    canvas.dispatchEvent(pointer("pointerdown", 400)); canvas.dispatchEvent(pointer("pointermove", 500)); key("keydown", canvas, "KeyA"); expect(input!.read().rudder).toBe(-1);
    canvas.dispatchEvent(pointer("pointercancel", 500)); expect(input!.read().rudder).toBe(-1); key("keyup", canvas, "KeyA"); expect(input!.read()).toEqual(neutral);
  });
});
afterEach(() => { input?.destroy(); input = undefined; vi.unstubAllGlobals(); });
const controls = () => {
  const root = new Root(), buttons = Object.fromEntries(["port", "starboard", "ease", "sheet"].map(control => {
    const button = new Button(); button.dataset.control = control; root.elements.push(button); return [control, button];
  }));
  input = new GameInput(root as unknown as ParentNode);
  return buttons;
};
const key = (type: string, button: Element, code: string, repeat = false) => {
  const e = event(type, { target: button, code, repeat }); win.dispatchEvent(e); return e;
};
const neutral = { rudder: 0, sheetRate: 0 };

describe("shared Settings focus wrap", () => {
  it("leaves Start-to-summary navigation native and wraps after the trailing disclosure", () => {
    const root = new Root(), back = new Button(), start = new Button();
    const summary = new Element(); summary.tagName = "SUMMARY";
    const hidden = new Element(); hidden.hidden = true;
    const hiddenSummary = new Element(); hiddenSummary.tagName = "SUMMARY"; hiddenSummary.parent = hidden;
    const skippedSummary = new Element(); skippedSummary.tagName = "SUMMARY"; skippedSummary.tabIndex = -1;
    const disabled = new Button(); disabled.disabled = true;
    root.elements = [back, start, summary, hiddenSummary, skippedSummary, disabled];
    const tab = (shiftKey = false) => {
      const e = event("keydown", { key: "Tab", shiftKey });
      trapFocusWithin(root as unknown as HTMLElement, e as KeyboardEvent);
      return e;
    };
    start.focus(); expect(tab().defaultPrevented).toBe(false);
    summary.focus(); expect(tab(true).defaultPrevented).toBe(false);
    expect(tab().defaultPrevented).toBe(true); expect(doc.activeElement).toBe(back);
    expect(tab(true).defaultPrevented).toBe(true); expect(doc.activeElement).toBe(summary);
  });
  for (const selected of ["weather", "water", "sound"]) it(`wraps through the selected ${selected} roving tab`, () => {
    const root = new Root(); root.id = "settings";
    const tabs = ["boat", "weather", "water", "sound"].map(id => { const b = new Button(); b.dataset.uiTab = id; return b; });
    const panels = tabs.map(tab => { const p = new Element(); p.dataset.uiPanel = tab.dataset.uiTab!; return p; });
    const fields = panels.map(panel => { const field = new Input(); field.parent = panel; return field; });
    const footer = new Button(); root.elements = [...tabs, ...panels, ...fields, footer];
    const controller = bindTabList(root as unknown as HTMLElement); controller.select(selected);
    const active = tabs.find(t => t.dataset.uiTab === selected)!; active.focus();
    const back = event("keydown", { key: "Tab", shiftKey: true }); trapFocusWithin(root as unknown as HTMLElement, back as KeyboardEvent);
    expect(back.defaultPrevented).toBe(true); expect(doc.activeElement).toBe(footer);
    const forward = event("keydown", { key: "Tab", shiftKey: false }); trapFocusWithin(root as unknown as HTMLElement, forward as KeyboardEvent);
    expect(forward.defaultPrevented).toBe(true); expect(doc.activeElement).toBe(active);
    fields[panels.findIndex(p => p.dataset.uiPanel === selected)]!.focus();
    const middle = event("keydown", { key: "Tab", shiftKey: false }); trapFocusWithin(root as unknown as HTMLElement, middle as KeyboardEvent);
    expect(middle.defaultPrevented).toBe(false);
    expect(tabs.filter(t => t.tabIndex === 0)).toEqual([active]);
  });
});

describe("focused helm and sheet activation", () => {
  for (const [control, expected] of Object.entries({ port: { rudder: -1, sheetRate: 0 }, starboard: { rudder: 1, sheetRate: 0 }, ease: { rudder: 0, sheetRate: 1 }, sheet: { rudder: 0, sheetRate: -1 } })) {
    for (const code of ["Enter", "Space"]) it(`holds/releases ${control} with ${code}`, () => {
      const button = controls()[control]!;
      expect(key("keydown", button, code).defaultPrevented).toBe(true);
      expect(input!.read()).toEqual(expected); expect(input!.isFastForwarding()).toBe(false);
      key("keydown", button, code, true); expect(input!.read()).toEqual(expected);
      expect(key("keyup", button, code).defaultPrevented).toBe(true); expect(input!.read()).toEqual(neutral);
    });
  }
  for (const cancel of ["window-blur", "button-blur", "hidden", "pause-releaseAll"]) it(`clears held input on ${cancel} without repeat rearming`, () => {
    const button = controls().port!; key("keydown", button, "Space");
    if (cancel === "window-blur") win.dispatchEvent(event("blur"));
    else if (cancel === "button-blur") button.dispatchEvent(event("blur"));
    else if (cancel === "hidden") { doc.hidden = true; doc.dispatchEvent(event("visibilitychange")); }
    else input!.releaseAll();
    expect(input!.read()).toEqual(neutral);
    key("keydown", button, "Space", true); expect(input!.read()).toEqual(neutral);
    key("keyup", button, "Space"); expect(input!.read()).toEqual(neutral);
  });
  it("keeps pointer cancellation independent of a held keyboard control and ignores pointer clicks", () => {
    const button = controls().sheet!;
    button.dispatchEvent(event("pointerdown", { pointerId: 1 })); key("keydown", button, "Enter");
    button.dispatchEvent(event("pointercancel")); expect(input!.read().sheetRate).toBe(-1);
    key("keyup", button, "Enter"); expect(input!.read()).toEqual(neutral);
    button.dispatchEvent(event("click", { detail: 1 })); expect(input!.read()).toEqual(neutral);
    for (const release of ["pointerup", "lostpointercapture"]) {
      button.dispatchEvent(event("pointerdown", { pointerId: 2 })); button.dispatchEvent(event(release)); expect(input!.read()).toEqual(neutral);
    }
  });
  it("bounds zero-detail native/AT clicks and cancels them immediately for Pause/Settings", () => {
    const buttons = controls(), button = buttons.ease!;
    button.dispatchEvent(event("click", { detail: 0 })); expect(input!.read().sheetRate).toBe(1);
    clock = 249; expect(input!.read().sheetRate).toBe(1);
    clock = 250; expect(input!.read()).toEqual(neutral);
    button.dispatchEvent(event("click", { detail: 0 })); input!.releaseAll(); expect(input!.read()).toEqual(neutral);
    clock = 251; expect(input!.read()).toEqual(neutral);
    button.dispatchEvent(event("click", { detail: 0 })); button.dispatchEvent(event("pointerdown", { pointerId: 3 }));
    button.dispatchEvent(event("pointercancel")); expect(input!.read()).toEqual(neutral);
    key("keydown", buttons.port!, "Enter"); button.dispatchEvent(event("click", { detail: 0 }));
    expect(input!.read()).toEqual({ rudder: -1, sheetRate: 1 });
    key("keyup", buttons.port!, "Enter"); input!.releaseAll(); expect(input!.read()).toEqual(neutral);
  });
  it("preserves sailing shortcuts and native sail-action buttons, while dialogs suppress game input", () => {
    const button = controls().port!; key("keydown", button, "KeyD"); expect(input!.read().rudder).toBe(1);
    key("keyup", button, "KeyD"); key("keydown", button, "KeyX"); expect(input!.consumeSails()).toBe(true);
    input!.releaseAll(); const dialog = new Element(); dialog.setAttribute("role", "dialog"); button.parent = dialog;
    key("keydown", button, "Enter"); key("keydown", button, "KeyD"); expect(input!.read()).toEqual(neutral);
    const native = new Button(); expect(key("keydown", native, "Space").defaultPrevented).toBe(false); expect(input!.isFastForwarding()).toBe(false);
    const background = new Element(); key("keydown", background, "Space"); expect(input!.isFastForwarding()).toBe(true);
    key("keyup", background, "Space"); expect(input!.isFastForwarding()).toBe(false);
  });
  it("retains click activation of Reef and Raise/Lower sails", () => {
    const root = new Root(), reef = new Button(), sails = new Button();
    reef.dataset.sailAction = "reef"; sails.dataset.sailAction = "toggle"; root.elements = [reef, sails];
    input = new GameInput(root as unknown as ParentNode);
    reef.dispatchEvent(event("click", { detail: 0 })); sails.dispatchEvent(event("click", { detail: 0 }));
    expect(input.consumeReef()).toBe(true); expect(input.consumeSails()).toBe(true);
    expect(input.consumeReef()).toBe(false); expect(input.consumeSails()).toBe(false);
    expect(input.read()).toEqual(neutral);
  });
  it("leaves native sail disclosure and trim slider keys to the browser", () => {
    controls();
    const summary = new Element(); summary.tagName = "SUMMARY";
    for (const code of ["Space", "Enter", "ArrowLeft", "KeyQ", "KeyX"]) {
      expect(key("keydown", summary, code).defaultPrevented).toBe(false);
      expect(input!.read()).toEqual(neutral);
      expect(input!.isFastForwarding()).toBe(false);
      expect(input!.consumeReef()).toBe(false); expect(input!.consumeSails()).toBe(false);
      key("keyup", summary, code);
    }
    const slider = new Input();
    for (const code of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(key("keydown", slider, code).defaultPrevented).toBe(false);
      expect(input!.read()).toEqual(neutral); key("keyup", slider, code);
    }
  });
  it("releases touch helm holds on cancel, capture loss and pause", () => {
    const button = controls().port!;
    for (const release of ["pointerup", "pointercancel", "lostpointercapture", "pause"]) {
      button.dispatchEvent(event("pointerdown", { pointerId: 1 }));
      expect(input!.read()).toEqual({ rudder: -1, sheetRate: 0 });
      if (release === "pause") input!.releaseAll(); else button.dispatchEvent(event(release));
      expect(input!.read()).toEqual(neutral);
    }
  });
});
