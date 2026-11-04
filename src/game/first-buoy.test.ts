import { describe, expect, it } from "vitest";
import { FIRST_BUOY, FIRST_BUOY_COURSE, FirstBuoyJourney, type FirstBuoyObservation } from "./first-buoy";

const dt = 1 / 60;
const base: Required<FirstBuoyObservation> = {
  attached: 0.9, stall: 0, pointOfSail: "Beam reach", tackCount: 0, gybeCount: 0,
  reefed: false, heelRadians: 0.1, luff: 0, sailDeployment: 1, sailsRaised: true,
  forwardSpeed: 3, driveForce: 100, sheet: 0.6, sheetRate: 0, rudder: 0,
  apparentWindAngle: Math.PI / 2, yawRate: 0, boomAngle: -0.8, desiredBoomAngle: -0.8,
  position: { x: FIRST_BUOY_COURSE.x, y: FIRST_BUOY_COURSE.z + 50 }, heading: Math.PI, unsafe: false,
};

function sample(offsetM: number, overrides: Partial<FirstBuoyObservation> = {}): FirstBuoyObservation {
  return { ...base, position: { x: FIRST_BUOY_COURSE.x, y: FIRST_BUOY_COURSE.z + offsetM }, ...overrides };
}

function sail(journey: FirstBuoyJourney, from = 50, to = 14, overrides: Partial<FirstBuoyObservation> = {}): number {
  let completions = 0;
  const steps = Math.round(Math.abs(to - from) / 0.05);
  for (let i = 0; i <= steps; i++) {
    const offset = from + (to - from) * i / steps;
    const before = journey.objective();
    journey.update(dt, sample(offset, {
      sheet: 0.6 - Math.min(i / 1000, 0.1), sheetRate: -1,
      heading: Math.PI + Math.min(i / 1000, 0.1), rudder: 0.2, ...overrides,
    }));
    if (before.startsWith("Sail") && journey.objective().startsWith("Round")) completions++;
  }
  return completions;
}

describe("first buoy witnessed arrival", () => {
  it("binds the existing training mark and starts rounding after controlled entry", () => {
    expect(FIRST_BUOY_COURSE).toMatchObject({ x: 210, z: -310, kind: "lesson" });
    const distance = Math.hypot(FIRST_BUOY.start.x - FIRST_BUOY_COURSE.x, FIRST_BUOY.start.z - FIRST_BUOY_COURSE.z);
    expect(distance).toBeGreaterThan(54);
    expect(distance).toBeLessThan(58);
    expect(distance - FIRST_BUOY.radiusM).toBeGreaterThan(FIRST_BUOY.minTravelM);
    const journey = new FirstBuoyJourney();
    expect(sail(journey)).toBe(1);
    expect(journey.completed).toBe(false);
    expect(journey.failed).toBe(false);
    expect(journey.view(sample(14).position).instruction).toContain("port");
    expect(journey.update(dt, sample(14))).toBe(false);
    journey.interrupt();
    expect(journey.objective()).toContain("Sail");
  });

  it("does not award initial-inside, stationary input, or no-input drift", () => {
    const inside = new FirstBuoyJourney();
    expect(sail(inside, 14, 10)).toBe(0);
    expect(inside.view(sample(10).position).instruction).toContain("outside");
    const stationary = new FirstBuoyJourney();
    for (let i = 0; i < 1000; i++) stationary.update(dt, sample(14, { sheetRate: -1, rudder: 0.3 }));
    expect(stationary.completed).toBe(false);
    expect(sail(new FirstBuoyJourney(), 50, 14, { sheetRate: 0, rudder: 0 })).toBe(0);
  });

  it("accepts unchanged trim when the sail is already drawing", () => {
    expect(sail(new FirstBuoyJourney(), 50, 14, { sheet: 0.6, sheetRate: 0 })).toBe(1);
  });

  it.each([{ heading: Math.PI }, { rudder: 0 }])("requires demonstrated steering: %j", (overrides) => {
    expect(sail(new FirstBuoyJourney(), 50, 14, overrides)).toBe(0);
  });

  it.each([
    { forwardSpeed: 0.3 }, { forwardSpeed: FIRST_BUOY.maxArrivalSpeedMps + 0.01 },
    { driveForce: 0 }, { sailsRaised: false }, { sailDeployment: 0.6 },
    { luff: 0.3 }, { stall: 0.3 }, { yawRate: 0.12 }, { pointOfSail: "No-go zone" },
  ])("requires a controlled arrival: %j", (overrides) => {
    const journey = new FirstBuoyJourney();
    expect(sail(journey, 50, 14, overrides)).toBe(0);
    expect(journey.view(sample(14).position).instruction).toContain("approach again");
    expect(journey.update(dt, sample(14))).toBe(false);
  });

  it("latches a teleport or unsafe contact until a fresh attempt", () => {
    for (const unsafe of [false, true]) {
      const journey = new FirstBuoyJourney();
      journey.update(dt, sample(50));
      journey.update(dt, sample(unsafe ? 50 : 14, { unsafe }));
      expect(journey.failed).toBe(true);
      journey.interrupt();
      expect(journey.failed).toBe(true);
      expect(sail(journey)).toBe(0);
    }
    expect(sail(new FirstBuoyJourney())).toBe(1);
  });

  it("clears input, movement and outside-entry evidence after pause or reload", () => {
    const paused = new FirstBuoyJourney();
    expect(sail(paused, 50, 16)).toBe(0);
    paused.interrupt();
    expect(sail(paused, 16, 14)).toBe(0);
    const reloaded = new FirstBuoyJourney();
    expect(sail(reloaded, 16, 14)).toBe(0);
    expect(sail(new FirstBuoyJourney())).toBe(1);
  });

  it.each([0, -1, NaN, Infinity, 0.051])("invalid dt %s clears banked evidence", (badDt) => {
    const journey = new FirstBuoyJourney();
    sail(journey, 50, 16);
    expect(journey.update(badDt, sample(16))).toBe(false);
    expect(sail(journey, 16, 14)).toBe(0);
  });

  it.each([
    { heading: NaN }, { sheet: undefined }, { rudder: Infinity }, { forwardSpeed: undefined },
    { position: { x: NaN, y: FIRST_BUOY_COURSE.z + 16 } },
  ])("malformed observation clears banked evidence: %j", (overrides) => {
    const journey = new FirstBuoyJourney();
    sail(journey, 50, 16);
    expect(journey.update(dt, sample(16, overrides))).toBe(false);
    expect(sail(journey, 16, 14)).toBe(0);
    expect(journey.completed).toBe(false);
  });

  it("copies prior positions so caller mutation cannot conceal a jump", () => {
    const journey = new FirstBuoyJourney();
    const mutable = sample(50);
    journey.update(dt, mutable);
    mutable.position.y = FIRST_BUOY_COURSE.z + 14;
    expect(journey.update(dt, mutable)).toBe(false);
    expect(journey.failed).toBe(true);
  });
});
