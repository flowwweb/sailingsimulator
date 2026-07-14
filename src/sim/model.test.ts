import { describe, expect, it } from "vitest";
import {
  computeSailAerodynamics,
  createInitialState,
  degrees,
  sheetForBoomAngle,
  stepBoat,
  type Environment,
} from "./model";

const beamReach: Environment = { trueWind: { x: -8, y: 0 } };

describe("sailing physics teaching contracts", () => {
  it("uses boat velocity when calculating apparent wind", () => {
    const state = createInitialState();
    const stationary = computeSailAerodynamics(state, beamReach);
    state.velocity = { x: -3, y: 0 };
    const movingWithAir = computeSailAerodynamics(state, beamReach);

    expect(stationary.apparentWindSpeed).toBeCloseTo(8, 6);
    expect(movingWithAir.apparentWindSpeed).toBeCloseTo(5, 6);
  });

  it("makes an over-eased sail luff and lose drive", () => {
    const state = createInitialState();
    const target = computeSailAerodynamics(state, beamReach).idealBoomAngle;
    state.sheet = sheetForBoomAngle(target);
    const attached = computeSailAerodynamics(state, beamReach);
    state.sheet = 1;
    const luffing = computeSailAerodynamics(state, beamReach);

    expect(attached.attached).toBeGreaterThan(0.9);
    expect(luffing.luff).toBeGreaterThan(0.9);
    expect(attached.driveForce).toBeGreaterThan(luffing.driveForce);
  });

  it("distinguishes an over-sheeted stall from luffing", () => {
    const state = createInitialState();
    state.sheet = 0;
    const stalled = computeSailAerodynamics(state, beamReach);

    expect(stalled.stall).toBeGreaterThan(0.8);
    expect(stalled.luff).toBeLessThan(0.2);
  });

  it("removes useful lift in the no-go zone", () => {
    const state = createInitialState();
    state.sheet = 0;
    const headwind = computeSailAerodynamics(state, {
      trueWind: { x: 0, y: -8 },
    });

    expect(Math.abs(headwind.apparentWindAngle)).toBeLessThan(degrees(1));
    expect(headwind.luff).toBeGreaterThan(0.99);
    expect(headwind.liftCoefficient).toBeLessThan(0.01);
    expect(headwind.driveForce).toBeLessThanOrEqual(0);
  });

  it("keeps a long deterministic run finite", () => {
    let state = createInitialState();
    for (let index = 0; index < 60 * 120; index += 1) {
      state = stepBoat(
        state,
        {
          rudder: Math.sin(index * 0.013) * 0.45,
          sheetRate: Math.cos(index * 0.007) * 0.4,
        },
        beamReach,
        1 / 60,
      ).state;
    }

    expect(Object.values(state).flatMap((value) =>
      typeof value === "object" ? Object.values(value) : [value],
    ).every(Number.isFinite)).toBe(true);
  });
});
