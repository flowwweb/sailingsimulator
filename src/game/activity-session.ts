import type { WorldActivity } from "./world-definition";

export interface ActivityObservation {
  dt: number;
  x: number;
  z: number;
  speed: number;
  heading: number;
  attached: number;
  tackCount: number;
  reefed: boolean;
  heelRadians: number;
  depth: number;
  dockedAt?: string;
  incident: boolean;
}

export interface ActivityScore {
  total: number;
  control: number;
  trim: number;
  safety: number;
  efficiency: number;
  summary: string;
}

export interface ActivityView {
  progress: number;
  completed: boolean;
  instruction: string;
  score?: ActivityScore;
}

export class ActivitySession {
  private elapsed = 0;
  private distanceSailed = 0;
  private attachedSeconds = 0;
  private excessiveHeelSeconds = 0;
  private unsafeEvents = 0;
  private previous?: ActivityObservation;
  private startingTacks?: number;
  private startingDistance?: number;
  private completed = false;
  private score?: ActivityScore;

  constructor(readonly activity: WorldActivity) {}

  update(observation: ActivityObservation): ActivityView {
    if (this.completed) return this.view(observation);
    const dt = Math.max(0, observation.dt);
    this.elapsed += dt;
    this.startingTacks ??= observation.tackCount;
    this.startingDistance ??= Math.hypot(
      this.activity.x - observation.x,
      this.activity.z - observation.z,
    );
    this.attachedSeconds += observation.attached > 0.68 ? dt : 0;
    this.excessiveHeelSeconds +=
      Math.abs(observation.heelRadians) > (28 * Math.PI) / 180 ? dt : 0;
    if (observation.incident && !this.previous?.incident) this.unsafeEvents += 1;
    if (this.previous) {
      this.distanceSailed += Math.hypot(
        observation.x - this.previous.x,
        observation.z - this.previous.z,
      );
    }
    this.previous = { ...observation };
    const view = this.view(observation);
    if (view.completed) {
      this.completed = true;
      this.score = buildScore(
        this.elapsed,
        this.attachedSeconds,
        this.excessiveHeelSeconds,
        this.unsafeEvents,
        this.distanceSailed,
        this.startingDistance ?? 0,
        this.activity,
      );
      return { ...view, score: this.score };
    }
    return view;
  }

  private view(observation: ActivityObservation): ActivityView {
    const distance = Math.hypot(
      this.activity.x - observation.x,
      this.activity.z - observation.z,
    );
    let progress = clamp(1 - distance / 650, 0, 0.95);
    let completed = distance <= 55;
    let instruction = `${Math.round(distance)} m to ${this.activity.title}`;

    if (this.activity.id === "channel-departure") {
      const quality = this.elapsed > 0 ? this.attachedSeconds / this.elapsed : 0;
      progress = clamp((1 - distance / 450) * 0.7 + quality * 0.3, 0, 0.98);
      completed = distance <= 80 && quality >= 0.55;
      instruction = completed
        ? "Channel held with drawing sail"
        : `${Math.round(distance)} m · keep attached flow between the marks`;
    }
    if (this.activity.id === "school-water-tacks") {
      const tacks = Math.max(0, observation.tackCount - (this.startingTacks ?? 0));
      progress = clamp(tacks / 2, 0, 1);
      completed = tacks >= 2 && observation.attached > 0.68;
      instruction = `${Math.min(tacks, 2)} of 2 clean tacks · finish with attached flow`;
    }
    if (this.activity.id === "fresh-air-reef") {
      const onStation = distance <= 320;
      const settled =
        onStation &&
        observation.reefed &&
        observation.attached > 0.68 &&
        Math.abs(observation.heelRadians) < (24 * Math.PI) / 180;
      progress = settled
        ? 1
        : clamp(
            (1 - distance / 1_200) * 0.55 +
              (observation.reefed ? 0.25 : 0) +
              (observation.attached > 0.68 ? 0.1 : 0),
            0,
            0.94,
          );
      completed = settled;
      instruction = !onStation
        ? `${Math.round(distance)} m to Windward Reach · reef before exposed water`
        : observation.reefed
          ? "Hold attached flow and settle heel below 24°"
          : "Take one reef before entering the exposed reach";
    }
    if (this.activity.id === "juniper-arrival") {
      progress =
        observation.dockedAt === "juniper-cove-dock"
          ? 1
          : clamp(1 - distance / 800, 0, 0.96);
      completed = observation.dockedAt === "juniper-cove-dock";
      instruction = completed
        ? "Secure at the Juniper visitor berth"
        : `${Math.round(distance)} m · arrive below 1.7 kn and align with the berth`;
    }
    if (this.activity.id === "broadwater-crossing") {
      progress = clamp(this.distanceSailed / 700, 0, 1);
      completed = this.distanceSailed >= 700;
      instruction = `${Math.round(this.distanceSailed)} of 700 m sailed`;
    }
    return {
      progress,
      completed,
      instruction,
      score: this.score,
    };
  }
}

function buildScore(
  elapsed: number,
  attachedSeconds: number,
  excessiveHeelSeconds: number,
  unsafeEvents: number,
  distanceSailed: number,
  startingDistance: number,
  activity: WorldActivity,
): ActivityScore {
  const trim = Math.round(100 * clamp(attachedSeconds / Math.max(elapsed, 1), 0, 1));
  const control = Math.round(
    100 * clamp(1 - excessiveHeelSeconds / Math.max(elapsed * 0.45, 1), 0, 1),
  );
  const safety = Math.max(0, 100 - unsafeEvents * 45);
  const referenceDistance =
    activity.id === "broadwater-crossing"
      ? 700
      : activity.id === "school-water-tacks" ||
          activity.id === "fresh-air-reef"
        ? Math.max(distanceSailed, 1)
        : Math.max(startingDistance, 1);
  const efficiency = Math.round(
    100 * clamp(referenceDistance / Math.max(distanceSailed, referenceDistance), 0, 1),
  );
  const total = Math.round(trim * 0.35 + control * 0.25 + safety * 0.3 + efficiency * 0.1);
  return {
    total,
    control,
    trim,
    safety,
    efficiency,
    summary:
      total >= 90
        ? "Excellent control and awareness"
        : total >= 75
          ? "Secure result with a clear next refinement"
          : "Completed; repeat once for smoother control",
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
