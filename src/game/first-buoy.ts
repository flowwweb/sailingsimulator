import type { AcademyObservation } from "./academy";
import { FAIR_WINDS_WORLD, type WorldActivity } from "./world-definition";

// Provisional teaching/continuity bounds in metres and m/s, not navigation rules.
export const FIRST_BUOY = {
  id: "intro.buoy-1", revision: 1, title: "Reach the first buoy", seed: 24001,
  start: { x: 250, z: 50 }, startHeadingDegrees: 160, radiusM: 15, minTravelM: 30,
  maxStepSpeedMps: 12, maxArrivalSpeedMps: 4,
} as const;

const target = FAIR_WINDS_WORLD.objects.find((object) => object.id === "juniper-buoy");
if (!target || target.kind !== "buoy" || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
  throw new Error("First buoy lesson requires the authored Juniper buoy.");
}

export const FIRST_BUOY_COURSE: WorldActivity = {
  id: FIRST_BUOY.id, title: FIRST_BUOY.title, kind: "lesson",
  x: target.x, z: target.z, area: "School Water", difficulty: "Intro",
  objective: "Read the wind, trim and steer to Juniper buoy. Arrive steadily with the sail drawing.",
};

export interface FirstBuoyObservation extends AcademyObservation {
  position: { x: number; y: number };
  heading: number;
  unsafe: boolean;
}

type LiveObservation = Required<FirstBuoyObservation>;

function validObservation(o: FirstBuoyObservation): o is LiveObservation {
  return [o.position?.x, o.position?.y, o.heading, o.attached, o.stall,
    o.heelRadians, o.luff, o.sailDeployment, o.forwardSpeed, o.driveForce,
    o.sheet, o.sheetRate, o.rudder, o.apparentWindAngle, o.yawRate,
    o.boomAngle, o.desiredBoomAngle].every((value) => typeof value === "number" && Number.isFinite(value))
    && Number.isInteger(o.tackCount) && o.tackCount >= 0
    && Number.isInteger(o.gybeCount) && o.gybeCount >= 0
    && typeof o.reefed === "boolean" && typeof o.sailsRaised === "boolean"
    && typeof o.unsafe === "boolean" && typeof o.pointOfSail === "string";
}

function distance(position: { x: number; y: number }): number {
  return Math.hypot(position.x - FIRST_BUOY_COURSE.x, position.y - FIRST_BUOY_COURSE.z);
}

export class FirstBuoyJourney {
  completed = false;
  failed = false;
  private previous?: LiveObservation;
  private travelM = 0;
  private sheetStart?: number;
  private helmStart?: number;
  private trimmed = false;
  private steered = false;

  interrupt(): void {
    this.previous = undefined;
    this.travelM = 0;
    this.sheetStart = undefined;
    this.helmStart = undefined;
    this.trimmed = false;
    this.steered = false;
  }

  update(dt: number, observation: FirstBuoyObservation): boolean {
    if (this.completed || this.failed) return false;
    if (observation.unsafe === true) {
      this.failed = true;
      this.interrupt();
      return false;
    }
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05 || !validObservation(observation)) {
      this.interrupt();
      return false;
    }
    const o = observation;
    const previous = this.previous;
    // Copy position too: the caller may mutate its boat state on the next tick.
    this.previous = { ...o, position: { ...o.position } };
    if (!previous) return false;
    const stepM = Math.hypot(o.position.x - previous.position.x, o.position.y - previous.position.y);
    if (stepM > FIRST_BUOY.maxStepSpeedMps * dt) {
      this.failed = true;
      this.interrupt();
      return false;
    }
    this.travelM += stepM;
    // Provisional action witnesses: sheet fraction 0.02; helm 0.01 and heading 0.03 rad.
    if (Math.abs(o.sheetRate) > 0) {
      this.sheetStart ??= previous.sheet;
      this.trimmed ||= Math.abs(o.sheet - this.sheetStart) > 0.02;
    }
    if (Math.abs(o.rudder) > 0.01) {
      this.helmStart ??= previous.heading;
      const turn = o.heading - this.helmStart;
      this.steered ||= Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.03;
    }
    const entered = distance(previous.position) > FIRST_BUOY.radiusM && distance(o.position) <= FIRST_BUOY.radiusM;
    // Provisional arrival bounds: m/s forward speed, sail fractions, and rad/s yaw.
    const controlled = o.sailsRaised && o.sailDeployment > 0.6
      && o.forwardSpeed > 0.3 && o.forwardSpeed <= FIRST_BUOY.maxArrivalSpeedMps
      && o.driveForce > 0 && o.luff < 0.3 && o.stall < 0.3
      && Math.abs(o.yawRate) < 0.12 && o.pointOfSail !== "No-go zone";
    if (!entered || !this.trimmed || !this.steered || this.travelM < FIRST_BUOY.minTravelM || !controlled) return false;
    this.completed = true;
    return true;
  }

  view(position: { x: number; y: number }): { progress: number; instruction: string } {
    if (this.completed) return { progress: 1, instruction: "First buoy reached under control." };
    if (this.failed) return { progress: 0, instruction: "This attempt was interrupted by contact or a position jump. Retry from School Water." };
    const remaining = distance(position);
    if (!Number.isFinite(remaining)) return { progress: 0, instruction: "Waiting for the boat position." };
    if (remaining <= FIRST_BUOY.radiusM) return { progress: 0, instruction: "Sail outside the buoy zone, then re-enter steadily after trimming and steering." };
    const initialDistance = distance({ x: FIRST_BUOY.start.x, y: FIRST_BUOY.start.z });
    return {
      progress: Math.max(0, Math.min(0.95, (initialDistance - remaining) / (initialDistance - FIRST_BUOY.radiusM))),
      instruction: this.travelM < FIRST_BUOY.minTravelM
        ? "Trim and steer toward Juniper buoy. After a break, take a longer approach to settle the boat."
        : "Approach Juniper buoy steadily with the sail drawing. Ease or turn away if you need another approach.",
    };
  }
}
