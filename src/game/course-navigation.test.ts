import { describe, expect, it } from "vitest";
import { courseMetrics } from "./course-navigation";

describe("course navigation", () => {
  it("reports bearing, course error, VMG, and ETA toward a waypoint", () => {
    const metrics = courseMetrics(
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      0,
      { x: 0, z: 100 },
    );
    expect(metrics.bearingDegrees).toBe(0);
    expect(metrics.courseErrorDegrees).toBe(0);
    expect(metrics.vmg).toBeCloseTo(2);
    expect(metrics.etaSeconds).toBeCloseTo(50);
  });

  it("uses a signed shortest course error and withholds ETA when opening", () => {
    const metrics = courseMetrics(
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      (350 * Math.PI) / 180,
      { x: 100, z: 0 },
    );
    expect(metrics.bearingDegrees).toBe(90);
    expect(metrics.courseErrorDegrees).toBeCloseTo(100);
    expect(metrics.vmg).toBeCloseTo(-1);
    expect(metrics.etaSeconds).toBeUndefined();
  });
});
