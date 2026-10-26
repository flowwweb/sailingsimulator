import { SailingAcademy, type AcademyObservation } from "./academy";
import { nextLessonObjective, type SailingProgress } from "./progress";
import { createInitialState, degrees, pointOfSail, sheetForBoomAngle, type BoatState, type Controls, type SailDiagnostics, type Vec2 } from "../sim/model";
import { cloneWeatherConfig, DEFAULT_WEATHER, type WeatherConfig } from "../weather/types";

export function createLessonWeather(): WeatherConfig {
  const config = cloneWeatherConfig(DEFAULT_WEATHER);
  config.wind.speed = 6;
  config.wind.gustStrength = 0;
  return config;
}

/** A fresh exercise in the existing School Water, relative to the real wind. */
export function createLessonState(
  objective: number,
  trueWind: Vec2,
  spawn = { x: 250, z: 50 },
): BoatState {
  const index = Number.isInteger(objective) && objective >= 0 && objective < 9 ? objective : 0;
  const angle = [100, 100, 100, 70, 50, 90, 50, 140, 100][index]!;
  const initial = createInitialState();
  initial.position = { x: spawn.x, y: spawn.z };
  const incoming = Math.atan2(-trueWind.x, -trueWind.y);
  initial.heading = Math.atan2(Math.sin(incoming - degrees(angle)), Math.cos(incoming - degrees(angle)));
  const opening = index === 0 ? 85 : index === 2 ? 17 : angle * 0.72 - 18;
  initial.sheet = sheetForBoomAngle(degrees(opening));
  initial.boomAngle = -degrees(opening);
  initial.headsailSheet = initial.sheet;
  initial.headsailAngle = initial.boomAngle;
  return initial;
}

export function observeLesson(state: BoatState, sail: SailDiagnostics, controls: Controls): AcademyObservation {
  return {
    attached: sail.attached, stall: sail.stall, luff: sail.luff,
    pointOfSail: pointOfSail(sail.apparentWindAngle),
    tackCount: state.tackCount, gybeCount: state.gybeCount,
    reefed: state.reefLevel === 1, heelRadians: state.heel,
    sailDeployment: state.sailDeployment, sailsRaised: state.sailsRaised,
    forwardSpeed: state.velocity.x * Math.sin(state.heading) + state.velocity.y * Math.cos(state.heading),
    driveForce: sail.driveForce, sheet: state.sheet, sheetRate: controls.sheetRate,
    rudder: controls.rudder, apparentWindAngle: sail.apparentWindAngle,
    yawRate: state.yawRate, boomAngle: state.boomAngle, desiredBoomAngle: sail.desiredBoomAngle,
  };
}

export function checkpointLesson(progress: SailingProgress, academy: SailingAcademy): SailingProgress {
  const view = academy.view();
  return { ...progress, academyObjective: academy.objectiveIndex(), academyLesson: view.lesson, academyPaused: view.stage === "free-sail" };
}

export function restoreLesson(academy: SailingAcademy, progress: SailingProgress): void {
  const objective = progress.academyObjective ?? (progress.academyCompleted ? 9 : 0);
  const lesson = progress.academyLesson ?? Math.min(2, Math.floor(objective / 3));
  if (objective === (lesson + 1) * 3 && progress.completedLessons?.includes(lesson)) {
    academy.restoreLessonComplete(lesson);
  } else if (objective >= lesson * 3 && objective < lesson * 3 + 3) {
    academy.restoreObjective(progress.completedLessons?.includes(lesson)
      ? objective : Math.min(objective, nextLessonObjective(progress, lesson)));
  } else {
    academy.restoreObjective(lesson * 3);
  }
  if (progress.academyPaused) academy.skip();
}
