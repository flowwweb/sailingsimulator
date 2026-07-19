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
  | "complete";

export interface AcademyObservation {
  attached: number;
  stall: number;
  pointOfSail: string;
  tackCount: number;
  gybeCount: number;
  reefed: boolean;
  heelRadians: number;
}

export interface AcademyView {
  stage: AcademyStage;
  eyebrow: string;
  title: string;
  instruction: string;
  progress: number;
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

  reset(observation?: Pick<AcademyObservation, "tackCount" | "gybeCount">): void {
    this.index = 0;
    this.heldSeconds = 0;
    this.startingTacks = observation?.tackCount ?? 0;
    this.startingGybes = observation?.gybeCount ?? 0;
  }

  skip(): void {
    this.index = STAGES.length - 1;
    this.heldSeconds = 0;
  }

  update(dt: number, observation: AcademyObservation): boolean {
    const stage = STAGES[this.index]!;
    if (stage === "complete") return false;
    const requirement = stageRequirement(
      stage,
      observation,
      this.startingTacks,
      this.startingGybes,
    );
    this.heldSeconds = requirement.met
      ? this.heldSeconds + Math.max(dt, 0)
      : Math.max(0, this.heldSeconds - Math.max(dt, 0) * 1.5);
    if (this.heldSeconds < requirement.duration) return false;
    this.index += 1;
    this.heldSeconds = 0;
    return true;
  }

  view(): AcademyView {
    const stage = STAGES[this.index]!;
    const copy = STAGE_COPY[stage];
    const requirement = STAGE_DURATIONS[stage];
    return {
      stage,
      ...copy,
      progress:
        stage === "complete"
          ? 1
          : Math.min(this.heldSeconds / requirement, 1),
    };
  }
}

function stageRequirement(
  stage: Exclude<AcademyStage, "complete">,
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
};

const STAGE_COPY: Record<AcademyStage, Omit<AcademyView, "stage" | "progress">> = {
  trim: {
    eyebrow: "Academy · 1 of 9",
    title: "Trim until it draws",
    instruction: "Sheet in gently. Stop when the flutter settles and both telltales stream.",
  },
  stall: {
    eyebrow: "Academy · 2 of 9",
    title: "Find the stall",
    instruction: "Keep trimming until the leeward telltale droops and the loaded sail stops accelerating.",
  },
  recover: {
    eyebrow: "Academy · 3 of 9",
    title: "Recover attached flow",
    instruction: "Ease until both telltales stream and the boat comes alive again.",
  },
  "close-hauled": {
    eyebrow: "Academy · 4 of 9",
    title: "Sail close-hauled",
    instruction: "Head up toward the wind, sheet in, and hold attached flow just outside the no-go zone.",
  },
  "beam-reach": {
    eyebrow: "Academy · 5 of 9",
    title: "Settle on a beam reach",
    instruction: "Bear away until the wind is across the beam, then ease to keep the telltales streaming.",
  },
  "broad-reach": {
    eyebrow: "Academy · 6 of 9",
    title: "Open onto a broad reach",
    instruction: "Bear away again and ease the sheet as the wind moves aft.",
  },
  tack: {
    eyebrow: "Academy · 7 of 9",
    title: "Make one clean tack",
    instruction: "Build speed, turn smoothly through the no-go zone, then retrim on the new side.",
  },
  gybe: {
    eyebrow: "Academy · 8 of 9",
    title: "Control one gybe",
    instruction: "Turn through the wind astern, let the boom cross once, then steady and retrim.",
  },
  reef: {
    eyebrow: "Academy · 9 of 9",
    title: "Reef and settle",
    instruction: "Take one reef, keep attached flow, and settle heel below 22°.",
  },
  complete: {
    eyebrow: "Academy complete",
    title: "Fair winds",
    instruction: "Choose a chart activity, improve your score, or explore the lake freely.",
  },
};
