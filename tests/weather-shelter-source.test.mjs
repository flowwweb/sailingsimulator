import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/game/weather-shelter.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(source, { mode: "transform" }).replace(/^export /gm, "");
const create = () => runInNewContext(`${js}\nnew WeatherShelter({ x: 200, z: 0 })`);
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

test("weather activity cannot complete from destination proximity alone", () => {
  const source = readFileSync(new URL("../src/game/activity-session.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(source, { mode: "transform" }).replace(/^export /gm, "");
  const activity = runInNewContext(`${js}\nnew ActivitySession({ id: "weather-shelter", title: "Forecast change", x: 200, z: 0 })`);
  const observation = { ...base, x: 200, reefed: true, tackCount: 0, depth: 10, dockedAt: "juniper-cove-dock" };
  assert.equal(activity.update(observation).completed, false);
  assert.equal(activity.update({ ...observation, weatherShelterComplete: true }).completed, true);
});
