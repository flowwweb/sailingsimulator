import type { BoatState } from "../sim/model";
import { bowPosition, dropAnchor, payOutRode, stepAnchor, type AnchorState } from "./anchoring";

export type AnchorageStage = "approach" | "payout" | "set" | "holding" | "recover" | "complete" | "failed";

/** A game exercise with simplified sand holding, not an assessment of real anchoring safety. */
export class AnchorageExercise {
  stage: AnchorageStage = "approach";
  anchor?: AnchorState;
  holdSeconds = 0;
  tension = 0;
  private haulImpulse = 0;
  message = "Approach the anchorage slowly and check depth and swing room.";

  constructor(readonly target: { x: number; y: number }, readonly hull: { halfLength: number; draft: number }) {}

  drop(boat: BoatState, depth: (x: number, y: number) => number, clearOfObjects: (x: number, y: number, radius: number) => boolean): boolean {
    if (this.anchor || this.stage !== "approach") return false;
    const bow = bowPosition(boat, this.hull.halfLength);
    const d = depth(bow.x, bow.y);
    if (Math.hypot(bow.x - this.target.x, bow.y - this.target.y) > 65) { this.message = "Sail closer to the anchorage before dropping."; return false; }
    if (Math.hypot(boat.velocity.x, boat.velocity.y) > 0.5) { this.message = "Slow below 1 knot before dropping from the bow."; return false; }
    if (!Number.isFinite(d) || d < this.hull.draft + 1 || d > 12) { this.message = "Choose water with enough depth and suitable scope for this exercise."; return false; }
    const swing = 7 * (d + 0.6) + this.hull.halfLength * 2;
    for (const radius of [swing / 3, swing * 2 / 3, swing]) {
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        const swingDepth = depth(bow.x + Math.cos(angle) * radius, bow.y + Math.sin(angle) * radius);
        if (!Number.isFinite(swingDepth) || swingDepth < this.hull.draft + 1) { this.message = "Not enough clear water to swing here. Choose another spot."; return false; }
      }
    }
    if (!clearOfObjects(bow.x, bow.y, swing)) { this.message = "Leave more swing room around charted hazards."; return false; }
    this.anchor = dropAnchor(boat, this.hull.halfLength, d);
    this.stage = "payout";
    this.message = "Anchor down from the bow. Pay out rode as the boat drifts back.";
    return true;
  }

  payOut(depth: number): boolean {
    if (!this.anchor || this.stage === "failed" || this.stage === "complete") return false;
    const maximum = 7 * Math.max(0.1, depth + 0.6);
    this.anchor = payOutRode(this.anchor, Math.min(5, Math.max(0, maximum - this.anchor.rode)));
    if (this.stage === "payout" && this.anchor.rode >= 5 * (depth + 0.6)) this.stage = "set";
    return true;
  }

  step(boat: BoatState, depth: number, dt: number): BoatState {
    if (!this.anchor) return boat;
    const bow = bowPosition(boat, this.hull.halfLength);
    const dx = this.anchor.position.x - bow.x;
    const dy = this.anchor.position.y - bow.y;
    const distance = Math.hypot(dx, dy);
    if (this.haulImpulse > 0 && distance > 0) {
      boat = { ...boat, velocity: { x: boat.velocity.x + dx / distance * this.haulImpulse, y: boat.velocity.y + dy / distance * this.haulImpulse } };
      this.haulImpulse = 0;
    }
    const result = stepAnchor(this.anchor, boat, this.hull.halfLength, depth, dt);
    this.anchor = result.anchor;
    this.tension = result.tension;
    return result.boat;
  }

  observe(dt: number, unsafe: boolean, depth: number): void {
    if (!this.anchor || this.stage === "complete" || this.stage === "failed") return;
    if (unsafe || depth < this.hull.draft + 0.15) { this.stage = "failed"; this.holdSeconds = 0; this.message = "The boat was unsafe. Retry and allow more room."; return; }
    if (this.stage === "recover") return;
    if (this.anchor.dragging) {
      this.stage = this.anchor.rode < 5 * (depth + 0.6) ? "payout" : "set";
      this.holdSeconds = 0;
      this.message = this.stage === "payout" ? "The anchor is dragging. Slow down and pay out more rode." : "The anchor is dragging. Ease the load and set it again.";
      return;
    }
    if (this.anchor.rode < 5 * (depth + 0.6)) { this.stage = "payout"; this.holdSeconds = 0; this.message = "Pay out more rode; this exercise uses at least 5:1 scope."; return; }
    if (!this.anchor.set) { this.stage = "set"; this.holdSeconds = 0; this.message = "Let the boat drift back gently until the rode takes load and the anchor sets."; return; }
    this.stage = "holding";
    this.holdSeconds = this.tension > 0.025 ? this.holdSeconds + Math.max(0, dt) : 0;
    this.message = "Watch the anchor hold under load as the boat swings.";
    if (this.holdSeconds >= 8) { this.stage = "recover"; this.message = "Anchor held. Sail back toward it and bring the rode in."; }
  }

  haul(boat: BoatState, depth: number): boolean {
    if (!this.anchor || this.stage === "failed" || this.stage === "complete") return false;
    const bow = bowPosition(boat, this.hull.halfLength);
    const distance = Math.hypot(bow.x - this.anchor.position.x, bow.y - this.anchor.position.y);
    if (distance < 2 && Math.hypot(boat.velocity.x, boat.velocity.y) < 0.5) {
      const finished = this.stage === "recover";
      this.anchor = undefined;
      this.stage = finished ? "complete" : "approach";
      this.message = finished ? "Anchor recovered. Exercise complete." : "Anchor recovered. Choose your spot and try again.";
      return true;
    }
    const straightLine = Math.hypot(distance, Math.max(0, depth + 0.6));
    const shorter = Math.max(straightLine + 0.3, this.anchor.rode - 5);
    // Tiny inward drift should not consume a haul just taking in millimetres of slack.
    if (shorter >= this.anchor.rode - 0.1) {
      this.haulImpulse = Math.min(0.8, this.haulImpulse + 0.6);
      this.message = "Taking the weight on the rode. Keep working toward the anchor.";
      return true;
    }
    this.anchor = { ...this.anchor, rode: shorter };
    this.message = "Rode coming in. Move closer to the anchor to recover it.";
    return true;
  }
}
