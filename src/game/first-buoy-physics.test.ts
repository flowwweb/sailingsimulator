import { expect, it } from "vitest";
import { HARBOR_20 } from "../sim/boats";
import { computeSailAerodynamics, degrees, sheetForBoomAngle, stepBoat } from "../sim/model";
import { evaluateIncident } from "./hazards";
import { createLessonState, createLessonWeather, observeLesson } from "./lesson-session";
import { FIRST_BUOY, FIRST_BUOY_MARKS, FirstBuoyJourney, firstBuoyWorld } from "./first-buoy";
import { sampleBoatWavePose } from "./wave-pose";
import { buildWaveComponents } from "../weather/waves";
import { SailingAcademy } from "./academy";
import { createProgress, nextLessonObjective, parseProgress, recordFirstBuoyCompletion, sailingRank } from "./progress";

it("can retry and sail the ordered course with waves and tide, then continue to the next lesson", () => {
  const wind = degrees(FIRST_BUOY.windFromDegrees);
  const weather = createLessonWeather();
  weather.seed = FIRST_BUOY.seed;
  weather.wind.directionFromDegrees = FIRST_BUOY.windFromDegrees;
  const waves = buildWaveComponents(weather.waves, weather.wind.speed, weather.wind.directionFromDegrees, weather.seed);
  const environment = { trueWind: { x: -weather.wind.speed * Math.sin(wind), y: -weather.wind.speed * Math.cos(wind) }, boat: HARBOR_20 };
  let state = createLessonState(0, environment.trueWind, FIRST_BUOY.start);
  state.heading = degrees(FIRST_BUOY.startHeadingDegrees);
  let sail = computeSailAerodynamics(state, environment);
  const failed = new FirstBuoyJourney();
  const progress = createProgress();
  const initial = { ...observeLesson(state, sail, { rudder: 0, sheetRate: 0 }), position: state.position, heading: state.heading, unsafe: true };
  expect(failed.update(1 / 60, initial)).toBe(false);
  expect(failed.failed).toBe(true);
  expect(sailingRank(progress).xp).toBe(0);
  const journey = new FirstBuoyJourney();
  const transitions: number[] = [];
  let contact = false;
  let finishedAt = 0;
  let roundingAt = 0;
  let rounding = false;

  for (let tick = 0; tick < 60 * 120 && !journey.completed; tick += 1) {
    const first = FIRST_BUOY_MARKS[0]!;
    const dx = state.position.x - first.x;
    const dy = state.position.y - first.z;
    if (!rounding && journey.objective().startsWith("Round")) {
      rounding = true;
      roundingAt = tick / 60;
    }
    const angle = Math.atan2(dy, dx) + 0.6;
    const target = journey.markIndex > 0 ? FIRST_BUOY_MARKS[journey.markIndex]! : rounding
      ? { x: first.x + 10 * Math.cos(angle), z: first.z + 10 * Math.sin(angle) }
      : { x: first.x - 12, z: first.z - 15 };
    const heading = Math.atan2(target.x - state.position.x, target.z - state.position.y);
    const error = Math.atan2(Math.sin(heading - state.heading), Math.cos(heading - state.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - state.yawRate * 8));
    const sheetTarget = sheetForBoomAngle(sail.idealBoomAngle);
    const controls = { rudder, sheetRate: Math.sign(sheetTarget - state.sheet), sheetTarget };
    const previous = state;
    const time = tick / 60;
    const wavePose = sampleBoatWavePose(previous, waves, time, HARBOR_20);
    const result = stepBoat(previous, controls, { ...environment, wavePose }, 1 / 60);
    state = result.state;
    sail = result.sail;
    const tideLevel = Math.sin(((time / 600 + weather.tide.phaseHours) / weather.tide.periodHours) * Math.PI * 2) * weather.tide.range * 0.5;
    const incident = evaluateIncident(state, HARBOR_20, firstBuoyWorld(journey.activeCourse()?.id), tideLevel, undefined, previous);
    contact ||= incident.severity !== "none";
    const before = journey.markIndex;
    const completed = journey.update(1 / 60, { ...observeLesson(state, sail, controls), position: state.position, heading: state.heading, unsafe: contact });
    if (journey.markIndex !== before) {
      transitions.push(journey.markIndex);
      journey.interrupt();
    }
    if (completed) finishedAt = tick / 60;
    if (contact) break;
  }

  expect(contact).toBe(false);
  expect(transitions).toEqual([1, 2]);
  expect(journey.completed).toBe(true);
  expect(roundingAt).toBeGreaterThan(15);
  expect(roundingAt).toBeLessThan(30);
  expect(finishedAt).toBeGreaterThan(30);
  expect(finishedAt).toBeLessThan(120);
  const saved = parseProgress(JSON.stringify(recordFirstBuoyCompletion(progress)));
  expect(sailingRank(saved).level).toBe(2);
  expect(sailingRank(recordFirstBuoyCompletion(saved)).xp).toBe(100);
  const academy = new SailingAcademy();
  academy.skip();
  academy.restoreObjective(nextLessonObjective(saved, 0));
  expect(academy.objectiveIndex()).toBe(0);
  expect(academy.view().stage).not.toBe("free-sail");
});
