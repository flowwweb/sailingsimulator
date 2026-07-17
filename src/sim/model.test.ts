import { describe, expect, it } from "vitest";
import {
  computeHeadsailAerodynamics,
  computeSailAerodynamics,
  createInitialState,
  degrees,
  sheetForBoomAngle,
  stepBoat,
  type Environment,
} from "./model";
import { COASTAL_28, HARBOR_20, LAKE_34 } from "./boats";

const beamReach: Environment = { trueWind: { x: -8, y: 0 } };

function settledAtSheet(sheet: number) {
  let state = createInitialState();
  state.sheet = sheet;
  for (let index = 0; index < 180; index += 1) {
    state = stepBoat(state, { rudder: 0, sheetRate: 0 }, beamReach, 1 / 60).state;
  }
  return state;
}

describe("sailing physics teaching contracts", () => {
  it("lets the teaching dinghy build useful beam-reach speed", () => {
    const run = (boat = HARBOR_20) => {
      let state = createInitialState();
      state.sheet = 0.52;
      state.boomAngle = -degrees(47);
      for (let index = 0; index < 60 * 30; index += 1) {
        state = stepBoat(
          state,
          { rudder: 0, sheetRate: 0 },
          { ...beamReach, boat },
          1 / 60,
        ).state;
      }
      return Math.hypot(state.velocity.x, state.velocity.y);
    };
    const previousHullTune = {
      ...HARBOR_20,
      hull: {
        ...HARBOR_20.hull,
        longitudinalDragLinear: 55,
        longitudinalDragQuadratic: 26,
      },
    };

    expect(run()).toBeGreaterThan(run(previousHullTune));
  });

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
    state.boomAngle = -target;
    const attached = computeSailAerodynamics(state, beamReach);
    state.sheet = 1;
    state.boomAngle = -degrees(82);
    const luffing = computeSailAerodynamics(state, beamReach);

    expect(attached.attached).toBeGreaterThan(0.86);
    expect(luffing.luff).toBeGreaterThan(0.85);
    expect(attached.driveForce).toBeGreaterThan(luffing.driveForce);
  });

  it("distinguishes an over-sheeted stall from luffing", () => {
    const stalled = computeSailAerodynamics(settledAtSheet(0), beamReach);

    expect(stalled.stall).toBeGreaterThan(0.8);
    expect(stalled.luff).toBeLessThan(0.2);
  });

  it("removes useful lift in the no-go zone", () => {
    const state = createInitialState();
    state.sheet = 0;
    state.boomAngle = -degrees(5);
    const headwind = computeSailAerodynamics(state, {
      trueWind: { x: 0, y: -8 },
    });

    expect(Math.abs(headwind.apparentWindAngle)).toBeLessThan(degrees(1));
    expect(headwind.luff).toBeGreaterThan(0.99);
    expect(headwind.liftCoefficient).toBeLessThan(0.01);
    expect(headwind.driveForce).toBeLessThanOrEqual(0);
  });

  it("moves the boom to leeward and counts one completed side crossing", () => {
    let state = createInitialState();
    state.velocity = { x: 0, y: 3 };
    const windFromPort: Environment = { trueWind: { x: 8, y: 0 } };
    for (let index = 0; index < 240; index += 1) {
      state = stepBoat(state, { rudder: 0, sheetRate: 0 }, windFromPort, 1 / 60).state;
    }

    expect(state.boomAngle).toBeGreaterThan(degrees(20));
    expect(state.sailSide).toBe(1);
    expect(state.tackCount).toBe(1);
    expect(state.gybeCount).toBe(0);
    expect(state.lastManeuver).toBe("tack");
  });

  it("reduces aerodynamic area when reefed and removes it when sails are lowered", () => {
    const fullState = createInitialState();
    const target = computeSailAerodynamics(fullState, beamReach).idealBoomAngle;
    fullState.sheet = sheetForBoomAngle(target);
    fullState.boomAngle = -target;
    const full = computeSailAerodynamics(fullState, beamReach);

    const reefedState = {
      ...fullState,
      reefLevel: 1 as const,
      sailDeployment: 0.64,
    };
    const reefed = computeSailAerodynamics(reefedState, beamReach);
    const lowered = computeSailAerodynamics(
      {
        ...fullState,
        sailsRaised: false,
        sailDeployment: 0,
      },
      beamReach,
    );

    expect(reefed.effectiveArea / full.effectiveArea).toBeCloseTo(0.64, 6);
    expect(reefed.driveForce / full.driveForce).toBeCloseTo(0.64, 6);
    expect(lowered.effectiveArea).toBe(0);
    expect(lowered.driveForce).toBeCloseTo(0, 8);
    expect(lowered.sideForce).toBeCloseTo(0, 8);
    expect(lowered.luff).toBe(0);
    expect(lowered.attached).toBe(0);
  });

  it("transitions smoothly between full, reefed, lowered, and hoisted sail", () => {
    let state = createInitialState();
    state.reefLevel = 1;
    const firstReefStep = stepBoat(
      state,
      { rudder: 0, sheetRate: 0 },
      beamReach,
      1 / 60,
    ).state;
    expect(firstReefStep.sailDeployment).toBeLessThan(1);
    expect(firstReefStep.sailDeployment).toBeGreaterThan(0.64);
    state = firstReefStep;
    for (let index = 0; index < 120; index += 1) {
      state = stepBoat(state, { rudder: 0, sheetRate: 0 }, beamReach, 1 / 60).state;
    }
    expect(state.sailDeployment).toBeCloseTo(0.64, 6);

    state.sailsRaised = false;
    for (let index = 0; index < 90; index += 1) {
      state = stepBoat(state, { rudder: 0, sheetRate: 0 }, beamReach, 1 / 60).state;
    }
    expect(state.sailDeployment).toBeCloseTo(0, 6);

    state.sailsRaised = true;
    state.reefLevel = 0;
    for (let index = 0; index < 210; index += 1) {
      state = stepBoat(state, { rudder: 0, sheetRate: 0 }, beamReach, 1 / 60).state;
    }
    expect(state.sailDeployment).toBeCloseTo(1, 6);
  });

  it("classifies a boom crossing with wind astern as a gybe", () => {
    let state = createInitialState();
    state.sheet = 1;
    state.sailSide = 1;
    state.boomAngle = degrees(82);
    const almostDeadRun: Environment = {
      trueWind: { x: -1.389, y: 7.878 },
    };

    for (let index = 0; index < 180 && state.gybeCount === 0; index += 1) {
      state = stepBoat(
        state,
        { rudder: 0, sheetRate: 0 },
        almostDeadRun,
        1 / 60,
      ).state;
    }

    expect(state.sailSide).toBe(-1);
    expect(state.gybeCount).toBe(1);
    expect(state.tackCount).toBe(0);
    expect(state.lastManeuver).toBe("gybe");
    expect(state.maneuverCount).toBe(1);
  });

  it("gives the rudder no meaningful authority while stopped", () => {
    const state = createInitialState();
    const result = stepBoat(
      state,
      { rudder: 1, sheetRate: 0 },
      { trueWind: { x: 0, y: 0 } },
      1 / 60,
    );

    expect(result.hydro.rudderSideForce).toBeCloseTo(0, 8);
    expect(result.hydro.ironsRecoveryTorque).toBeCloseTo(0, 8);
    expect(result.state.yawRate).toBeCloseTo(0, 8);
  });

  it("backs out of irons in either direction when the player holds a recovery turn", () => {
    const headwind: Environment = { trueWind: { x: 0, y: -8 } };
    for (const rudder of [-1, 1]) {
      let state = createInitialState();
      let peakRecoveryTorque = 0;
      state.sheet = 1;
      state.boomAngle = -degrees(85);

      for (let index = 0; index < 60 * 8; index += 1) {
        const result = stepBoat(state, { rudder, sheetRate: 0 }, headwind, 1 / 60);
        peakRecoveryTorque = Math.max(
          peakRecoveryTorque,
          Math.abs(result.hydro.ironsRecoveryTorque),
        );
        state = result.state;
      }

      const recovered = computeSailAerodynamics(state, headwind);
      expect(peakRecoveryTorque).toBeGreaterThan(0);
      expect(Math.abs(recovered.apparentWindAngle)).toBeGreaterThan(degrees(42));
    }
  });

  it("does not stick at either edge of the no-go zone", () => {
    const headwind: Environment = { trueWind: { x: 0, y: -8 } };
    for (const side of [-1, 1]) {
      let state = createInitialState();
      state.heading = side * degrees(40);
      state.velocity = { x: 0, y: 0 };
      state.sheet = 0.86;

      for (let index = 0; index < 60 * 7; index += 1) {
        state = stepBoat(
          state,
          { rudder: side, sheetRate: 0 },
          headwind,
          1 / 60,
        ).state;
      }

      const windAngle = Math.abs(
        computeSailAerodynamics(state, headwind).apparentWindAngle,
      );
      expect(windAngle).toBeGreaterThan(degrees(52));
    }
  });

  it("falls off a 33 degree no-go equilibrium with centered helm", () => {
    const headwind: Environment = { trueWind: { x: 0, y: -8 } };
    for (const side of [-1, 1]) {
      let state = createInitialState();
      state.heading = side * degrees(33);
      state.velocity = {
        x: Math.sin(state.heading) * 0.28,
        y: Math.cos(state.heading) * 0.28,
      };
      state.sheet = 0.86;

      for (let index = 0; index < 60 * 9; index += 1) {
        state = stepBoat(
          state,
          { rudder: 0, sheetRate: 0 },
          headwind,
          1 / 60,
        ).state;
      }

      expect(Math.abs(
        computeSailAerodynamics(state, headwind).apparentWindAngle,
      )).toBeGreaterThan(degrees(45));
    }
  });

  it("responds smoothly to wave pose targets", () => {
    let state = createInitialState();
    for (let index = 0; index < 240; index += 1) {
      state = stepBoat(
        state,
        { rudder: 0, sheetRate: 0 },
        { trueWind: { x: 0, y: 0 }, wavePose: { heave: 0.4, pitch: 0.08, roll: -0.1 } },
        1 / 60,
      ).state;
    }

    expect(state.heave).toBeCloseTo(0.4, 2);
    expect(state.wavePitch).toBeCloseTo(0.08, 2);
    expect(state.waveRoll).toBeCloseTo(-0.1, 2);
  });

  it("uses boat definitions for mass, handling, and optional headsail force", () => {
    const state = createInitialState();
    state.sheet = 0.52;
    state.boomAngle = -degrees(47);
    state.headsailSheet = 0.52;
    state.headsailAngle = -degrees(47);
    const trainerEnvironment = { ...beamReach, boat: HARBOR_20 };
    const coastalEnvironment = { ...beamReach, boat: COASTAL_28 };
    const cruiserEnvironment = { ...beamReach, boat: LAKE_34 };

    expect(
      computeHeadsailAerodynamics(state, trainerEnvironment),
    ).toBeUndefined();
    expect(
      computeHeadsailAerodynamics(state, coastalEnvironment)?.driveForce,
    ).toBeGreaterThan(0);

    const trainerStep = stepBoat(
      state,
      { rudder: 0, sheetRate: 0 },
      trainerEnvironment,
      1 / 60,
    );
    const cruiserStep = stepBoat(
      state,
      { rudder: 0, sheetRate: 0 },
      cruiserEnvironment,
      1 / 60,
    );
    expect(Math.hypot(
      trainerStep.state.velocity.x,
      trainerStep.state.velocity.y,
    )).toBeGreaterThan(Math.hypot(
      cruiserStep.state.velocity.x,
      cruiserStep.state.velocity.y,
    ));
  });

  it("keeps a long deterministic run finite and repeatable", () => {
    const run = () => {
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
      return state;
    };
    const first = run();
    const second = run();

    expect(first).toEqual(second);
    expect(Object.values(first).flatMap((value) =>
      typeof value === "object"
        ? Object.values(value)
        : typeof value === "number"
          ? [value]
          : [],
    ).every(Number.isFinite)).toBe(true);
  });

  it("gives longer heavier monohulls a slower wave response", () => {
    const target = {
      heave: 1.1,
      pitch: 0.16,
      roll: -0.2,
      heaveVelocity: 0.4,
      pitchVelocity: 0.03,
      rollVelocity: -0.04,
    };
    const controls = { rudder: 0, sheetRate: 0 };
    const trainer = stepBoat(
      createInitialState(),
      controls,
      {
        trueWind: { x: 0, y: 0 },
        wavePose: target,
        boat: HARBOR_20,
      },
      1 / 60,
    ).state;
    const cruiser = stepBoat(
      createInitialState(),
      controls,
      {
        trueWind: { x: 0, y: 0 },
        wavePose: target,
        boat: LAKE_34,
      },
      1 / 60,
    ).state;

    expect(trainer.heave).toBeGreaterThan(cruiser.heave);
    expect(Math.abs(trainer.wavePitch)).toBeGreaterThan(
      Math.abs(cruiser.wavePitch),
    );
    expect(Math.abs(trainer.waveRoll)).toBeGreaterThan(
      Math.abs(cruiser.waveRoll),
    );
  });
});
