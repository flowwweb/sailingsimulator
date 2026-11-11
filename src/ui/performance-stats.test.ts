import { describe, expect, it, vi } from "vitest";
import { PerformanceStats } from "./performance-stats";

describe("opt-in performance statistics", () => {
  it("reports callback cadence and averages only actual world renders", () => {
    const output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output);
    stats.record(0);
    for (let i = 1; i <= 19; i++) stats.record(i * 20, { cpuMs: 3, calls: 10, triangles: 100 });
    stats.record(1000);
    expect(output.textContent).toContain("Animation callbacks/s 20 · interval avg 50.0 ms · p95 20.0 ms");
    expect(output.textContent).toContain("World renders 19 · CPU avg 3.0 ms");
    expect(output.textContent).toContain("GPU time not measured (extension unavailable)");
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

  it("averages full callback phases separately from actual world renders", () => {
    const output = { textContent: "" } as HTMLElement, stats = new PerformanceStats(output);
    stats.record(0, { cpuMs: 3, calls: 10, triangles: 100 }, { totalMs: 10, simulationMs: 2, titleCopyMs: 4, uiAudioMs: 1 });
    stats.record(1000, { cpuMs: 9, calls: 20, triangles: 200 }, { totalMs: 20, simulationMs: 5, titleCopyMs: 0, uiAudioMs: 6 });
    expect(output.textContent).toContain("Callback CPU avg 15.0 ms · simulation/setup 3.5 · title copy 2.0 · UI/audio 3.5");
    expect(output.textContent).toContain("World renders 2 · CPU avg 6.0 ms");
    stats.record(2000, undefined, { totalMs: 1, simulationMs: .5, titleCopyMs: 0, uiAudioMs: .5 });
    expect(output.textContent).toContain("Callback CPU avg 1.0 ms");
    expect(output.textContent).toContain("No world renders in this interval");
  });

  it("leaves GPU measurement unavailable when the extension is absent", () => {
    const gpu = gpuFixture(false), output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output, gpu.gl);
    stats.beginGpuRender(); stats.endGpuRender(); stats.record(0); stats.record(1000);
    expect(gpu.createQuery).not.toHaveBeenCalled();
    expect(output.textContent).toContain("GPU time not measured (extension unavailable)");
    expect(output.textContent).not.toContain("GPU completed");
  });

  it("bounds pending queries, reads only available results and reports GPU nanoseconds as milliseconds", () => {
    const gpu = gpuFixture(), output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output, gpu.gl);
    for (let i = 0; i < 12; i++) { stats.beginGpuRender(); stats.endGpuRender(); }
    expect(gpu.createQuery).toHaveBeenCalledTimes(4);
    stats.record(0);
    expect(gpu.resultReads).toBe(0);
    gpu.ready(gpu.created[0]!, 2_500_000);
    stats.record(1000);
    expect(output.textContent).toContain("GPU completed 1 · avg 2.5 ms");
    expect(gpu.resultReads).toBe(1);
    stats.beginGpuRender(); stats.endGpuRender();
    expect(gpu.createQuery).toHaveBeenCalledTimes(5);
  });

  it("discards all disjoint results and resumes only with fresh valid queries", () => {
    const gpu = gpuFixture(), output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output, gpu.gl);
    stats.record(0); stats.beginGpuRender(); stats.endGpuRender(); gpu.ready(gpu.created[0]!, 80_000_000);
    gpu.disjoint = true; stats.record(1000);
    expect(output.textContent).toContain("GPU time unavailable (disjoint)");
    expect(output.textContent).not.toContain("80.0 ms");
    expect(gpu.resultReads).toBe(0); expect(gpu.deleted).toHaveLength(1);
    stats.beginGpuRender(); expect(gpu.createQuery).toHaveBeenCalledTimes(1);
    gpu.disjoint = false; stats.record(1100);
    stats.beginGpuRender(); stats.endGpuRender(); gpu.ready(gpu.created[1]!, 3_000_000); stats.record(2000);
    expect(output.textContent).toContain("GPU completed 1 · avg 3.0 ms");
  });

  it("clears active and pending queries on reset and reacquires support after context restoration", () => {
    const gpu = gpuFixture(), output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output, gpu.gl);
    stats.beginGpuRender(); stats.endGpuRender(); stats.beginGpuRender(); stats.reset();
    expect(gpu.deleted).toHaveLength(2);
    stats.record(60_000); stats.record(61_000);
    expect(output.textContent).toContain("GPU time pending");
    gpu.lost = true; stats.reset(); stats.beginGpuRender(); stats.endGpuRender();
    expect(gpu.createQuery).toHaveBeenCalledTimes(2);
    gpu.lost = false; stats.reset(); stats.beginGpuRender(); stats.endGpuRender();
    expect(gpu.createQuery).toHaveBeenCalledTimes(3);
  });

  it("does not manufacture a duration from invalid GPU results", () => {
    const gpu = gpuFixture(), output = { textContent: "" } as HTMLElement;
    const stats = new PerformanceStats(output, gpu.gl);
    stats.record(0); stats.beginGpuRender(); stats.endGpuRender(); gpu.ready(gpu.created[0]!, NaN); stats.record(1000);
    expect(output.textContent).toContain("GPU time pending");
    expect(output.textContent).not.toContain("GPU completed");
  });

  it("keeps a bounded last30s live summary while excluding entry and cached-title intervals", () => {
    const output = { textContent: "" } as HTMLElement, stats = new PerformanceStats(output);
    const cpu = { totalMs: 5, simulationMs: 1, titleCopyMs: 0, uiAudioMs: 2 };
    stats.record(0, { cpuMs: 100, calls: 10, triangles: 100, mode: "title" }, { ...cpu, totalMs: 120 });
    stats.record(1000);
    expect(output.textContent).toContain("waiting for a full sailing interval");
    stats.record(2000, { cpuMs: 500, calls: 10, triangles: 100, mode: "sailing" }, { ...cpu, totalMs: 600 });
    expect(output.textContent).toContain("waiting for a full sailing interval");
    for (let i = 3; i <= 37; i++) stats.record(i * 1000, { cpuMs: 2, calls: 10, triangles: 100, mode: "sailing" }, cpu);
    expect(output.textContent).toContain("Live last 30 s · sampled 30.0 s · callbacks/s 1 · renders 30 · callback CPU 5.0 ms · world CPU 2.0 ms");
    expect(output.textContent).toContain("Entry sailing frame · callback CPU 600.0 ms · world CPU 500.0 ms");
    stats.record(100_000, { cpuMs: 2, calls: 10, triangles: 100, mode: "sailing" }, cpu);
    expect(output.textContent).toContain("waiting for a full sailing interval");
    stats.record(101_000, { cpuMs: 80, calls: 10, triangles: 100, mode: "title" });
    for (let i = 102; i <= 134; i++) stats.record(i * 1000);
    expect(output.textContent).toContain("waiting for a full sailing interval");
    expect(output.textContent).toContain("No world renders in this interval");
  });

  it("keeps delayed title and entry GPU results out of the live sailing aggregate", () => {
    const gpu = gpuFixture(), output = { textContent: "" } as HTMLElement, stats = new PerformanceStats(output, gpu.gl);
    const frame = (now: number, mode: "title" | "sailing", milliseconds: number, ready = true) => {
      stats.beginGpuRender(mode); stats.endGpuRender();
      const query = gpu.created.at(-1)!; if (ready) gpu.ready(query, milliseconds * 1_000_000);
      stats.record(now, { cpuMs: 2, calls: 10, triangles: 100, mode }, { totalMs: 5, simulationMs: 1, titleCopyMs: 0, uiAudioMs: 2 });
    };
    frame(0, "title", 90, false); stats.record(1000);
    frame(2000, "sailing", 80, false);
    gpu.ready(gpu.created[0]!, 90_000_000); gpu.ready(gpu.created[1]!, 80_000_000);
    frame(3000, "sailing", 4); frame(4000, "sailing", 6);
    expect(output.textContent).toContain("Live last 30 s · sampled 2.0 s");
    expect(output.textContent).toContain("GPU 5.0 ms (2 completed)");
    expect(output.textContent).not.toContain("GPU 80.0 ms");
  });
});

function gpuFixture(supported = true) {
  const created: WebGLQuery[] = [], deleted: WebGLQuery[] = [];
  const results = new Map<WebGLQuery, { available: boolean; value: number }>();
  const createQuery = vi.fn(() => {
    const query = {} as WebGLQuery; created.push(query); results.set(query, { available: false, value: 0 }); return query;
  });
  const state = { disjoint: false, lost: false, resultReads: 0 };
  const gl = { QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
    isContextLost: () => state.lost, getParameter: () => state.disjoint, createQuery,
    beginQuery() {}, endQuery() {}, deleteQuery: (query: WebGLQuery) => deleted.push(query),
    getQueryParameter: (query: WebGLQuery, parameter: number) => {
      const result = results.get(query)!;
      if (parameter === 1) return result.available;
      if (!result.available) throw new Error("A pending GPU result must never be read");
      state.resultReads++; return result.value;
    } } as unknown as WebGL2RenderingContext;
  return { gl, created, deleted, createQuery,
    get resultReads() { return state.resultReads; },
    get disjoint() { return state.disjoint; }, set disjoint(value: boolean) { state.disjoint = value; },
    get lost() { return state.lost; }, set lost(value: boolean) { state.lost = value; },
    ready(query: WebGLQuery, value: number) { results.set(query, { available: true, value }); } };
}
