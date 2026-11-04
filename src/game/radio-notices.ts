export class RadioNotices {
  private elapsed = 0;
  private sent = false;

  reset(): void {
    this.elapsed = 0;
    this.sent = false;
  }

  update(dt: number, courseActive: boolean, busy: boolean): boolean {
    if (!courseActive || this.sent || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return false;
    this.elapsed += dt;
    if (this.elapsed < 30 || busy) return false;
    this.sent = true;
    return true;
  }
}
