import { expect, it } from "vitest";
import { HARBOR_20 } from "../sim/boats";
import { computeSailAerodynamics, degrees, sheetForBoomAngle, stepBoat } from "../sim/model";
import { evaluateIncident } from "./hazards";
import { createLessonState, observeLesson } from "./lesson-session";
import { FIRST_BUOY, FIRST_BUOY_MARKS, FirstBuoyJourney, firstBuoyWorld } from "./first-buoy";

it("can sail the ordered course under its fixed wind without contact", () => {
  const wind = degrees(FIRST_BUOY.windFromDegrees);
  const environment = { trueWind: { x: -6 * Math.sin(wind), y: -6 * Math.cos(wind) }, boat: HARBOR_20 };
  let state = createLessonState(0, environment.trueWind, FIRST_BUOY.start);
  state.heading = degrees(FIRST_BUOY.startHeadingDegrees);
  let sail = computeSailAerodynamics(state, environment);
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
    const result = stepBoat(previous, controls, environment, 1 / 60);
    state = result.state;
    sail = result.sail;
    const incident = evaluateIncident(state, HARBOR_20, firstBuoyWorld(journey.activeCourse()?.id), 0, undefined, previous);
    contact ||= incident.severity !== "none";
    const before = journey.markIndex;
    const completed = journey.update(1 / 60, { ...observeLesson(state, sail, controls), position: state.position, heading: state.heading, unsafe: contact });
    if (journey.markIndex !== before) transitions.push(journey.markIndex);
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
});
