/** Opt-in browser diagnostics; render time is CPU wall time, not GPU time. */
export class PerformanceStats {
  private frames: number[] = [];
  private elapsed = 0;
  private previousTime: number | undefined;
  private renders = 0;
  private renderMs = 0;
  private calls = 0;
  private maxCalls = 0;
  private triangles = 0;

  constructor(private readonly output: HTMLElement) {}

  reset(): void {
    this.clearSamples();
    this.previousTime = undefined;
  }

  private clearSamples(): void {
    this.frames = [];
    this.elapsed = this.renders = this.renderMs = this.calls = this.maxCalls = this.triangles = 0;
  }

  record(now: number, render?: { cpuMs: number; calls: number; triangles: number }): void {
    if (!Number.isFinite(now)) return;
    const frameMs = this.previousTime === undefined ? 0 : now - this.previousTime;
    this.previousTime = now;
    if (render) {
      this.renders++;
      this.renderMs += render.cpuMs;
      this.calls += render.calls;
      this.maxCalls = Math.max(this.maxCalls, render.calls);
      this.triangles += render.triangles;
    }
    if (frameMs <= 0) return;
    this.frames.push(frameMs);
    this.elapsed += frameMs;
    if (this.elapsed < 1000) return;
    const count = this.frames.length;
    this.frames.sort((a, b) => a - b);
    const p95 = this.frames[Math.ceil(count * 0.95) - 1]!;
    const renderSummary = this.renders
      ? `World renders ${this.renders} · CPU avg ${(this.renderMs / this.renders).toFixed(1)} ms · GPU time not measured\nDraws avg ${Math.round(this.calls / this.renders)} / peak ${this.maxCalls} · triangles avg ${Math.round(this.triangles / this.renders)}`
      : "No world renders in this interval · GPU time not measured";
    this.output.textContent = `Animation callbacks/s ${(count * 1000 / this.elapsed).toFixed(0)} · interval avg ${(this.elapsed / count).toFixed(1)} ms · p95 ${p95.toFixed(1)} ms\n${renderSummary}`;
    this.clearSamples();
  }
}
