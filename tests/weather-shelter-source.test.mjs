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
const SHELTER_DEPARTURE_DISTANCE = runInNewContext(`${weatherJs}\n${js}\nSHELTER_DEPARTURE_DISTANCE`);
const activityScript = () => stripTypeScriptTypes(readFileSync(new URL("../src/game/activity-session.ts", import.meta.url), "utf8"), { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
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

test("exercise progress follows witnessed stages and resets after failure and retry", () => {
  const scenario = create();
  const session = runInNewContext(`${activityScript()}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`, { SHELTER_DEPARTURE_DISTANCE });
  const update = (o) => {
    scenario.update(o);
    return session.update({ ...o, heading: 0, tackCount: 0, depth: 10,
      weatherShelterProgress: scenario.progress, weatherShelterComplete: scenario.stage === "complete" });
  };
  assert.equal(update({ ...base, x: 200 }).progress, 0);
  for (let x = 198; x >= 50; x -= 2) update({ ...base, x });
  assert.equal(scenario.stage, "forecast");
  assert.equal(update({ ...base, x: 50 }).progress, .25);
  for (let i = 0; i < 10; i++) update({ ...base, x: 50 });
  assert.equal(scenario.stage, "respond");
  assert.equal(update({ ...base, reefed: true, x: 50 }).progress, .5);
  for (let i = 0; i < 4; i++) update({ ...base, reefed: true, x: 50 });
  assert.equal(scenario.stage, "approach");
  assert.equal(update({ ...base, reefed: true, x: 50 }).progress, .75);
  for (let x = 52; x <= 198; x += 2) update({ ...base, reefed: true, x });
  assert.equal(update({ ...base, reefed: true, x: 200, dockedAt: "juniper-cove-dock" }).progress, 1);
  const failed = create();
  failed.update({ ...base, incident: true });
  assert.equal(failed.stage, "failed");
  assert.equal(failed.progress, 0);
  const retry = create();
  const retrySession = runInNewContext(`${activityScript()}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`, { SHELTER_DEPARTURE_DISTANCE });
  assert.equal(retrySession.update({ ...base, heading: 0, tackCount: 0, depth: 10, weatherShelterProgress: failed.progress }).progress, 0);
  assert.equal(retrySession.update({ ...base, heading: 0, tackCount: 0, depth: 10, weatherShelterProgress: retry.progress }).progress, 0);
});

test("weather route efficiency accounts for departure from the berth or an offshore start", () => {
  const run = (positions) => {
    const session = runInNewContext(`${activityScript()}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 0, z: 0 })`, { SHELTER_DEPARTURE_DISTANCE });
    for (const x of positions) session.update({ ...base, x, heading: 0, tackCount: 0, depth: 10 });
    return session.update({ ...base, x: 0, heading: 0, tackCount: 0, depth: 10, weatherShelterComplete: true }).score.efficiency;
  };
  assert.equal(run([0, 150, 0]), 100);
  assert.equal(run([200, 0]), 100);
  assert.equal(run([0, 150, 0, 150, 0]), 50);
  assert.equal(run([200, 400, 0]), 33);
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
  const make = () => runInNewContext(`${activityScript()}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`, { SHELTER_DEPARTURE_DISTANCE });
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
  const activity = runInNewContext(`${activityScript()}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`, { SHELTER_DEPARTURE_DISTANCE });
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

test("resetting the boat exits the exercise and restores the player's weather", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const extract = (name) => {
    const start = main.indexOf(`function ${name}(`);
    const end = main.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start);
    return stripTypeScriptTypes(main.slice(start, end), { mode: "transform" });
  };
  const before = { wind: { speed: 5 } };
  const context = { weatherShelter: {}, weatherShelterApplied: {}, weatherBeforeShelter: before,
    weatherConfig: { wind: { speed: 10.5 } }, weather: {}, simulationTime: 1,
    activitySession: { activity: { id: "weather-shelter" } }, activityView: {},
    crossing: undefined, dummyRecovery: undefined, firstBuoy: undefined, started: true,
    academy: { view: () => ({ stage: "free-sail" }) }, interruptLessonAttempt() {},
    weatherSystem: { setConfig() {}, sample() { return { trueWind: {} }; } }, syncWeatherControls() {},
    createGameState: () => ({}), computeSailAerodynamics: () => ({}), computeHeadsailAerodynamics: () => ({}),
    state: {}, previousState: {}, diagnostics: {}, headsailDiagnostics: {}, activeBoat: {},
    audio: { resetMotionState() {} }, lessonCompletedAt: 0, lastManeuverCount: 0,
    clearDocking() {}, clearIncident() {}, world: { resetWake() {}, resetCamera() {} }, elements: { status: { textContent: "" } } };
  runInNewContext(`${extract("stopWeatherShelter")}\n${extract("resetBoat")}\nresetBoat();`, context);
  assert.equal(context.weatherConfig, before);
  assert.equal(context.weatherShelter, undefined);
  assert.equal(context.activitySession, undefined);
  assert.match(context.elements.status.textContent, /Boat reset/);
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
