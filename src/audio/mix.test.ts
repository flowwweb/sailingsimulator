import { describe, expect, it } from "vitest";
import {
  createInitialState,
  type SailDiagnostics,
} from "../sim/model";
import type { WeatherSnapshot } from "../weather/types";
import { computeAudioMixTargets } from "./mix";
import type { SoundscapeSnapshot } from "./zones";

const openWater: SoundscapeSnapshot = {
  openWater: 1,
  shore: 0.05,
  songbirds: 0.05,
  waterbirds: 0.18,
  shelter: 0,
  dock: 0,
};

const shelteredCove: SoundscapeSnapshot = {
  openWater: 0.24,
  shore: 1,
  songbirds: 0.82,
  waterbirds: 0.28,
  shelter: 0.9,
  dock: 0.74,
};

describe("audio mix targets", () => {
  it("keeps the boat quiet when it is not moving", () => {
    const mix = computeAudioMixTargets(
      weather(),
      createInitialState(),
      sail(),
      openWater,
    );

    expect(mix.hull).toBe(0);
    expect(mix.luff).toBe(0);
    expect(mix.stall).toBe(0);
  });

  it("uses apparent wind and shelter to calm the wind bus", () => {
    const exposed = computeAudioMixTargets(
      weather(),
      createInitialState(),
      sail({ apparentWindSpeed: 9 }),
      openWater,
    );
    const sheltered = computeAudioMixTargets(
      weather(),
      createInitialState(),
      sail({ apparentWindSpeed: 9 }),
      shelteredCove,
    );

    expect(exposed.wind).toBeGreaterThan(sheltered.wind);
    expect(sheltered.wind).toBeLessThan(exposed.wind * 0.6);
  });

  it("gates and caps luff instead of running a loud continuous layer", () => {
    const lowWind = computeAudioMixTargets(
      weather(),
      createInitialState(),
      sail({ apparentWindSpeed: 1.4, luff: 1, attached: 0 }),
      openWater,
    );
    const windy = computeAudioMixTargets(
      weather({ time: 2.4 }),
      createInitialState(),
      sail({ apparentWindSpeed: 11, luff: 1, attached: 0 }),
      openWater,
    );

    expect(lowWind.luff).toBe(0);
    expect(windy.luff).toBeGreaterThan(0);
    expect(windy.luff).toBeLessThanOrEqual(0.034);
  });

  it("raises gentle hull and event motion with boat and wave movement", () => {
    const stillState = createInitialState();
    const movingState = {
      ...stillState,
      velocity: { x: 2.2, y: 0.4 },
      heel: 0.16,
      heaveVelocity: 0.24,
      wavePitchVelocity: 0.18,
      waveRollVelocity: 0.2,
    };
    const still = computeAudioMixTargets(
      weather(),
      stillState,
      sail(),
      openWater,
    );
    const moving = computeAudioMixTargets(
      weather(),
      movingState,
      sail({ force: { x: 1_200, y: 800 } }),
      openWater,
    );

    expect(moving.hull).toBeGreaterThan(still.hull);
    expect(moving.boatMotion).toBeGreaterThan(0.5);
  });

  it("suppresses wildlife during rain", () => {
    const dry = computeAudioMixTargets(
      weather(),
      createInitialState(),
      sail(),
      shelteredCove,
    );
    const wet = computeAudioMixTargets(
      weather({ rain: 1 }),
      createInitialState(),
      sail(),
      shelteredCove,
    );

    expect(dry.birdActivity).toBeGreaterThan(wet.birdActivity * 4);
    expect(wet.rain).toBeGreaterThan(0);
  });
});

function weather(
  overrides: Partial<WeatherSnapshot> = {},
): WeatherSnapshot {
  return {
    time: 0,
    timeOfDay: 10,
    windSpeed: 7.5,
    windDirectionFromDegrees: 90,
    trueWind: { x: -7.5, y: 0 },
    gust: 0,
    rain: 0,
    cloud: 0.2,
    visibility: 1,
    waves: [],
    ...overrides,
  };
}

function sail(
  overrides: Partial<SailDiagnostics> = {},
): SailDiagnostics {
  return {
    apparentWind: { x: -7.5, y: 0 },
    apparentWindSpeed: 7.5,
    apparentWindAngle: Math.PI / 2,
    boomAngle: -0.7,
    desiredBoomAngle: -0.7,
    idealBoomAngle: 0.7,
    angleOfAttack: 0.2,
    liftCoefficient: 1,
    dragCoefficient: 0.1,
    luff: 0,
    attached: 1,
    stall: 0,
    force: { x: 0, y: 0 },
    driveForce: 0,
    sideForce: 0,
    ...overrides,
  };
}
