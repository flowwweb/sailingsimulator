import { describe, expect, it } from "vitest";
import { incidentBoatPose } from "./incident-pose";

describe("incident boat pose", () => {
  it("leans the complete boat when stranded instead of folding the rig", () => {
    const pose = incidentBoatPose("stranded", -1, 1, 0.04);

    expect(pose.hullRoll).toBeCloseTo(-0.16);
    expect(pose.rigRoll).toBe(0);
    expect(pose.rigPitch).toBe(0);
  });

  it("keeps the stronger relative rig motion for an impact", () => {
    const pose = incidentBoatPose("impact", 1, 0.5, 0.04);

    expect(pose.hullRoll).toBeCloseTo(0.08);
    expect(pose.rigRoll).toBeCloseTo(0.47);
    expect(pose.rigPitch).toBeCloseTo(-0.06);
  });
});
