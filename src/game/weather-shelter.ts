import { cloneWeatherConfig, type WeatherConfig } from "../weather/types";

/** Preserve the user's settings while applying only edits made during the exercise. */
export function mergeShelterWeatherEdit(before: WeatherConfig, applied: WeatherConfig, edited: WeatherConfig): WeatherConfig {
  const result = cloneWeatherConfig(before);
  for (const key of ["mode", "seed", "timeScale", "timeOfDay", "rain", "cloud", "visibility"] as const) {
    if (edited[key] !== applied[key]) Object.assign(result, { [key]: edited[key] });
  }
  for (const group of ["wind", "waves", "tide"] as const) {
    for (const [key, value] of Object.entries(edited[group])) {
      const appliedGroup = applied[group] as unknown as Record<string, unknown>;
      if (value !== appliedGroup[key]) Object.assign(result[group], { [key]: value });
    }
  }
  return result;
}

export function reefIsSettled(sailsRaised: boolean, deployment: number, target: number): boolean {
  return sailsRaised && Number.isFinite(deployment) && Number.isFinite(target) && Math.abs(deployment - target) <= 0.08;
}

/** One authored exercise: heed a forecast, manage sail, then reach the actual berth. */
export type ShelterStage = "get-clear" | "forecast" | "respond" | "approach" | "complete" | "failed";

export interface ShelterObservation {
  dt: number;
  x: number;
  z: number;
  speed: number;
  reefed: boolean;
  reefSettled: boolean;
  attached: number;
  heelRadians: number;
  incident: boolean;
  dockedAt?: string;
}

export class WeatherShelter {
  stage: ShelterStage = "get-clear";
  private forecastSeconds = 0;
  private controlledSeconds = 0;
  private travelled = 0;
  private previous?: ShelterObservation;

  constructor(readonly destination: { x: number; z: number }) {}

  interrupt(): void {
    this.previous = undefined;
    this.controlledSeconds = 0;
  }

  update(o: ShelterObservation): ShelterStage {
    if (this.stage === "complete" || this.stage === "failed") return this.stage;
    if (![o.dt, o.x, o.z, o.speed, o.attached, o.heelRadians].every(Number.isFinite) || o.dt < 0 || o.dt > 1) {
      this.interrupt();
      return this.stage;
    }
    if (o.incident) { this.stage = "failed"; return this.stage; }
    if (this.previous) {
      const distance = Math.hypot(o.x - this.previous.x, o.z - this.previous.z);
      if (distance > Math.max(5, (o.speed + this.previous.speed) * o.dt * 2 + 1)) {
        this.stage = "failed";
        return this.stage;
      }
      if (this.stage === "respond" || this.stage === "approach") this.travelled += distance;
    }
    this.previous = { ...o };
    const distance = Math.hypot(o.x - this.destination.x, o.z - this.destination.z);
    if (this.stage === "get-clear" && distance >= 150 && !o.dockedAt) this.stage = "forecast";
    if (this.stage === "forecast") {
      this.forecastSeconds += o.dt;
      if (this.forecastSeconds >= 12) this.stage = "respond";
      return this.stage;
    }
    if (this.stage === "respond") {
      const controlled = o.reefed && o.reefSettled && o.speed >= 0.25 && o.attached >= 0.68 && Math.abs(o.heelRadians) < Math.PI * 24 / 180;
      this.controlledSeconds = controlled ? this.controlledSeconds + o.dt : 0;
      if (this.controlledSeconds >= 5) this.stage = "approach";
    }
    if (this.stage === "approach" && o.dockedAt === "juniper-cove-dock" && distance <= 10 && this.travelled >= 30) this.stage = "complete";
    return this.stage;
  }
}
