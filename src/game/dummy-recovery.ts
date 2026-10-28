// Provisional game thresholds; validate against playtesting, not real rescue guidance.
const DEPARTURE_M = 40;
const RECOVERY_RADIUS_M = 8;
const DUMMY_CLEARANCE_M = 0.7;
const RECOVERY_SPEED_MPS = 0.5;
const MAX_STEP_MPS = 12;
const HOLD_SECONDS = 3;

export type RecoveryStage = "depart" | "return" | "ready" | "complete" | "failed";

export class DummyRecovery {
  stage: RecoveryStage = "depart";
  private previous?: { x: number; z: number };
  private previousSheet?: number;
  private previousHeading?: number;
  private startedNearDummy = false;
  private hold = 0;
  private initialSheet?: number;
  private initialHeading?: number;
  private trimmed = false;
  private steered = false;

  constructor(readonly target: { x: number; z: number }, readonly hull: { halfLength: number; halfBeam: number }) {}

  interrupt(): void {
    this.previous = undefined;
    this.previousSheet = undefined;
    this.previousHeading = undefined;
    this.hold = 0;
    this.initialSheet = undefined;
    this.initialHeading = undefined;
    this.trimmed = false;
    this.steered = false;
    if (this.stage === "depart") this.startedNearDummy = false;
    if (this.stage === "ready") this.stage = "return";
  }

  update(dt: number, position: { x: number; z: number }, speed: number, unsafe: boolean, sheet: number, sheetRate: number, heading: number, rudder: number, yawRate: number): void {
    if (this.stage === "complete" || this.stage === "failed") return;
    if (unsafe) { this.stage = "failed"; this.interrupt(); return; }
    if (![dt, position.x, position.z, speed, sheet, sheetRate, heading, rudder, yawRate].every(Number.isFinite) || dt <= 0 || dt > 0.05 || speed < 0) {
      this.interrupt();
      return;
    }
    if (this.previous && Math.hypot(position.x - this.previous.x, position.z - this.previous.z) > MAX_STEP_MPS * dt) {
      this.stage = "failed";
      this.interrupt();
      return;
    }
    const distance = Math.hypot(position.x - this.target.x, position.z - this.target.z);
    if (!Number.isFinite(distance)) { this.interrupt(); return; }
    const dx = this.target.x - position.x;
    const dz = this.target.z - position.z;
    const alongHull = dx * Math.sin(heading) + dz * Math.cos(heading);
    const acrossHull = dx * Math.cos(heading) - dz * Math.sin(heading);
    const contact = Math.abs(alongHull) <= this.hull.halfLength + DUMMY_CLEARANCE_M && Math.abs(acrossHull) <= this.hull.halfBeam + DUMMY_CLEARANCE_M;
    if (this.stage !== "depart" && contact) { this.stage = "failed"; this.interrupt(); return; }
    if (this.stage === "depart" && distance <= RECOVERY_RADIUS_M) this.startedNearDummy = true;
    if (this.stage === "depart" && this.startedNearDummy && this.previous && distance >= DEPARTURE_M) this.stage = "return";
    const hadPrevious = Boolean(this.previous);
    this.previous = { ...position };
    if (Math.abs(sheetRate) > 0 && this.previousSheet !== undefined) { this.initialSheet ??= this.previousSheet; this.trimmed ||= Math.abs(sheet - this.initialSheet) > 0.02; }
    if (Math.abs(rudder) > 0.01) {
      this.initialHeading ??= this.previousHeading ?? heading;
      const turn = heading - this.initialHeading;
      this.steered ||= Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.03;
    }
    this.previousSheet = sheet;
    this.previousHeading = heading;
    if (this.stage === "return" || this.stage === "ready") {
      const settled = hadPrevious && this.trimmed && this.steered && distance <= RECOVERY_RADIUS_M && Math.abs(alongHull) <= this.hull.halfLength && speed <= RECOVERY_SPEED_MPS && Math.abs(yawRate) < 0.12;
      this.hold = settled ? this.hold + dt : 0;
      this.stage = this.hold >= HOLD_SECONDS ? "ready" : "return";
    }
  }

  recover(): boolean {
    if (this.stage !== "ready" || !this.previous) return false;
    this.stage = "complete";
    return true;
  }
}
