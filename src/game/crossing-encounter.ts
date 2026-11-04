// A single clear-visibility, open-water exercise; distances are game thresholds.
// Both boats sail without engine; neither is overtaking. COLREG 12(a)(i) applies.
// https://www.gov.uk/government/publications/msn-1781-mf-amendment-3-the-merchant-shipping-regulations-1996-colreg
export const CROSSING_WIND_FROM = 0;
export const CROSSING_PLAYER_HEADING = Math.PI / 4;
export const CROSSING_OTHER_HEADING = -Math.PI / 4;
const OTHER_SPEED = 1.7;
const CLEARANCE = 10;
// Conservative combined hull radius for this small-boat exercise.
const CONTACT = 5;
const MAX_STEP_SPEED = 12;

export interface CrossingObservation {
  x: number; z: number; velocityX: number; velocityZ: number;
  heading: number; rudder: number; unsafe: boolean; sailsRaised: boolean; sailSide: number;
}
export type CrossingStage = "build-speed" | "crossing" | "complete" | "failed";
export class CrossingEncounter {
  stage: CrossingStage = "build-speed";
  failure: "contact" | "conditions" | "timeout" | "unsafe" | undefined;
  other?: { x: number; z: number; heading: number };
  closest = Infinity;
  private previous?: CrossingObservation;
  private previousRelative?: { x: number; z: number };
  private turned = false;
  private closestTime = 0;
  private elapsed = 0;

  interrupt(): void { this.previous = undefined; this.previousRelative = undefined; }

  update(dt: number, player: CrossingObservation): void {
    if (this.stage === "complete" || this.stage === "failed") return;
    if (player.unsafe) { this.failure = "unsafe"; this.stage = "failed"; return; }
    if (!Number.isFinite(dt) || dt <= 0 || dt > .05 || ![player.x, player.z, player.velocityX, player.velocityZ, player.heading, player.rudder, player.sailSide].every(Number.isFinite) || typeof player.sailsRaised !== "boolean") { this.interrupt(); return; }
    if (this.previous && Math.hypot(player.x - this.previous.x, player.z - this.previous.z) > MAX_STEP_SPEED * dt) { this.failure = "conditions"; this.stage = "failed"; return; }
    this.previous = { ...player };
    if (this.stage === "build-speed") {
      const speed = player.velocityX * Math.sin(player.heading) + player.velocityZ * Math.cos(player.heading);
      const difference = Math.atan2(Math.sin(player.heading - CROSSING_PLAYER_HEADING), Math.cos(player.heading - CROSSING_PLAYER_HEADING));
      if (speed < 0.8 || Math.abs(difference) > .12 || !player.sailsRaised || player.sailSide !== 1) return;
      const otherX = Math.sin(CROSSING_OTHER_HEADING) * OTHER_SPEED;
      const otherZ = Math.cos(CROSSING_OTHER_HEADING) * OTHER_SPEED;
      this.other = { x: player.x + (player.velocityX - otherX) * 50, z: player.z + (player.velocityZ - otherZ) * 50, heading: CROSSING_OTHER_HEADING };
      const relativeBearing = Math.atan2(player.x - this.other.x, player.z - this.other.z) - this.other.heading;
      const ownBearing = Math.atan2(this.other.x - player.x, this.other.z - player.z) - player.heading;
      const angle = (n: number) => Math.abs(Math.atan2(Math.sin(n), Math.cos(n)));
      if (angle(relativeBearing) > Math.PI * 0.625 || angle(ownBearing) > Math.PI * 0.625) {
        this.other = undefined; this.failure = "conditions"; this.stage = "failed"; return;
      }
      this.stage = "crossing";
    }
    // The exercise teaches only the known opposite-tack case; stop if it no longer applies.
    if (!player.sailsRaised || player.sailSide !== 1) { this.failure = "conditions"; this.stage = "failed"; return; }
    const other = this.other!;
    other.x += Math.sin(other.heading) * OTHER_SPEED * dt;
    other.z += Math.cos(other.heading) * OTHER_SPEED * dt;
    this.elapsed += dt;
    if (this.elapsed > 100) { this.failure = "timeout"; this.stage = "failed"; return; }
    const relative = { x: player.x - other.x, z: player.z - other.z };
    let distance = Math.hypot(relative.x, relative.z);
    if (this.previousRelative) {
      const dx = relative.x - this.previousRelative.x, dz = relative.z - this.previousRelative.z;
      const fraction = Math.max(0, Math.min(1, -(this.previousRelative.x * dx + this.previousRelative.z * dz) / (dx * dx + dz * dz || 1)));
      distance = Math.min(distance, Math.hypot(this.previousRelative.x + fraction * dx, this.previousRelative.z + fraction * dz));
    }
    this.previousRelative = relative;
    if (distance < this.closest) { this.closest = distance; this.closestTime = this.elapsed; }
    if (distance < CONTACT) { this.failure = "contact"; this.stage = "failed"; return; }
    const turn = Math.atan2(Math.sin(player.heading - CROSSING_PLAYER_HEADING), Math.cos(player.heading - CROSSING_PLAYER_HEADING));
    if (Math.abs(player.rudder) > .01 && Math.abs(turn) > .35 && this.elapsed - this.closestTime <= .1) this.turned = true;
    const behind = relative.x * Math.sin(other.heading) + relative.z * Math.cos(other.heading) < -10;
    const opening = this.elapsed - this.closestTime > 3;
    if (this.turned && Math.abs(turn) > .35 && behind && opening && Math.hypot(player.velocityX, player.velocityZ) > .3) {
      this.stage = this.closest >= CLEARANCE ? "complete" : "failed";
      if (this.stage === "failed") this.failure = "contact";
    }
  }
}

