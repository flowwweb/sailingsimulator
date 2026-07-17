import { describe, expect, it } from "vitest";
import {
  isInsideLake,
  sampleLakeDepth,
} from "./bathymetry";

describe("lake bathymetry", () => {
  it("is deepest in open water and shelves toward shore", () => {
    const center = sampleLakeDepth(0, 0);
    const nearShore = sampleLakeDepth(1_600, 0);

    expect(center).toBeGreaterThan(34);
    expect(nearShore).toBeGreaterThan(0);
    expect(nearShore).toBeLessThan(center);
    expect(sampleLakeDepth(2_000, 0)).toBe(0);
  });

  it("uses an asymmetric warped basin rather than a circular boundary", () => {
    expect(isInsideLake(1_600, 0)).toBe(true);
    expect(isInsideLake(0, 1_600)).toBe(false);
    expect(sampleLakeDepth(1_600, 0)).not.toBe(
      sampleLakeDepth(-1_600, 0),
    );
  });

  it("marks Pine islet and its surrounding shelf as shallow", () => {
    expect(sampleLakeDepth(-650, 400)).toBe(0);
    expect(sampleLakeDepth(-590, 400)).toBeLessThan(3);
    expect(sampleLakeDepth(-470, 400)).toBeGreaterThan(10);
    expect(sampleLakeDepth(-550, 400)).toBeLessThan(
      sampleLakeDepth(-650, 500),
    );
  });

  it("keeps a generous deep channel between the North Light headlands", () => {
    expect(sampleLakeDepth(-320, 1_300)).toBe(0);
    expect(sampleLakeDepth(1_050, 1_160)).toBe(0);
    for (const x of [250, 350, 450, 550, 650, 750]) {
      expect(sampleLakeDepth(x, 900)).toBeGreaterThan(0);
    }
    expect(sampleLakeDepth(500, 900)).toBeGreaterThan(10);
  });
});
