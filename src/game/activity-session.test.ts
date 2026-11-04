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
  it.each([
    ["juniper-arrival", { dockedAt: "juniper-cove-dock" }, { dockedAt: undefined }],
    ["school-water-tacks", { tackCount: 2 }, { tackCount: 2, attached: 0 }],
    ["fresh-air-reef", { x: -760, z: -620, reefed: true }, { reefed: false }],
  ] as const)("keeps %s terminal after completion without duplicate credit", (id, finish, leave) => {
    const session = new ActivitySession(activity(id));
    session.update(base);
    const completed = session.update({ ...base, ...finish });
    expect(completed.completed).toBe(true);
    expect(completed.progress).toBe(1);
    const score = { ...completed.score };
    let previousCompleted = true;
    let credits = 1;
    for (const observation of [leave, finish]) {
      const result = session.update({ ...base, ...observation });
      if (!previousCompleted && result.completed && result.score) credits++;
      previousCompleted = result.completed;
      expect(result).toEqual(completed);
      expect(result.score).toEqual(score);
    }
    expect(credits).toBe(1);
  });

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

  it("scores the required weather return route from berth and offshore starts", () => {
    const score = (positions: number[]) => {
      const session = new ActivitySession({ ...activity("weather-shelter"), x: 0, z: 0 });
      for (const x of positions) session.update({ ...base, x });
      return session.update({ ...base, x: 0, weatherShelterComplete: true }).score!.efficiency;
    };
    expect(score([0, 150, 0])).toBe(100);
    expect(score([200, 0])).toBe(100);
    expect(score([0, 150, 0, 150, 0])).toBe(50);
    expect(score([200, 400, 0])).toBe(33);
  });
});
