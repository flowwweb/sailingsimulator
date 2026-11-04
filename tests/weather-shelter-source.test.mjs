import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/game/weather-shelter.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const weatherSource = readFileSync(new URL("../src/weather/types.ts", import.meta.url), "utf8");
const weatherJs = stripTypeScriptTypes(weatherSource, { mode: "transform" }).replace(/^export /gm, "");
const create = () => runInNewContext(`${weatherJs}\n${js}\nnew WeatherShelter({ x: 200, z: 0 })`);
const base = { dt: 1, x: 0, z: 0, speed: 2, reefed: false, reefSettled: true, attached: .8, heelRadians: .1, incident: false };

test("forecast, reefed control and actual berth are required", () => {
  const scenario = create();
  for (let i = 0; i < 12; i++) scenario.update(base);
  assert.equal(scenario.stage, "respond");
  for (let i = 0; i < 5; i++) scenario.update({ ...base, reefed: true, x: i * 2 });
  assert.equal(scenario.stage, "approach");
  for (let i = 5; i <= 99; i++) scenario.update({ ...base, reefed: true, x: i * 2 });
  assert.equal(scenario.update({ ...base, reefed: true, x: 200, dockedAt: "juniper-cove-dock" }), "complete");
});

test("unsafe or discontinuous attempts cannot earn completion", () => {
  const scenario = create();
  scenario.update(base);
  assert.equal(scenario.update({ ...base, incident: true }), "failed");
  assert.equal(scenario.update({ ...base, dockedAt: "juniper-cove-dock" }), "failed");
  const discontinuity = create();
  discontinuity.update(base);
  assert.equal(discontinuity.update({ ...base, x: 150 }), "failed");
});

test("after demonstrating a reef, sail adjustments are allowed but contact still fails", () => {
  const scenario = create();
  for (let i = 0; i < 12; i++) scenario.update(base);
  for (let i = 0; i < 5; i++) scenario.update({ ...base, reefed: true, x: i * 2 });
  assert.equal(scenario.stage, "approach");
  for (let i = 5; i <= 99; i++) scenario.update({ ...base, reefed: false, x: i * 2 });
  assert.equal(scenario.update({ ...base, reefed: false, x: 200, dockedAt: "juniper-cove-dock" }), "complete");

  const unsafe = create();
  for (let i = 0; i < 12; i++) unsafe.update(base);
  for (let i = 0; i < 5; i++) unsafe.update({ ...base, reefed: true, x: i * 2 });
  assert.equal(unsafe.update({ ...base, reefed: false, x: 10, incident: true }), "failed");
  assert.equal(unsafe.update({ ...base, x: 10, incident: false }), "failed");
});

test("poor return trim and excessive heel reduce the activity score", () => {
  const activitySource = readFileSync(new URL("../src/game/activity-session.ts", import.meta.url), "utf8");
  const activityJs = stripTypeScriptTypes(activitySource, { mode: "transform" }).replace(/^export /gm, "");
  const make = () => runInNewContext(`${activityJs}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`);
  const score = (attached, heelRadians) => {
    const session = make();
    const observation = { ...base, tackCount: 0, depth: 10 };
    for (let i = 0; i < 20; i++) session.update({ ...observation, x: i * 2, attached, heelRadians });
    return session.update({ ...observation, x: 40, attached, heelRadians, weatherShelterComplete: true }).score;
  };
  const clean = score(.8, .1);
  const poor = score(.1, Math.PI / 4);
  assert.ok(poor.trim < clean.trim);
  assert.ok(poor.control < clean.control);
  assert.ok(poor.total < clean.total);
});

test("poor trim and interrupted control do not satisfy reefed handling", () => {
  const scenario = create();
  for (let i = 0; i < 12; i++) scenario.update(base);
  for (let i = 0; i < 8; i++) scenario.update({ ...base, reefed: true, attached: .1 });
  assert.equal(scenario.stage, "respond");
  for (let i = 0; i < 8; i++) scenario.update({ ...base, reefed: true, reefSettled: false });
  assert.equal(scenario.stage, "respond");
  for (let i = 0; i < 4; i++) scenario.update({ ...base, reefed: true });
  scenario.interrupt();
  assert.equal(scenario.update({ ...base, reefed: true }), "respond");
});

test("reef must have finished raising or lowering before it is settled", () => {
  const result = runInNewContext(`${weatherJs}\n${js}\n({ raising: reefIsSettled(true, .30, .65), lowering: reefIsSettled(true, .90, .65), settled: reefIsSettled(true, .66, .65), lowered: reefIsSettled(false, .65, .65), invalid: reefIsSettled(true, NaN, .65) })`);
  assert.equal(result.raising, false);
  assert.equal(result.lowering, false);
  assert.equal(result.settled, true);
  assert.equal(result.lowered, false);
  assert.equal(result.invalid, false);
});

test("weather activity cannot complete from destination proximity alone", () => {
  const source = readFileSync(new URL("../src/game/activity-session.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(source, { mode: "transform" }).replace(/^export /gm, "");
  const activity = runInNewContext(`${js}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`);
  const observation = { ...base, x: 200, reefed: true, tackCount: 0, depth: 10, dockedAt: "juniper-cove-dock" };
  assert.equal(activity.update(observation).completed, false);
  assert.equal(activity.update({ ...observation, weatherShelterComplete: true }).completed, true);
});

test("editing one weather control preserves settings the exercise temporarily changed", () => {
  const result = runInNewContext(`${weatherJs}\n${js}\n(() => {
    const before = cloneWeatherConfig(DEFAULT_WEATHER);
    const applied = cloneWeatherConfig(before);
    applied.wind.speed = 10.5; applied.wind.directionFromDegrees = 260; applied.cloud = .55;
    const edited = cloneWeatherConfig(applied); edited.rain = .7; edited.wind.gustStrength = .4;
    return { before, result: mergeShelterWeatherEdit(before, applied, edited) };
  })()`);
  assert.equal(result.result.wind.speed, result.before.wind.speed);
  assert.equal(result.result.wind.directionFromDegrees, result.before.wind.directionFromDegrees);
  assert.equal(result.result.cloud, result.before.cloud);
  assert.equal(result.result.rain, .7);
  assert.equal(result.result.wind.gustStrength, .4);
  assert.notEqual(result.before.rain, result.result.rain);
});

test("leaving or editing the exercise restores preferences while a chosen preset stays exact", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const extract = (name) => {
    const start = main.indexOf(`function ${name}(`);
    const end = main.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start);
    return stripTypeScriptTypes(main.slice(start, end), { mode: "transform" });
  };
  const code = `${weatherJs}\n${js}\n${extract("stopWeatherShelter")}\n${extract("applyWeatherConfig")}`;
  const context = {
    simulationTime: 0, weatherShelter: {}, weatherBeforeShelter: null, weatherShelterApplied: null,
    weatherConfig: null, activitySession: { activity: { id: "weather-shelter" } }, activityView: {},
    weatherSystem: { setConfig() {}, sample() { return {}; } }, audio: { setSeed() {} },
    interruptLessonAttempt() {}, syncWeatherControls() {}, updateWeatherOutputs() {},
    saveStoredValue() {},
    elements: { status: { textContent: "" } }, crossing: undefined, dummyRecovery: undefined, firstBuoy: undefined,
  };
  runInNewContext(`${code}
    weatherBeforeShelter = cloneWeatherConfig(DEFAULT_WEATHER);
    weatherShelterApplied = cloneWeatherConfig(DEFAULT_WEATHER);
    weatherShelterApplied.wind.speed = 10.5; weatherShelterApplied.cloud = .55;
    weatherConfig = cloneWeatherConfig(weatherShelterApplied); weatherConfig.rain = .7;
    applyWeatherConfig(false);`, context);
  assert.equal(context.weatherConfig.wind.speed, 7.5);
  assert.equal(context.weatherConfig.cloud, .22);
  assert.equal(context.weatherConfig.rain, .7);
  assert.equal(context.weatherShelter, undefined);
  runInNewContext(`
    weatherShelter = {}; weatherBeforeShelter = cloneWeatherConfig(DEFAULT_WEATHER);
    weatherShelterApplied = cloneWeatherConfig(DEFAULT_WEATHER); weatherShelterApplied.wind.speed = 10.5;
    weatherConfig = cloneWeatherConfig(WEATHER_PRESETS["Fresh breeze"]);
    applyWeatherConfig(true, "preset");`, context);
  assert.equal(context.weatherConfig.wind.speed, 10.5);
  assert.equal(context.weatherConfig.cloud, .36);
  runInNewContext(`
    weatherShelter = {}; weatherBeforeShelter = cloneWeatherConfig(DEFAULT_WEATHER);
    weatherConfig.wind.speed = 10.5; stopWeatherShelter();`, context);
  assert.equal(context.weatherConfig.wind.speed, 7.5);
});
