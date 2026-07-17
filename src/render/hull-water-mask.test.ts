import { describe, expect, it } from "vitest";
import {
  HULL_CONTACT_BOW_Z,
  HULL_CONTACT_STERN_Z,
  INTERIOR_FLOOR_BOW_Z,
  hullContactWidthAt,
} from "./hull-water-mask";

describe("player hull water contact", () => {
  it("follows the hull outline instead of carving an ellipse out of the lake", () => {
    expect(hullContactWidthAt(HULL_CONTACT_BOW_Z)).toBeCloseTo(0.035);
    expect(hullContactWidthAt(2.12)).toBeCloseTo(0.76);
    expect(hullContactWidthAt(0.35)).toBeCloseTo(1.08);
    expect(hullContactWidthAt(HULL_CONTACT_STERN_Z)).toBeCloseTo(0.67);
    expect(hullContactWidthAt(1.2)).toBeGreaterThan(0.76);
    expect(INTERIOR_FLOOR_BOW_Z).toBeGreaterThan(3);
  });
});
