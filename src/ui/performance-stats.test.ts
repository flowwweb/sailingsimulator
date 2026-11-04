import { describe, expect, it } from "vitest";
import { PerformanceStats } from "./performance-stats";

describe("opt-in performance statistics", () => {
  it("summarizes actual frame intervals and both average and peak draw counts", () => {
    const output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output);
    for (let i = 0; i < 19; i++) stats.record(20, 3, 10, 100);
    stats.record(620, 20, 30, 200);
    expect(output.textContent).toContain("FPS 20 · frame avg 50.0 ms · p95 20.0 ms");
    expect(output.textContent).toContain("Render CPU 3.9 ms · GPU time not measured");
    expect(output.textContent).toContain("Draws avg 11 / peak 30 · triangles avg 105");
  });

  it("discards samples on reset and ignores invalid frame intervals", () => {
    const output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output);
    stats.record(Number.NaN, 0, 0, 0);
    stats.record(900, 0, 0, 0);
    stats.reset();
    stats.record(100, 1, 2, 3);
    expect(output.textContent).toBe("");
  });
});
