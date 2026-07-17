import { describe, expect, it } from "vitest";
import { LAKE_RADIUS, sampleLakeDepth } from "./bathymetry";

describe("lake bathymetry", () => {
  it("is deepest in open water and shelves toward shore", () => {
    const center = sampleLakeDepth(0, 0);
    const nearShore = sampleLakeDepth(LAKE_RADIUS - 80, 0);

    expect(center).toBeCloseTo(36, 6);
    expect(nearShore).toBeGreaterThan(0);
    expect(nearShore).toBeLessThan(center);
    expect(sampleLakeDepth(LAKE_RADIUS, 0)).toBe(0);
  });

  it("marks Pine islet and its surrounding shelf as shallow", () => {
    expect(sampleLakeDepth(-650, 400)).toBe(0);
    expect(sampleLakeDepth(-590, 400)).toBeLessThan(3);
    expect(sampleLakeDepth(-470, 400)).toBeGreaterThan(10);
  });

  it("keeps a generous deep channel between the North Light headlands", () => {
    expect(sampleLakeDepth(-320, 1_050)).toBe(0);
    expect(sampleLakeDepth(980, 720)).toBe(0);
    for (const z of [400, 520, 640, 720, 850]) {
      expect(sampleLakeDepth(600, z)).toBeGreaterThan(10);
    }
    expect(980 - -320 - 500 - 300).toBeGreaterThanOrEqual(500);
  });
});
