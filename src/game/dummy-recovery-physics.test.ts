import { expect, it } from "vitest";
import { HARBOR_20 } from "../sim/boats";
import { computeSailAerodynamics, degrees, sheetForBoomAngle, stepBoat } from "../sim/model";
import { buildWaveComponents } from "../weather/waves";
import { DummyRecovery } from "./dummy-recovery";
import { FIRST_BUOY } from "./first-buoy";
import { evaluateIncident } from "./hazards";
import { createLessonState, createLessonWeather } from "./lesson-session";
import { sampleBoatWavePose } from "./wave-pose";
import { FAIR_WINDS_WORLD } from "./world-definition";

it("can sail away and return alongside the training dummy under waves and tide", () => {
  const weather = createLessonWeather();
  weather.seed = FIRST_BUOY.seed;
  const direction = degrees(weather.wind.directionFromDegrees);
  const environment = { trueWind: { x: -weather.wind.speed * Math.sin(direction), y: -weather.wind.speed * Math.cos(direction) }, boat: HARBOR_20 };
  const waves = buildWaveComponents(weather.waves, weather.wind.speed, weather.wind.directionFromDegrees, weather.seed);
  let state = createLessonState(0, environment.trueWind, FIRST_BUOY.start);
  state.heading = degrees(FIRST_BUOY.startHeadingDegrees);
  let sail = computeSailAerodynamics(state, environment);
  const target = { x: FIRST_BUOY.start.x + 5 * Math.cos(state.heading), z: FIRST_BUOY.start.z - 5 * Math.sin(state.heading) };
  const journey = new DummyRecovery(target, HARBOR_20.collision);
  expect(journey.recover()).toBe(false);
  let phase = 0;
  let contact = false;
  let readyAt = 0;

  for (let tick = 0; tick < 60 * 120 && journey.stage !== "ready" && journey.stage !== "failed"; tick += 1) {
    const time = tick / 60;
    const distance = Math.hypot(state.position.x - target.x, state.position.y - target.z);
    if (phase === 0 && journey.stage === "return") phase = 1;
    const goal = phase === 0 ? { x: 200, z: -330 } : phase === 1
      ? { x: target.x - 3, z: target.z - 8 } : { x: target.x - 3, z: target.z + 8 };
    if (phase === 1 && Math.hypot(state.position.x - goal.x, state.position.y - goal.z) < 5) phase = 2;
    const heading = Math.atan2(goal.x - state.position.x, goal.z - state.position.y);
    const error = Math.atan2(Math.sin(heading - state.heading), Math.cos(heading - state.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - state.yawRate * 8));
    const sheetTarget = phase === 2 && distance < 10 ? 1 : sheetForBoomAngle(sail.idealBoomAngle);
    const controls = { rudder, sheetRate: Math.sign(sheetTarget - state.sheet), sheetTarget };
    const previous = state;
    const wavePose = sampleBoatWavePose(previous, waves, time, HARBOR_20);
    const result = stepBoat(previous, controls, { ...environment, wavePose }, 1 / 60);
    state = result.state;
    sail = result.sail;
    const tide = Math.sin(((time / 600 + weather.tide.phaseHours) / weather.tide.periodHours) * Math.PI * 2) * weather.tide.range * 0.5;
    const incident = evaluateIncident(state, HARBOR_20, FAIR_WINDS_WORLD, tide, undefined, previous);
    contact ||= incident.severity !== "none";
    journey.update(1 / 60, { x: state.position.x, z: state.position.y }, Math.hypot(state.velocity.x, state.velocity.y), contact, state.sheet, controls.sheetRate, state.heading, controls.rudder, state.yawRate);
    readyAt = time;
  }

  expect(contact).toBe(false);
  expect(journey.stage).toBe("ready");
  expect(readyAt).toBeGreaterThan(40);
  expect(readyAt).toBeLessThan(100);
  expect(journey.recover()).toBe(true);
  expect(journey.recover()).toBe(false);
});
