import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER,
  SEA_STATE_PRESETS,
  cloneWeatherConfig,
} from "./types";
import { WeatherSystem } from "./weather";
import {
  buildWaveComponents,
  sampleWaves,
  significantWaveHeight,
  waveShaderArrays,
} from "./waves";

describe("deterministic weather and analytic waves", () => {
  it("replays the same weather from the same seed and time", () => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.mode = "evolving";
    const first = new WeatherSystem(config).sample(83.25);
    const second = new WeatherSystem(config).sample(83.25);

    expect(first).toEqual(second);
  });

  it("uses nautical wind-from direction for the world wind vector", () => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.wind.gustStrength = 0;
    config.wind.directionFromDegrees = 90;
    const snapshot = new WeatherSystem(config).sample(0);

    expect(snapshot.trueWind.x).toBeCloseTo(-config.wind.speed, 6);
    expect(snapshot.trueWind.y).toBeCloseTo(0, 6);
  });

  it("keeps world-space wave phase independent of render-grid recentering", () => {
    const waves = buildWaveComponents(DEFAULT_WEATHER.waves, 8, 90, 42);
    const first = sampleWaves(waves, 123.5, -88.25, 14);
    const second = sampleWaves(waves, 123.5, -88.25, 14);

    expect(first).toEqual(second);
    expect(Object.values(first).every(Number.isFinite)).toBe(true);
  });

  it("links stronger wind to taller waves without changing component count", () => {
    const calm = buildWaveComponents(DEFAULT_WEATHER.waves, 3, 90, 7);
    const fresh = buildWaveComponents(DEFAULT_WEATHER.waves, 11, 90, 7);
    const totalAmplitude = (waves: typeof calm) =>
      waves.reduce((total, wave) => total + wave.amplitude, 0);

    expect(calm).toHaveLength(6);
    expect(fresh).toHaveLength(6);
    expect(totalAmplitude(fresh)).toBeGreaterThan(totalAmplitude(calm));
  });

  it("honors manual significant wave height across named sea states", () => {
    for (const preset of SEA_STATE_PRESETS) {
      const waves = buildWaveComponents(
        {
          mode: "manual",
          height: preset.height,
          length: preset.length,
          steepness: preset.steepness,
          directionFromDegrees: 225,
        },
        8,
        90,
        2_024,
      );
      expect(significantWaveHeight(waves)).toBeCloseTo(
        preset.height,
        6,
      );
    }
  });

  it("keeps CPU and shader spectra aligned for all six components", () => {
    const waves = buildWaveComponents(
      {
        mode: "manual",
        height: 2.2,
        length: 52,
        steepness: 0.48,
        directionFromDegrees: 315,
      },
      11,
      90,
      91,
    );
    const arrays = waveShaderArrays(waves);

    expect(arrays.amplitudes).toHaveLength(6);
    expect(arrays.directions).toHaveLength(12);
    waves.forEach((wave, index) => {
      expect(arrays.amplitudes[index]).toBeCloseTo(
        wave.amplitude,
        6,
      );
      expect(arrays.steepnesses[index]).toBeCloseTo(
        wave.steepness,
        6,
      );
    });
  });

  it("produces materially stronger surface motion in rough water", () => {
    const build = (
      height: number,
      length: number,
      steepness: number,
    ) =>
      buildWaveComponents(
        {
          mode: "manual",
          height,
          length,
          steepness,
          directionFromDegrees: 270,
        },
        10,
        90,
        44,
      );
    const motionEnergy = (
      waves: ReturnType<typeof build>,
    ) => {
      let heightEnergy = 0;
      let velocityEnergy = 0;
      for (let index = 0; index < 80; index += 1) {
        const sample = sampleWaves(
          waves,
          18 + index * 1.7,
          -9 + index * 0.63,
          1.2 + index * 0.21,
        );
        heightEnergy += sample.height * sample.height;
        velocityEnergy +=
          sample.verticalVelocity * sample.verticalVelocity;
      }
      return {
        height: Math.sqrt(heightEnergy / 80),
        velocity: Math.sqrt(velocityEnergy / 80),
      };
    };
    const light = motionEnergy(build(0.28, 13, 0.2));
    const rough = motionEnergy(build(2.2, 52, 0.48));

    expect(rough.height).toBeGreaterThan(light.height * 3);
    expect(rough.velocity).toBeGreaterThan(light.velocity * 1.5);
  });
});
