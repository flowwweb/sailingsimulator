import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER,
  SEA_STATE_PRESETS,
  cloneWeatherConfig,
} from "./types";
import { WeatherSystem } from "./weather";
import { sampleBoatWavePose } from "../game/wave-pose";
import { HARBOR_20 } from "../sim/boats";
import { advanceBoatWavePose, createInitialState, stepBoat } from "../sim/model";
import {
  buildWaveComponents,
  sampleWaves,
  significantWaveHeight,
  waveShaderArrays,
} from "./waves";

describe("deterministic weather and analytic waves", () => {
  it("keeps waves continuous across the recorded 10.375 m/s gust boundary", () => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.wind.speed = 10;
    config.wind.directionFromDegrees = 270;
    const system = new WeatherSystem(config);
    const time = 1370.6333333333334;
    const dt = 1 / 60;
    const before = system.sample(time - dt);
    const after = system.sample(time);
    expect(before.windSpeed).toBeLessThan(10.375);
    expect(after.windSpeed).toBeGreaterThan(10.375);
    expect(after.waves).toEqual(before.waves);
    const maximumVerticalSpeed = before.waves.reduce((sum, wave) =>
      sum + wave.angularFrequency * (wave.amplitude + wave.steepness *
        (2 * Math.PI / wave.wavelength) * wave.amplitude ** 2), 0);
    for (const [x, z] of [[1208.4566058417495, -366.86049384596345], [0, 0], [-3200, 4500]]) {
      for (const t of [time, 100_000, 1_000_000]) {
        const first = system.sample(t - dt);
        const second = system.sample(t);
        const delta = sampleWaves(second.waves, x!, z!, second.time).height -
          sampleWaves(first.waves, x!, z!, first.time).height;
        expect(Math.abs(delta)).toBeLessThanOrEqual(maximumVerticalSpeed * dt + 1e-8);
      }
    }
    let grounded = createInitialState();
    grounded.position = { x: 1208.4566058417495, y: -366.86049384596345 };
    grounded.heading = 1.7783863568455152;
    const fixedPosition = { ...grounded.position };
    for (let index = -120; index <= 120; index++) {
      const weather = system.sample(time + index * dt);
      const target = sampleBoatWavePose(grounded, weather.waves, weather.time);
      const response = advanceBoatWavePose(grounded, target, HARBOR_20, dt);
      const sailing = stepBoat(grounded, { rudder: 0, sheetRate: 0 },
        { trueWind: weather.trueWind, boat: HARBOR_20, wavePose: target }, dt).state;
      for (const field of Object.keys(response) as (keyof typeof response)[]) {
        expect(sailing[field]).toBe(response[field]);
      }
      grounded = { ...grounded, ...response };
      expect(grounded.position).toEqual(fixedPosition);
      expect(grounded.heading).toBe(1.7783863568455152);
    }
  });

  it.each(["manual", "evolving"] as const)("keeps %s wind changing while seas remain independent of sample order", (mode) => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.mode = mode;
    config.timeScale = 2;
    const system = new WeatherSystem(config);
    const initial = system.sample(0);
    const later = system.sample(73);
    expect(later.trueWind).not.toEqual(initial.trueWind);
    expect(later.gust).not.toBe(initial.gust);
    if (mode === "evolving") expect(later.windDirectionFromDegrees).not.toBe(initial.windDirectionFromDegrees);
    expect(later.time).toBe(146);
    for (const time of [1_000_000, 83.25, 0, 73]) {
      const snapshot = system.sample(time);
      expect(snapshot.waves).toEqual(initial.waves);
      expect(snapshot).toEqual(new WeatherSystem(config).sample(time));
      expect(waveShaderArrays(snapshot.waves)).toEqual(waveShaderArrays(initial.waves));
    }
  });

  it("updates linked seas when configured wind or seed changes", () => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.wind.speed = 3;
    const system = new WeatherSystem(config);
    const calm = system.sample(500).waves;
    config.wind.speed = 11;
    system.setConfig(config);
    const strong = system.sample(500).waves;
    expect(significantWaveHeight(strong)).toBeGreaterThan(significantWaveHeight(calm));
    config.wind.directionFromDegrees += 90;
    system.setConfig(config);
    const turned = system.sample(500).waves;
    expect(turned[0]!.directionX).toBeCloseTo(strong[0]!.directionZ, 12);
    expect(turned[0]!.directionZ).toBeCloseTo(-strong[0]!.directionX, 12);
    config.seed += 1;
    system.setConfig(config);
    expect(system.sample(500).waves).not.toEqual(turned);
    expect(system.sample(500)).toEqual(new WeatherSystem(config).sample(500));
  });

  it("keeps manual sea settings independent of wind and applies settings and seed edits", () => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.waves.mode = "manual";
    const system = new WeatherSystem(config);
    const initial = system.sample(200).waves;
    config.wind.speed = 18;
    config.wind.directionFromDegrees = 270;
    system.setConfig(config);
    expect(system.sample(400).waves).toEqual(initial);
    config.waves.height = 1.8;
    config.waves.length = 45;
    config.waves.directionFromDegrees = 225;
    system.setConfig(config);
    const edited = system.sample(400).waves;
    expect(significantWaveHeight(edited)).toBeCloseTo(1.8, 6);
    expect(edited[0]!.wavelength).not.toBe(initial[0]!.wavelength);
    expect(edited[0]!.directionX).not.toBe(initial[0]!.directionX);
    config.seed += 1;
    system.setConfig(config);
    expect(system.sample(400).waves).not.toEqual(edited);
  });

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

  it("produces a deterministic semidiurnal tide with rising and falling states", () => {
    const config = cloneWeatherConfig(DEFAULT_WEATHER);
    config.tide.range = 2;
    config.tide.periodHours = 12;
    config.tide.phaseHours = 0;
    const system = new WeatherSystem(config);

    expect(system.sample(0).tideLevel).toBeCloseTo(0);
    expect(system.sample(0).tideTrend).toBe("rising");
    expect(system.sample(1_800).tideLevel).toBeCloseTo(1);
    expect(system.sample(3_600).tideLevel).toBeCloseTo(0);
    expect(system.sample(3_600).tideTrend).toBe("falling");
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

  it("builds an irregular directional spectrum instead of a uniform wave train", () => {
    const waves = buildWaveComponents(DEFAULT_WEATHER.waves, 8, 90, 17);
    const wavelengths = waves.map((wave) => wave.wavelength);
    const directionAngles = waves.map((wave) =>
      Math.atan2(wave.directionX, wave.directionZ),
    );

    expect(wavelengths.some((value, index) =>
      index > 0 && value > wavelengths[index - 1]!,
    )).toBe(true);
    expect(Math.max(...directionAngles) - Math.min(...directionAngles))
      .toBeGreaterThan(Math.PI / 4);
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
