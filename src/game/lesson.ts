import type { SailDiagnostics } from "../sim/model";

export type LessonStage = "trim" | "stall" | "ease" | "complete";

export interface LessonView {
  stage: LessonStage;
  eyebrow: string;
  title: string;
  instruction: string;
  progress: number;
}

export class TrimLesson {
  private stage: LessonStage = "trim";
  private heldSeconds = 0;

  reset(): void {
    this.stage = "trim";
    this.heldSeconds = 0;
  }

  skip(): void {
    this.stage = "complete";
    this.heldSeconds = 0;
  }

  update(dt: number, sail: SailDiagnostics): boolean {
    const previous = this.stage;
    let condition = false;
    let duration = 1.15;
    if (this.stage === "trim") condition = sail.attached > 0.72;
    if (this.stage === "stall") {
      condition = sail.stall > 0.58;
      duration = 0.75;
    }
    if (this.stage === "ease") condition = sail.attached > 0.78;
    this.heldSeconds = condition ? this.heldSeconds + dt : Math.max(0, this.heldSeconds - dt * 1.5);
    if (this.heldSeconds >= duration) {
      this.heldSeconds = 0;
      this.stage = this.stage === "trim" ? "stall" : this.stage === "stall" ? "ease" : "complete";
    }
    return previous !== this.stage;
  }

  view(): LessonView {
    if (this.stage === "trim") {
      return {
        stage: this.stage,
        eyebrow: "1 · Feel the sail",
        title: "Trim until it draws",
        instruction: "Sheet in gently. Stop when the flutter settles and both telltales stream.",
        progress: this.heldSeconds / 1.15,
      };
    }
    if (this.stage === "stall") {
      return {
        stage: this.stage,
        eyebrow: "2 · Find the limit",
        title: "Sheet in too far",
        instruction: "Keep trimming until the leeward telltale droops. That heavy, quiet sail is stalled.",
        progress: this.heldSeconds / 0.75,
      };
    }
    if (this.stage === "ease") {
      return {
        stage: this.stage,
        eyebrow: "3 · Recover flow",
        title: "Ease to the sweet spot",
        instruction: "Ease until the telltales stream again. The boat will accelerate when flow reattaches.",
        progress: this.heldSeconds / 1.15,
      };
    }
    return {
      stage: "complete",
      eyebrow: "Free Sail",
      title: "Fair winds",
      instruction: "Explore the open water. Turn through the wind to tack, and retrim for every point of sail.",
      progress: 1,
    };
  }
}
