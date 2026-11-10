interface LiveBucket {
  end: number;
  elapsedMs: number;
  frames: number;
  renders: number;
  renderMs: number;
  cpuFrames: number;
  callbackMs: number;
  gpuSamples: number;
  gpuMs: number;
}

/** Opt-in diagnostics. CPU phases exclude stats reporting; GPU results arrive asynchronously. */
export class PerformanceStats {
  private frames: number[] = [];
  private elapsed = 0;
  private previousTime: number | undefined;
  private renders = 0;
  private renderMs = 0;
  private calls = 0;
  private maxCalls = 0;
  private triangles = 0;
  private cpuFrames = 0;
  private callbackMs = 0;
  private simulationMs = 0;
  private titleCopyMs = 0;
  private uiAudioMs = 0;
  private gpuExtension?: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  private activeGpuQuery?: { query: WebGLQuery; live: boolean };
  private readonly pendingGpuQueries: { query: WebGLQuery; live: boolean }[] = [];
  private gpuDisjoint = false;
  private gpuSamples = 0;
  private gpuMs = 0;
  private gpuLiveSamples = 0;
  private gpuLiveMs = 0;
  private lastRenderMode?: "title" | "sailing";
  private entryFrame?: { mode: "title" | "sailing"; worldMs: number; callbackMs?: number };
  private entryBucket = false;
  private titleBucket = false;
  private readonly liveBuckets: LiveBucket[] = [];

  constructor(private readonly output: HTMLElement, private readonly gl?: WebGL2RenderingContext) {
    this.gpuExtension = gl?.getExtension("EXT_disjoint_timer_query_webgl2") ?? undefined;
  }

  reset(): void {
    this.clearSamples();
    this.output.textContent = "";
    this.previousTime = undefined;
    this.discardGpuQueries();
    this.gpuDisjoint = false;
    this.lastRenderMode = undefined;
    this.entryFrame = undefined;
    this.liveBuckets.length = 0;
    this.gpuExtension = this.gl && !this.gl.isContextLost()
      ? this.gl.getExtension("EXT_disjoint_timer_query_webgl2") ?? undefined : undefined;
  }

  private clearSamples(): void {
    this.frames = [];
    this.elapsed = this.renders = this.renderMs = this.calls = this.maxCalls = this.triangles = 0;
    this.cpuFrames = this.callbackMs = this.simulationMs = this.titleCopyMs = this.uiAudioMs = 0;
    this.gpuSamples = this.gpuMs = 0;
    this.gpuLiveSamples = this.gpuLiveMs = 0;
    this.entryBucket = this.titleBucket = false;
  }

  beginGpuRender(mode: "title" | "sailing" = "sailing"): void {
    const gl = this.gl, extension = this.gpuExtension;
    if (!gl || !extension || this.gpuDisjoint || gl.isContextLost() || this.activeGpuQuery || this.pendingGpuQueries.length >= 4) return;
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    this.activeGpuQuery = { query, live: mode === "sailing" && this.lastRenderMode === "sailing" && !this.entryBucket };
  }

  endGpuRender(): void {
    if (!this.activeGpuQuery || !this.gl || !this.gpuExtension) return;
    this.gl.endQuery(this.gpuExtension.TIME_ELAPSED_EXT);
    this.pendingGpuQueries.push(this.activeGpuQuery);
    this.activeGpuQuery = undefined;
  }

  private discardGpuQueries(): void {
    if (this.activeGpuQuery && this.gl && this.gpuExtension) {
      this.gl.endQuery(this.gpuExtension.TIME_ELAPSED_EXT);
      this.gl.deleteQuery(this.activeGpuQuery.query);
      this.activeGpuQuery = undefined;
    }
    for (const { query } of this.pendingGpuQueries) this.gl?.deleteQuery(query);
    this.pendingGpuQueries.length = 0;
  }

  private pollGpuQueries(): void {
    const gl = this.gl, extension = this.gpuExtension;
    if (!gl || !extension) return;
    if (gl.isContextLost() || gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      this.gpuDisjoint = true;
      this.gpuSamples = this.gpuMs = 0;
      this.gpuLiveSamples = this.gpuLiveMs = 0;
      for (const bucket of this.liveBuckets) bucket.gpuSamples = bucket.gpuMs = 0;
      this.discardGpuQueries();
      return;
    }
    this.gpuDisjoint = false;
    while (this.pendingGpuQueries.length) {
      const { query, live } = this.pendingGpuQueries[0]!;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const nanoseconds: unknown = gl.getQueryParameter(query, gl.QUERY_RESULT);
      gl.deleteQuery(query);
      this.pendingGpuQueries.shift();
      if (typeof nanoseconds === "number" && Number.isFinite(nanoseconds) && nanoseconds >= 0) {
        this.gpuMs += nanoseconds / 1_000_000;
        this.gpuSamples++;
        if (live) { this.gpuLiveSamples++; this.gpuLiveMs += nanoseconds / 1_000_000; }
      }
    }
  }

  record(now: number, render?: { cpuMs: number; calls: number; triangles: number; mode?: "title" | "sailing" },
    cpu?: { totalMs: number; simulationMs: number; titleCopyMs: number; uiAudioMs: number }): void {
    if (!Number.isFinite(now)) return;
    this.pollGpuQueries();
    const frameMs = this.previousTime === undefined ? 0 : now - this.previousTime;
    this.previousTime = now;
    while (this.liveBuckets.length && now - this.liveBuckets[0]!.end + this.liveBuckets[0]!.elapsedMs > 30_000) this.liveBuckets.shift();
    if (render) {
      const mode = render.mode ?? "sailing";
      if (mode !== this.lastRenderMode) {
        this.entryBucket = true;
        this.entryFrame = { mode, worldMs: render.cpuMs, callbackMs: cpu?.totalMs };
        this.lastRenderMode = mode;
      }
      this.titleBucket ||= mode === "title";
      this.renders++;
      this.renderMs += render.cpuMs;
      this.calls += render.calls;
      this.maxCalls = Math.max(this.maxCalls, render.calls);
      this.triangles += render.triangles;
    }
    if (cpu) {
      this.cpuFrames++;
      this.callbackMs += cpu.totalMs;
      this.simulationMs += cpu.simulationMs;
      this.titleCopyMs += cpu.titleCopyMs;
      this.uiAudioMs += cpu.uiAudioMs;
    }
    if (frameMs <= 0) return;
    this.frames.push(frameMs);
    this.elapsed += frameMs;
    if (this.elapsed < 1000) return;
    const count = this.frames.length;
    this.frames.sort((a, b) => a - b);
    const p95 = this.frames[Math.ceil(count * 0.95) - 1]!;
    if (this.renders && !this.titleBucket && !this.entryBucket && this.elapsed <= 30_000) {
      this.liveBuckets.push({ end: now, elapsedMs: this.elapsed, frames: count, renders: this.renders,
        renderMs: this.renderMs, cpuFrames: this.cpuFrames, callbackMs: this.callbackMs,
        gpuSamples: this.gpuLiveSamples, gpuMs: this.gpuLiveMs });
      while (this.liveBuckets.length > 30) this.liveBuckets.shift();
    }
    const gpuSummary = !this.gpuExtension ? "GPU time not measured (extension unavailable)"
      : this.gpuDisjoint ? "GPU time unavailable (disjoint)"
      : this.gpuSamples ? `GPU completed ${this.gpuSamples} · avg ${(this.gpuMs / this.gpuSamples).toFixed(1)} ms`
      : "GPU time pending";
    const renderSummary = this.renders
      ? `World renders ${this.renders} · CPU avg ${(this.renderMs / this.renders).toFixed(1)} ms\nDraws avg ${Math.round(this.calls / this.renders)} / peak ${this.maxCalls} · triangles avg ${Math.round(this.triangles / this.renders)} · ${gpuSummary}`
      : `No world renders in this interval · ${gpuSummary}`;
    const cpuSummary = this.cpuFrames
      ? `\nCallback CPU avg ${(this.callbackMs / this.cpuFrames).toFixed(1)} ms · simulation/setup ${(this.simulationMs / this.cpuFrames).toFixed(1)} · title copy ${(this.titleCopyMs / this.cpuFrames).toFixed(1)} · UI/audio ${(this.uiAudioMs / this.cpuFrames).toFixed(1)}` : "";
    let liveElapsed = 0, liveFrames = 0, liveRenders = 0, liveRenderMs = 0, liveCpuFrames = 0, liveCpuMs = 0, liveGpuSamples = 0, liveGpuMs = 0;
    for (const bucket of this.liveBuckets) {
      liveElapsed += bucket.elapsedMs; liveFrames += bucket.frames; liveRenders += bucket.renders; liveRenderMs += bucket.renderMs;
      liveCpuFrames += bucket.cpuFrames; liveCpuMs += bucket.callbackMs; liveGpuSamples += bucket.gpuSamples; liveGpuMs += bucket.gpuMs;
    }
    const liveGpu = !this.gpuExtension || this.gpuDisjoint ? "GPU unavailable"
      : liveGpuSamples ? `GPU ${(liveGpuMs / liveGpuSamples).toFixed(1)} ms (${liveGpuSamples} completed)` : "GPU pending";
    const liveSummary = liveElapsed
      ? `Live last 30 s · sampled ${(liveElapsed / 1000).toFixed(1)} s · callbacks/s ${(liveFrames * 1000 / liveElapsed).toFixed(0)} · renders ${liveRenders} · callback CPU ${liveCpuFrames ? `${(liveCpuMs / liveCpuFrames).toFixed(1)} ms` : "unmeasured"} · world CPU ${(liveRenderMs / liveRenders).toFixed(1)} ms · ${liveGpu}`
      : "Live last 30 s · waiting for a full sailing interval (entry and cached title excluded)";
    const entrySummary = this.entryFrame
      ? `\nEntry ${this.entryFrame.mode} frame · ${this.entryFrame.callbackMs === undefined ? "" : `callback CPU ${this.entryFrame.callbackMs.toFixed(1)} ms · `}world CPU ${this.entryFrame.worldMs.toFixed(1)} ms · entry interval excluded from live summary` : "";
    this.output.textContent = `Animation callbacks/s ${(count * 1000 / this.elapsed).toFixed(0)} · interval avg ${(this.elapsed / count).toFixed(1)} ms · p95 ${p95.toFixed(1)} ms${cpuSummary}\n${renderSummary}\n${liveSummary}${entrySummary}`;
    this.clearSamples();
  }
}
