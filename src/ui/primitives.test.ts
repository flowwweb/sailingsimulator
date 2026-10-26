import { afterEach, expect, it, vi } from "vitest";
import { trapFocusWithin } from "./primitives";

const doc: { activeElement: Control | null } = { activeElement: null };
class Control {
  tabIndex = 0;
  hidden = false;
  disabled = false;
  constructor(readonly tagName: string) {}
  closest() { return this.hidden ? this : null; }
  focus() { doc.activeElement = this; }
}
afterEach(() => vi.unstubAllGlobals());

it("reaches a native summary before wrapping and excludes hidden or untabbable controls", () => {
  vi.stubGlobal("document", doc);
  const back = new Control("BUTTON"), start = new Control("BUTTON");
  const summary = new Control("SUMMARY"), skipped = new Control("SUMMARY");
  const hidden = new Control("SUMMARY"), disabled = new Control("BUTTON");
  skipped.tabIndex = -1; hidden.hidden = true; disabled.disabled = true;
  const controls = [back, start, summary, skipped, hidden, disabled];
  const root = {
    querySelectorAll: (selector: string) => controls.filter(control => !control.disabled &&
      (control.tagName === "BUTTON" || (selector.includes("summary") && control.tagName === "SUMMARY"))),
  } as unknown as HTMLElement;
  const tab = (shiftKey = false) => {
    const event = { shiftKey, preventDefault: vi.fn() };
    trapFocusWithin(root, event as unknown as KeyboardEvent);
    return event.preventDefault;
  };

  start.focus(); expect(tab()).not.toHaveBeenCalled();
  summary.focus(); expect(tab(true)).not.toHaveBeenCalled();
  expect(tab()).toHaveBeenCalledOnce(); expect(doc.activeElement).toBe(back);
  expect(tab(true)).toHaveBeenCalledOnce(); expect(doc.activeElement).toBe(summary);
});
