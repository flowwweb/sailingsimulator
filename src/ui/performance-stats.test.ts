import { describe, expect, it } from "vitest";
import { PerformanceStats } from "./performance-stats";

describe("opt-in performance statistics", () => {
  it("reports callback cadence and averages only actual world renders", () => {
    const output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output);
    stats.record(0);
    for (let i = 1; i <= 19; i++) stats.record(i * 20, { cpuMs: 3, calls: 10, triangles: 100 });
    stats.record(1000);
    expect(output.textContent).toContain("Animation callbacks/s 20 · interval avg 50.0 ms · p95 20.0 ms");
    expect(output.textContent).toContain("World renders 19 · CPU avg 3.0 ms · GPU time not measured");
    expect(output.textContent).toContain("Draws avg 10 / peak 10 · triangles avg 100");
  });

  it("drops the first interval after a visibility reset", () => {
    const output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output);
    stats.record(0); stats.record(900); stats.reset();
    stats.record(60_000); stats.record(60_100);
    expect(output.textContent).toBe("");
    stats.record(61_000);
    expect(output.textContent).toContain("Animation callbacks/s 2 · interval avg 500.0 ms");
    expect(output.textContent).toContain("No world renders in this interval");
  });
});
