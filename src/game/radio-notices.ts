export class RadioNotices {
  private elapsed = 0;
  private nextAt = 30;

  reset(): void {
    this.elapsed = 0;
    this.nextAt = 30;
  }

  update(dt: number, courseActive: boolean, busy: boolean): boolean {
    if (!courseActive || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return false;
    this.elapsed += dt;
    if (this.elapsed < this.nextAt || busy) return false;
    this.nextAt = this.elapsed + 180;
    return true;
  }
}
