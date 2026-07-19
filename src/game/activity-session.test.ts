import { describe, expect, it } from "vitest";
import { ActivitySession, type ActivityObservation } from "./activity-session";
import { FAIR_WINDS_WORLD } from "./world-definition";

function activity(id: string) {
  return FAIR_WINDS_WORLD.activities.find((candidate) => candidate.id === id)!;
}

const base: ActivityObservation = {
  dt: 1,
  x: 0,
  z: 0,
  speed: 2,
  heading: 0,
  attached: 0.8,
  tackCount: 0,
  reefed: false,
  heelRadians: 0.1,
  depth: 20,
  incident: false,
};

describe("ActivitySession", () => {
  it("grades two recovered tacks rather than waypoint arrival", () => {
    const session = new ActivitySession(activity("school-water-tacks"));
    session.update(base);
    expect(session.update({ ...base, tackCount: 1 }).progress).toBe(0.5);
    const result = session.update({ ...base, tackCount: 2 });
    expect(result.completed).toBe(true);
    expect(result.score?.total).toBeGreaterThan(80);
  });

  it("requires a settled reef for the heavy-air drill", () => {
    const session = new ActivitySession(activity("fresh-air-reef"));
    expect(session.update(base).completed).toBe(false);
    expect(
      session.update({
        ...base,
        x: -760,
        z: -620,
        reefed: true,
        heelRadians: 0.55,
      }).completed,
    ).toBe(false);
    expect(
      session.update({
        ...base,
        x: -760,
        z: -620,
        reefed: true,
        heelRadians: 0.2,
      }).completed,
    ).toBe(true);
  });

  it("uses the actual docked state for Juniper completion", () => {
    const session = new ActivitySession(activity("juniper-arrival"));
    expect(
      session.update({ ...base, x: 1_035, z: -470 }).completed,
    ).toBe(false);
    const result = session.update({
      ...base,
      x: 1_035,
      z: -470,
      dockedAt: "juniper-cove-dock",
    });
    expect(result.completed).toBe(true);
    expect(result.score?.safety).toBe(100);
  });
});
