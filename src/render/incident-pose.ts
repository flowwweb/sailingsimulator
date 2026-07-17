import type { IncidentSeverity } from "../game/hazards";

export interface IncidentBoatPose {
  hullRoll: number;
  rigPitch: number;
  rigRoll: number;
}

export function incidentBoatPose(
  severity: IncidentSeverity,
  direction: number,
  progress: number,
  sailingHeel: number,
): IncidentBoatPose {
  if (severity === "impact") {
    return {
      hullRoll: -sailingHeel + direction * 0.24 * progress,
      rigRoll: direction * 0.94 * progress,
      rigPitch: -0.12 * progress,
    };
  }

  if (severity === "stranded") {
    return {
      hullRoll: -sailingHeel + direction * 0.12 * progress,
      rigRoll: 0,
      rigPitch: 0,
    };
  }

  return { hullRoll: -sailingHeel, rigRoll: 0, rigPitch: 0 };
}
