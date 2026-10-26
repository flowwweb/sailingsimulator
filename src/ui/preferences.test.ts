import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBooleanPreference, saveBooleanPreference } from "./preferences";

afterEach(() => vi.unstubAllGlobals());

describe("settings preferences", () => {
  it("preserves explicit false instead of the device default", () => {
    vi.stubGlobal("localStorage", { getItem: () => "false" });
    expect(loadBooleanPreference("touch", true)).toBe(false);
  });

  it("uses the device default for missing or malformed values", () => {
    for (const value of [null, "invalid"]) {
      vi.stubGlobal("localStorage", { getItem: () => value });
      expect(loadBooleanPreference("touch", true)).toBe(true);
    }
  });

  it("keeps settings usable when storage reads are blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); } });
    expect(loadBooleanPreference("contrast", false)).toBe(false);
  });

  it("reports persistence failure without throwing", () => {
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("full"); } });
    expect(saveBooleanPreference("contrast", true)).toBe(false);
  });

  it("writes the requested preference without touching progress", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    expect(saveBooleanPreference("contrast", true)).toBe(true);
    expect(setItem.mock.calls).toEqual([["contrast", "true"]]);
  });
});
