import { describe, expect, it } from "vitest";
import { INTERIOR_FLOOR_BOW_Z, isInsideHullWaterMask } from "./hull-water-mask";

describe("player hull water exclusion", () => {
  it("keeps the water cutout inside the hull while the floor seals the bow", () => {
    expect(isInsideHullWaterMask(0, 2.3)).toBe(true);
    expect(isInsideHullWaterMask(0.7, 0.35)).toBe(true);
    expect(isInsideHullWaterMask(0, 2.7)).toBe(false);
    expect(isInsideHullWaterMask(1, 0)).toBe(false);
    expect(INTERIOR_FLOOR_BOW_Z).toBeGreaterThan(3);
  });
});
