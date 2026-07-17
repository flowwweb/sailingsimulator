import { describe, expect, it } from "vitest";
import { lakeShoalFor } from "../game/bathymetry";
import { landmarkGroundHeight } from "./landmark-grounding";

describe("landmark ground anchoring", () => {
  it("places an offset lighthouse on the shoreline slope, not summit height", () => {
    const headland = lakeShoalFor("north-light")!;
    const ground = landmarkGroundHeight(
      headland,
      headland.x - 260,
      headland.z - 10,
      26,
      30.28,
    );

    expect(ground).toBeGreaterThanOrEqual(1.6);
    expect(ground).toBeLessThan(6);
  });

  it("keeps centered landmarks on the headland summit", () => {
    const headland = lakeShoalFor("north-light")!;
    expect(
      landmarkGroundHeight(
        headland,
        headland.x,
        headland.z,
        26,
        30.28,
      ),
    ).toBeCloseTo(30.28, 5);
  });
});
