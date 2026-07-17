import { describe, expect, it } from "vitest";
import {
  BOAT_DEFINITIONS,
  COASTAL_28,
  HARBOR_20,
  LAKE_34,
  getSailDefinition,
  referencePolarSpeed,
} from "./boats";

describe("data-driven boat definitions", () => {
  it("keeps the first training boat mainsail-only", () => {
    expect(HARBOR_20.sailPlan).toHaveLength(1);
    expect(getSailDefinition(HARBOR_20, "mainsail")).toBeDefined();
    expect(getSailDefinition(HARBOR_20, "headsail")).toBeUndefined();
  });

  it("supports larger monohulls with optional headsails and deeper drafts", () => {
    expect(getSailDefinition(COASTAL_28, "headsail")?.area).toBeGreaterThan(0);
    expect(getSailDefinition(LAKE_34, "headsail")?.area).toBeGreaterThan(0);
    expect(COASTAL_28.hull.draft).toBeGreaterThan(HARBOR_20.hull.draft);
    expect(LAKE_34.hull.draft).toBeGreaterThan(COASTAL_28.hull.draft);
    expect(LAKE_34.hull.displacement).toBeGreaterThan(
      COASTAL_28.hull.displacement,
    );
  });

  it("uses unique ids and valid ordered polar references", () => {
    const definitions = Object.values(BOAT_DEFINITIONS);
    expect(new Set(definitions.map((boat) => boat.id)).size).toBe(
      definitions.length,
    );
    for (const boat of definitions) {
      expect(boat.polar.length).toBeGreaterThanOrEqual(5);
      expect(
        boat.polar.every(
          (point, index) =>
            point.speedToWindRatio > 0 &&
            (index === 0 ||
              point.trueWindAngleDegrees >
                boat.polar[index - 1]!.trueWindAngleDegrees),
        ),
      ).toBe(true);
    }
  });

  it("interpolates polar speed without driving the physics state", () => {
    const closeReach = referencePolarSpeed(
      HARBOR_20,
      (65 * Math.PI) / 180,
      8,
    );
    const beamReach = referencePolarSpeed(
      HARBOR_20,
      (90 * Math.PI) / 180,
      8,
    );

    expect(closeReach).toBeGreaterThan(0);
    expect(beamReach).toBeGreaterThan(closeReach);
    expect(referencePolarSpeed(HARBOR_20, 0, 8)).toBe(0);
  });
});
