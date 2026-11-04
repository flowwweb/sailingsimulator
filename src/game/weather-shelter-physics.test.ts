import { expect, it } from "vitest";
import { HARBOR_20 } from "../sim/boats";
import { computeSailAerodynamics, createInitialState, degrees, sailDeploymentTarget, sheetForBoomAngle, stepBoat } from "../sim/model";
import { evaluateDocking, mooredBoatState } from "./docking";
import { evaluateIncident } from "./hazards";
import { reefIsSettled, WeatherShelter } from "./weather-shelter";
import { FAIR_WINDS_WORLD } from "./world-definition";
import { ActivitySession, type ActivityView } from "./activity-session";
import { createProgress, parseProgress, recordActivityCompletion } from "./progress";

it("can respond to the forecast and sail to the actual berth without contact", () => {
  let state = createInitialState();
  state.position = { x: 1040, y: -270 };
  state.heading = degrees(169);
  state.sheet = .65;
  state.boomAngle = -degrees(50);
  const contactState = { ...state, position: { x: 1040, y: -480 }, velocity: { x: 2, y: 0 } };
  const contactIncident = evaluateIncident(contactState, HARBOR_20, FAIR_WINDS_WORLD, 0);
  expect(contactIncident.severity !== "none").toBe(true);
  const failed = new WeatherShelter({ x: 1040, z: -480 });
  failed.update({ dt: 1 / 60, x: contactState.position.x, z: contactState.position.y, speed: 2,
    reefed: false, reefSettled: false, attached: 0, heelRadians: 0,
    incident: contactIncident.severity !== "none" });
  expect(failed.stage).toBe("failed");
  // Retry creates a new attempt and records only the successful outcome.
  const exercise = new WeatherShelter({ x: 1040, z: -480 });
  const activity = FAIR_WINDS_WORLD.activities.find((item) => item.id === "weather-shelter")!;
  const session = new ActivitySession(activity);
  let view: ActivityView | undefined;
  let wind = 6;
  let sawForecast = false;
  let sawResponse = false;
  let contact = false;
  for (let tick = 0; tick < 60 * 140 && exercise.stage !== "complete"; tick++) {
    const dx = 1040 - state.position.x;
    const dz = -476.8 - state.position.y;
    const distance = Math.hypot(dx, dz);
    const targetHeading = distance < 10 ? degrees(169.2) : Math.atan2(dx, dz);
    const error = Math.atan2(Math.sin(targetHeading - state.heading), Math.cos(targetHeading - state.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - state.yawRate * 8));
    const environment = { trueWind: { x: -wind * Math.sin(degrees(260)), y: -wind * Math.cos(degrees(260)) }, boat: HARBOR_20 };
    const sail = computeSailAerodynamics(state, environment);
    const sheetTarget = distance < 10 ? 1 : sheetForBoomAngle(sail.idealBoomAngle);
    if (exercise.stage === "respond" || exercise.stage === "approach") state = { ...state, reefLevel: 1 };
    const previous = state;
    const result = stepBoat(previous, { rudder, sheetRate: Math.sign(sheetTarget - state.sheet), sheetTarget }, environment, 1 / 60);
    state = result.state;
    const incident = evaluateIncident(state, HARBOR_20, FAIR_WINDS_WORLD, 0, undefined, previous);
    contact ||= incident.severity !== "none";
    const docking = incident.kind === "docking" ? evaluateDocking(state, HARBOR_20, FAIR_WINDS_WORLD) : undefined;
    if (docking) state = mooredBoatState(state, docking);
    const prior = exercise.stage;
    exercise.update({ dt: 1 / 60, x: state.position.x, z: state.position.y,
      speed: Math.hypot(state.velocity.x, state.velocity.y), reefed: state.reefLevel === 1,
      reefSettled: reefIsSettled(state.sailsRaised, state.sailDeployment, sailDeploymentTarget(state)),
      attached: result.sail.attached, heelRadians: state.heel, incident: contact, dockedAt: docking?.object.id });
    view = session.update({ dt: 1 / 60, x: state.position.x, z: state.position.y,
      speed: Math.hypot(state.velocity.x, state.velocity.y), heading: state.heading,
      attached: result.sail.attached, tackCount: state.tackCount, reefed: state.reefLevel === 1,
      heelRadians: state.heel, depth: FAIR_WINDS_WORLD.sampleDepth(state.position.x, state.position.y),
      incident: contact, dockedAt: docking?.object.id, weatherShelterComplete: exercise.stage === "complete" });
    sawForecast ||= exercise.stage === "forecast";
    sawResponse ||= exercise.stage === "respond";
    if (prior === "forecast" && exercise.stage === "respond") wind = 10.5;
    if (contact) break;
  }
  expect(sawForecast).toBe(true);
  expect(sawResponse).toBe(true);
  expect(contact).toBe(false);
  expect(exercise.stage).toBe("complete");
  expect(view?.completed).toBe(true);
  const restored = parseProgress(JSON.stringify(recordActivityCompletion(createProgress(), activity.id, view!.score!)));
  expect(restored.activities[activity.id]?.completions).toBe(1);
});
