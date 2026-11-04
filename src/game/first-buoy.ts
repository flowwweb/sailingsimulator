import type { AcademyObservation } from "./academy";
import { FAIR_WINDS_WORLD, type WorldActivity, type WorldDefinition } from "./world-definition";

// Provisional teaching/continuity bounds in metres and m/s, not navigation rules.
export const FIRST_BUOY = {
  id: "intro.buoy-1", revision: 1, title: "Round the buoys", seed: 24001,
  start: { x: 191, z: -257 }, startHeadingDegrees: 160, windFromDegrees: 260, radiusM: 15, minTravelM: 30,
  maxStepSpeedMps: 12, maxArrivalSpeedMps: 4,
} as const;

export const FIRST_COURSE_ID = "intro.three-buoy-course";
export const FIRST_BUOY_MARKS: readonly WorldActivity[] = ["juniper-buoy", "school-buoy-2", "school-buoy-3"].map((id, index): WorldActivity => {
  const target = FAIR_WINDS_WORLD.objects.find((object) => object.id === id);
  if (!target || target.kind !== "buoy" || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
    throw new Error(`First journey requires training mark ${id}.`);
  }
  return { id, title: index === 0 ? "Juniper buoy" : `School buoy ${index + 1}`, kind: "lesson",
    x: target.x, z: target.z, area: "School Water", difficulty: "Intro",
    objective: index === 0 ? "Round the buoy, keeping it to port." : "Sail to the next buoy under control." };
});
export const FIRST_BUOY_COURSE = FIRST_BUOY_MARKS[0]!;
const markIds = new Set(FIRST_BUOY_MARKS.map((mark) => mark.id));
const lessonWorlds = new Map<string, WorldDefinition>(["", ...markIds].map((activeId): [string, WorldDefinition] => [activeId, {
  ...FAIR_WINDS_WORLD,
  objects: FAIR_WINDS_WORLD.objects.filter((object) => !markIds.has(object.id) || object.id === activeId),
}]));

/** Keep navigation, rendering and collision on the same active training mark. */
export function firstBuoyWorld(activeId?: string): WorldDefinition {
  return lessonWorlds.get(activeId ?? "") ?? lessonWorlds.get("")!;
}

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

function distance(position: { x: number; y: number }, target: WorldActivity): number {
  return Math.hypot(position.x - target.x, position.y - target.z);
}

export class FirstBuoyJourney {
  completed = false;
  failed = false;
  markIndex = 0;
  private rounding = false;
  private roundAngle = 0;
  private previous?: LiveObservation;
  private travelM = 0;
  private helmStart?: number;
  private steered = false;

  interrupt(): void {
    this.previous = undefined;
    this.travelM = 0;
    this.helmStart = undefined;
    this.steered = false;
    this.rounding = false;
    this.roundAngle = 0;
  }

  activeCourse(): WorldActivity | undefined {
    return this.completed || this.failed ? undefined : FIRST_BUOY_MARKS[this.markIndex];
  }

  objective(): string {
    return this.rounding ? "Round Juniper buoy, keeping it to port." : `Sail to ${this.activeCourse()?.title ?? "the next buoy"}.`;
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
    // Provisional helm witness: rudder 0.01 and heading change 0.03 rad.
    if (Math.abs(o.rudder) > 0.01) {
      this.helmStart ??= previous.heading;
      const turn = o.heading - this.helmStart;
      this.steered ||= Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.03;
    }
    const target = FIRST_BUOY_MARKS[this.markIndex]!;
    const priorDistance = distance(previous.position, target);
    const currentDistance = distance(o.position, target);
    const entered = priorDistance > FIRST_BUOY.radiusM && currentDistance <= FIRST_BUOY.radiusM;
    // Provisional arrival bounds: m/s forward speed, sail fractions, and rad/s yaw.
    const controlled = o.sailsRaised && o.sailDeployment > 0.6
      && o.forwardSpeed > 0.3 && o.forwardSpeed <= FIRST_BUOY.maxArrivalSpeedMps
      && o.driveForce > 0 && o.luff < 0.3 && o.stall < 0.3
      && Math.abs(o.yawRate) < 0.12 && o.pointOfSail !== "No-go zone";
    if (this.markIndex === 0) {
      if (entered && this.steered && this.travelM >= FIRST_BUOY.minTravelM && controlled) {
        this.rounding = true;
        this.roundAngle = 0;
      } else if (this.rounding) {
        const previousAngle = Math.atan2(previous.position.y - target.z, previous.position.x - target.x);
        const currentAngle = Math.atan2(o.position.y - target.z, o.position.x - target.x);
        const change = currentAngle - previousAngle;
        this.roundAngle += Math.atan2(Math.sin(change), Math.cos(change));
        if (currentDistance > FIRST_BUOY.radiusM && this.roundAngle >= Math.PI * 0.65 && controlled) {
          this.markIndex = 1;
          this.interrupt();
        } else if (currentDistance > FIRST_BUOY.radiusM * 1.5) {
          this.rounding = false;
          this.roundAngle = 0;
        }
      }
      return false;
    }
    if (!entered || !controlled) return false;
    if (this.markIndex < FIRST_BUOY_MARKS.length - 1) {
      this.markIndex++;
      this.interrupt();
      return false;
    }
    this.completed = true;
    return true;
  }

  view(position: { x: number; y: number }): { progress: number; instruction: string } {
    if (this.completed) return { progress: 1, instruction: "All three buoys reached under control." };
    if (this.failed) return { progress: 0, instruction: "This attempt was interrupted by contact or a position jump. Retry from School Water." };
    const target = FIRST_BUOY_MARKS[this.markIndex]!;
    const remaining = distance(position, target);
    if (!Number.isFinite(remaining)) return { progress: 0, instruction: "Waiting for the boat position." };
    if (this.rounding) return { progress: 0.25, instruction: "Round Juniper buoy, keeping it on your port side." };
    if (remaining <= FIRST_BUOY.radiusM) return { progress: this.markIndex / 3, instruction: "Sail outside the buoy zone, then approach again under control." };
    const initialDistance = this.markIndex === 0 ? distance({ x: FIRST_BUOY.start.x, y: FIRST_BUOY.start.z }, target) : 42;
    return {
      progress: Math.max(this.markIndex / 3, Math.min((this.markIndex + 0.95) / 3, (this.markIndex + (initialDistance - remaining) / (initialDistance - FIRST_BUOY.radiusM)) / 3)),
      instruction: this.markIndex > 0 ? `Steer and trim toward ${target.title}.` : this.travelM < FIRST_BUOY.minTravelM
        ? "Trim and steer toward Juniper buoy. After a break, take a longer approach to settle the boat."
        : "Approach Juniper buoy steadily, ready to round it with the buoy to port.",
    };
  }
}
