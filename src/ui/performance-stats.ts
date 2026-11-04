/** Opt-in browser diagnostics; render time is CPU submission, not GPU time. */
export class PerformanceStats {
  private frames: number[] = [];
  private elapsed = 0;
  private renderMs = 0;
  private calls = 0;
  private maxCalls = 0;
  private triangles = 0;

  constructor(private readonly output: HTMLElement) {}

  reset(): void {
    this.frames = [];
    this.elapsed = this.renderMs = this.calls = this.maxCalls = this.triangles = 0;
  }

  record(frameMs: number, renderMs: number, calls: number, triangles: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.frames.push(frameMs);
    this.elapsed += frameMs;
    this.renderMs += renderMs;
    this.calls += calls;
    this.maxCalls = Math.max(this.maxCalls, calls);
    this.triangles += triangles;
    if (this.elapsed < 1000) return;
    const count = this.frames.length;
    this.frames.sort((a, b) => a - b);
    const p95 = this.frames[Math.ceil(count * 0.95) - 1]!;
    this.output.textContent = `FPS ${(count * 1000 / this.elapsed).toFixed(0)} · frame avg ${(this.elapsed / count).toFixed(1)} ms · p95 ${p95.toFixed(1)} ms\nRender CPU ${(this.renderMs / count).toFixed(1)} ms · GPU time not measured\nDraws avg ${Math.round(this.calls / count)} / peak ${this.maxCalls} · triangles avg ${Math.round(this.triangles / count)}`;
    this.reset();
  }
}
