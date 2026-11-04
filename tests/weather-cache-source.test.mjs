import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

test("wave cache is stable across samples and invalidates on configuration changes", () => {
  const source = readFileSync(new URL("../src/weather/weather.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(source, { mode: "strip" })
    .replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, "");
  let builds = 0;
  const context = { createRandom: () => () => 0.5, createNoise2D: () => () => 0,
    cloneWeatherConfig: (config) => structuredClone(config),
    buildWaveComponents: (waves, speed, direction, seed) => { builds++; return [{ waves, speed, direction, seed }]; } };
  const WeatherSystem = runInNewContext(`${js}\nWeatherSystem`, context);
  const config = { timeScale: 1, timeOfDay: 12, mode: "manual", seed: 1,
    tide: { range: 0, periodHours: 12, phaseHours: 0 },
    wind: { speed: 6, directionFromDegrees: 90, gustStrength: 0, gustScale: 1 },
    waves: { mode: "manual", height: 0.3, length: 20, steepness: 0.2, directionFromDegrees: 90 },
    rain: 0, cloud: 0, visibility: 1 };
  const system = new WeatherSystem(config);
  const initial = system.sample(0).waves;
  for (let i = 1; i <= 300; i++) assert.equal(system.sample(i / 60).waves, initial);
  assert.equal(builds, 1);
  config.wind.speed = 9;
  assert.equal(system.sample(6).waves, initial);
  system.getConfig().waves.height = 4;
  assert.equal(system.sample(7).waves, initial);
  system.setConfig(config);
  const updated = system.sample(8).waves;
  assert.notEqual(updated, initial);
  assert.equal(updated[0].speed, 9);
  assert.equal(builds, 2);
  assert.equal(system.sample(9).waves, updated);
});

test("fixed weather skips unused noise without changing sampled wind", () => {
  const source = readFileSync(new URL("../src/weather/weather.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(source, { mode: "strip" })
    .replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, "");
  let calls = 0;
  const noise = (x, y) => Math.sin(x + y);
  const context = { createRandom: () => () => 0.5,
    createNoise2D: () => (x, y) => { calls++; return noise(x, y); },
    cloneWeatherConfig: (config) => structuredClone(config), buildWaveComponents: () => [] };
  const WeatherSystem = runInNewContext(`${js}\nWeatherSystem`, context);
  const config = { timeScale: 1, timeOfDay: 12, mode: "manual", seed: 1,
    tide: { range: 0, periodHours: 12, phaseHours: 0 },
    wind: { speed: 6, directionFromDegrees: 90, gustStrength: 0, gustScale: 1 },
    waves: {}, rain: 0, cloud: 0, visibility: 1 };
  const system = new WeatherSystem(config);
  const fixed = system.sample(10);
  assert.equal(calls, 0);
  assert.equal(fixed.windSpeed, 6);
  assert.equal(fixed.windDirectionFromDegrees, 90);
  config.wind.gustStrength = 0.2;
  system.setConfig(config);
  const gusty = system.sample(10);
  assert.equal(calls, 2);
  assert.equal(gusty.gust, (noise(10 * .08, 31.7) * .65 + noise(10 * .23, -12.2) * .35) * .2);
  config.mode = "evolving";
  system.setConfig(config);
  const evolving = system.sample(10);
  assert.equal(calls, 7);
  assert.equal(evolving.windDirectionFromDegrees, ((90 + noise(.12, 17.1) * 13) % 360 + 360) % 360);
});
