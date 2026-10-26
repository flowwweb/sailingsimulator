export type AcademyStage =
  | "trim"
  | "stall"
  | "recover"
  | "close-hauled"
  | "beam-reach"
  | "broad-reach"
  | "tack"
  | "gybe"
  | "reef"
  | "lesson-complete"
  | "free-sail"
  | "complete";

export interface AcademyObservation {
  attached: number;
  stall: number;
  pointOfSail: string;
  tackCount: number;
  gybeCount: number;
  reefed: boolean;
  heelRadians: number;
  // Missing telemetry fails closed while older callers migrate to observeLesson.
  luff?: number;
  sailDeployment?: number;
  sailsRaised?: boolean;
  forwardSpeed?: number;
  driveForce?: number;
  sheet?: number;
  sheetRate?: number;
  rudder?: number;
  apparentWindAngle?: number;
  yawRate?: number;
  boomAngle?: number;
  desiredBoomAngle?: number;
}

export interface AcademyView {
  stage: AcademyStage;
  eyebrow: string;
  title: string;
  instruction: string;
  progress: number;
  lesson: number;
  objective: number;
  feedback: string;
}

const STAGES: readonly AcademyStage[] = [
  "trim",
  "stall",
  "recover",
  "close-hauled",
  "beam-reach",
  "broad-reach",
  "tack",
  "gybe",
  "reef",
  "complete",
];

export class SailingAcademy {
  private index = 0;
  private heldSeconds = 0;
  private startingTacks = 0;
  private startingGybes = 0;
  private paused = false;
  private lesson = 0;
  private finishedLesson = false;
  private entry?: AcademyObservation;
  private sawLuff = false;
  private sawStall = false;
  private stallSheet = 0;
  private sheetIn = false;
  private eased = false;
  private steered = false;
  private sawFullSail = false;
  private reefTaken = false;
  private feedback = "";

  reset(observation?: Pick<AcademyObservation, "tackCount" | "gybeCount">): void {
    this.index = 0;
    this.lesson = 0;
    this.finishedLesson = false;
    this.paused = false;
    this.heldSeconds = 0;
    this.startingTacks = observation?.tackCount ?? 0;
    this.startingGybes = observation?.gybeCount ?? 0;
    this.clearAttempt();
  }

  skip(): void {
    this.paused = true;
    this.heldSeconds = 0;
    this.clearAttempt();
  }

  resume(observation: Pick<AcademyObservation, "tackCount" | "gybeCount">): void {
    this.paused = false;
    this.startingTacks = observation.tackCount;
    this.startingGybes = observation.gybeCount;
    this.heldSeconds = 0;
    this.clearAttempt();
  }

  restoreCompleted(): void {
    this.index = STAGES.length - 1;
    this.paused = false;
    this.heldSeconds = 0;
    this.lesson = 2;
    this.finishedLesson = false;
  }

  objectiveIndex(): number {
    return this.index;
  }

  restoreObjective(index: number, observation?: Pick<AcademyObservation, "tackCount" | "gybeCount">): void {
    this.reset(observation);
    if (Number.isInteger(index) && index >= 0 && index < STAGES.length) this.index = index;
    this.lesson = Math.min(2, Math.floor(this.index / 3));
  }

  startLesson(lesson: number, observation: Pick<AcademyObservation, "tackCount" | "gybeCount">): void {
    if (!Number.isInteger(lesson) || lesson < 0 || lesson > 2) return;
    this.restoreObjective(lesson * 3, observation);
  }

  restoreLessonComplete(lesson: number): void {
    if (!Number.isInteger(lesson) || lesson < 0 || lesson > 2) return;
    this.restoreObjective((lesson + 1) * 3);
    this.lesson = lesson;
    this.finishedLesson = true;
  }

  /** Break the attempt across hidden time, collisions, recovery or a dropped frame. */
  interrupt(): void {
    this.heldSeconds = 0;
    this.clearAttempt();
  }

  private clearAttempt(): void {
    this.entry = undefined;
    this.sawLuff = false;
    this.sawStall = false;
    this.sheetIn = false;
    this.eased = false;
    this.steered = false;
    this.sawFullSail = false;
    this.reefTaken = false;
    this.feedback = "";
  }

  update(dt: number, observation: AcademyObservation): boolean {
    const stage = STAGES[this.index]!;
    if (this.paused || this.finishedLesson || stage === "complete" || stage === "free-sail" || stage === "lesson-complete") return false;
    // Only live fixed-step samples count, never one large catch-up interval.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05 || !validObservation(observation)) {
      this.interrupt();
      return false;
    }
    const o = observation as LiveObservation;
    if (!this.entry) {
      this.entry = { ...o };
      this.startingTacks = o.tackCount;
      this.startingGybes = o.gybeCount;
    }
    const entry = this.entry as LiveObservation;
    const loaded = o.sailsRaised && o.sailDeployment > 0.6 && o.pointOfSail !== "No-go zone";
    this.sawLuff ||= loaded && o.luff > 0.5;
    if (loaded && o.stall > 0.58 && o.luff < 0.25) {
      if (!this.sawStall) {
        this.stallSheet = o.sheet;
        this.eased = false;
      }
      this.sawStall = true;
    }
    this.sheetIn ||= o.sheetRate < 0 && o.sheet < entry.sheet - 0.02;
    this.eased ||= o.sheetRate > 0 && o.sheet > (stage === "recover" ? this.stallSheet : entry.sheet) + 0.02;
    this.steered ||= Math.abs(o.rudder) > 0.01;
    this.sawFullSail ||= !o.reefed;
    this.reefTaken ||= this.sawFullSail && o.reefed;
    const sailing = loaded && o.forwardSpeed > 0.3 && o.driveForce > 0;
    const settled = Math.abs(o.yawRate) < 0.12 && Math.abs(o.boomAngle - o.desiredBoomAngle) < 0.1;
    const turned = Math.abs(o.apparentWindAngle) - Math.abs(entry.apparentWindAngle);
    const action = stage === "trim" ? this.sawLuff && this.sheetIn
      : stage === "stall" ? this.sheetIn
      : stage === "recover" ? this.sawStall && this.eased && o.sheet > this.stallSheet + 0.02
      : stage === "close-hauled" ? this.steered && turned < -0.08
      : stage === "beam-reach" || stage === "broad-reach" ? this.steered && turned > 0.08 && this.eased
      : stage === "reef" ? this.reefTaken && settled
      : this.steered && settled;
    const requirement = stageRequirement(
      stage,
      o,
      this.startingTacks,
      this.startingGybes,
    );
    const met = requirement.met && action && sailing && (stage === "stall" ? o.luff < 0.25 : settled);
    this.feedback = met ? "Hold steady." : !loaded ? "Raise the sail and steer clear of the no-go zone."
      : stage === "recover" && !this.sawStall ? "Sheet in to find the stall, then ease."
      : stage === "trim" && !this.sawLuff ? "Ease until the sail flutters, then trim in."
      : !action ? STAGE_COPY[stage].instruction
      : o.luff > 0.3 ? "The sail is fluttering. Sheet in gently."
      : o.stall > 0.3 && stage !== "stall" ? "The sail is stalled. Ease a little."
      : !sailing ? "Let the sail draw and build forward speed."
      : "Adjust your course and trim, then hold steady.";
    this.heldSeconds = met
      ? this.heldSeconds + dt
      : 0;
    if (this.heldSeconds < requirement.duration) return false;
    this.index += 1;
    this.finishedLesson = this.index % 3 === 0;
    this.startingTacks = observation.tackCount;
    this.startingGybes = observation.gybeCount;
    this.heldSeconds = 0;
    const witnessedStall = stage === "stall";
    const stallSheet = this.stallSheet;
    this.clearAttempt();
    this.entry = { ...o };
    this.sawStall = witnessedStall;
    this.stallSheet = stallSheet;
    return true;
  }

  view(): AcademyView {
    const stage = this.paused ? "free-sail" : this.finishedLesson ? "lesson-complete" : STAGES[this.index]!;
    const copy = STAGE_COPY[stage];
    const requirement = STAGE_DURATIONS[stage];
    return {
      stage,
      ...copy,
      ...(this.finishedLesson && !this.paused ? { eyebrow: `Lesson ${this.lesson + 1} of 3 complete`, title: LESSON_TITLES[this.lesson]! } : {}),
      lesson: this.lesson,
      objective: this.finishedLesson ? 3 : this.index % 3,
      feedback: this.feedback,
      progress:
        stage === "complete" || stage === "lesson-complete"
          ? 1
          : Math.min(this.heldSeconds / requirement, 1),
    };
  }
}

type LiveObservation = Required<AcademyObservation>;

function validObservation(o: AcademyObservation): o is LiveObservation {
  return [o.attached, o.stall, o.heelRadians, o.luff, o.sailDeployment, o.forwardSpeed,
    o.driveForce, o.sheet, o.sheetRate, o.rudder, o.apparentWindAngle, o.yawRate,
    o.boomAngle, o.desiredBoomAngle].every((n) => typeof n === "number" && Number.isFinite(n))
    && Number.isInteger(o.tackCount) && o.tackCount >= 0
    && Number.isInteger(o.gybeCount) && o.gybeCount >= 0
    && typeof o.sailsRaised === "boolean" && typeof o.reefed === "boolean";
}

export const LESSON_TITLES = ["Catch the wind", "Find your course", "Sail with confidence"] as const;

function stageRequirement(
  stage: Exclude<AcademyStage, "complete" | "free-sail" | "lesson-complete">,
  observation: AcademyObservation,
  startingTacks: number,
  startingGybes: number,
): { met: boolean; duration: number } {
  const attached = observation.attached > 0.68;
  let met = false;
  if (stage === "trim") met = observation.attached > 0.72;
  if (stage === "stall") met = observation.stall > 0.58;
  if (stage === "recover") met = observation.attached > 0.78;
  if (stage === "close-hauled") {
    met = observation.pointOfSail === "Close-hauled" && attached;
  }
  if (stage === "beam-reach") {
    met = observation.pointOfSail === "Beam reach" && attached;
  }
  if (stage === "broad-reach") {
    met = observation.pointOfSail === "Broad reach" && attached;
  }
  if (stage === "tack") {
    met = observation.tackCount > startingTacks && attached;
  }
  if (stage === "gybe") {
    met = observation.gybeCount > startingGybes && attached;
  }
  if (stage === "reef") {
    met =
      observation.reefed &&
      attached &&
      Math.abs(observation.heelRadians) < (22 * Math.PI) / 180;
  }
  return { met, duration: STAGE_DURATIONS[stage] };
}

const STAGE_DURATIONS: Record<AcademyStage, number> = {
  trim: 1.15,
  stall: 0.75,
  recover: 1.15,
  "close-hauled": 1.35,
  "beam-reach": 1.35,
  "broad-reach": 1.35,
  tack: 0.45,
  gybe: 0.45,
  reef: 1.5,
  complete: 1,
  "free-sail": 1,
  "lesson-complete": 1,
};

const STAGE_COPY: Record<AcademyStage, Pick<AcademyView, "eyebrow" | "title" | "instruction">> = {
  trim: {
    eyebrow: "Lesson 1 of 3 · Objective 1 of 3",
    title: "Trim until it draws",
    instruction: "Sheet in gently. Stop when the flutter settles and both telltales stream.",
  },
  stall: {
    eyebrow: "Lesson 1 of 3 · Objective 2 of 3",
    title: "Find the stall",
    instruction: "Keep trimming until the leeward telltale droops and the loaded sail stops accelerating.",
  },
  recover: {
    eyebrow: "Lesson 1 of 3 · Objective 3 of 3",
    title: "Recover attached flow",
    instruction: "Ease until both telltales stream and the boat comes alive again.",
  },
  "close-hauled": {
    eyebrow: "Lesson 2 of 3 · Objective 1 of 3",
    title: "Sail close-hauled",
    instruction: "Follow apparent wind—the wind felt on the moving boat. Head up, sheet in, and hold flow outside the no-go zone.",
  },
  "beam-reach": {
    eyebrow: "Lesson 2 of 3 · Objective 2 of 3",
    title: "Settle on a beam reach",
    instruction: "Bear away until the apparent-wind indicator is across the beam; ease to stream the telltales.",
  },
  "broad-reach": {
    eyebrow: "Lesson 2 of 3 · Objective 3 of 3",
    title: "Open onto a broad reach",
    instruction: "Bear away until the apparent-wind indicator moves aft, easing the sheet.",
  },
  tack: {
    eyebrow: "Lesson 3 of 3 · Objective 1 of 3",
    title: "Make one clean tack",
    instruction: "Build speed, turn smoothly through the no-go zone, then retrim on the new side.",
  },
  gybe: {
    eyebrow: "Lesson 3 of 3 · Objective 2 of 3",
    title: "Control one gybe",
    instruction: "Turn through the wind astern, let the boom cross once, then steady and retrim.",
  },
  reef: {
    eyebrow: "Lesson 3 of 3 · Objective 3 of 3",
    title: "Reef and settle",
    instruction: "Take one reef, keep attached flow, and settle heel below 22°.",
  },
  complete: {
    eyebrow: "Academy complete",
    title: "Fair winds",
    instruction: "Choose a chart activity, improve your score, or explore the lake freely.",
  },
  "lesson-complete": {
    eyebrow: "Lesson complete",
    title: "Well sailed",
    instruction: "All three targets earned. Choose another lesson or keep sailing.",
  },
  "free-sail": {
    eyebrow: "Free Sail",
    title: "Explore at your own pace",
    instruction: "Steer, adjust the sheet and explore. Resume lessons whenever you want.",
  },
};
