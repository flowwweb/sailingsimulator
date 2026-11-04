import { describe, expect, it } from "vitest";
import { RadioNotices } from "./radio-notices";

describe("simulated safety notice", () => {
  it("waits for active sailing, does not interrupt a call, and spaces notices apart", () => {
    const notices = new RadioNotices();
    for (let i = 0; i < 400; i++) expect(notices.update(0.1, false, false)).toBe(false);
    for (let i = 0; i < 300; i++) expect(notices.update(0.1, true, true)).toBe(false);
    expect(notices.update(0.1, true, false)).toBe(true);
    expect(notices.update(0.1, true, false)).toBe(false);
    for (let i = 0; i < 1790; i++) expect(notices.update(0.1, true, false)).toBe(false);
    let repeated = false;
    for (let i = 0; i < 11; i++) repeated ||= notices.update(0.1, true, false);
    expect(repeated).toBe(true);
    notices.reset();
    expect(notices.update(NaN, true, false)).toBe(false);
    expect(notices.update(1, true, false)).toBe(false);
    expect(notices.update(0.1, true, false)).toBe(false);
  });
});
