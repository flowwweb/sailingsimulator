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
    expect(sampleLakeDepth(-520, 430)).toBe(0);
    expect(sampleLakeDepth(-470, 430)).toBeLessThan(3);
    expect(sampleLakeDepth(-390, 430)).toBeGreaterThan(10);
  });

  it("gives the cinematic North Light passage real land and shelves", () => {
    expect(sampleLakeDepth(560, 585)).toBe(0);
    expect(sampleLakeDepth(690, 620)).toBe(0);
    expect(sampleLakeDepth(625, 480)).toBeGreaterThan(5);
  });
});
