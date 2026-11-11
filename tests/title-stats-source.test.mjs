import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";

function fixture() {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = source.indexOf("  const renderScene = !webglContextLost");
  const end = source.indexOf("  requestAnimationFrame(loop);", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  const statsSource = readFileSync(new URL("../src/ui/performance-stats.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(statsSource, { mode: "transform" }).replace(/^export /gm, "");
  const output = { textContent: "" };
  const performanceStats = runInNewContext(`${js}\nnew PerformanceStats(output)`, { output });
  let renders = 0, clock = 7, copies = 0, hudUpdates = 0, gpuBegins = 0;
  const beginGpu = performanceStats.beginGpuRender.bind(performanceStats);
  performanceStats.beginGpuRender = mode => { gpuBegins++; beginGpu(mode); };
  const ctx = { webglContextLost: false, started: false, document: { hidden: false }, titleFrameDirty: true,
    titleFrameContext: { drawImage() { copies++; clock += 20; } }, titleFrame: { width: 0, height: 0, hidden: true }, canvas: { width: 800, height: 450 },
    FIRST_BUOY_MARKS: [], firstBuoy: undefined, anchorage: undefined, state: {}, weather: { tideLevel: 0 }, performanceStats, performance: { now: () => clock },
    world: { setWorldObjectVisible() {}, setAnchorRode() {}, renderer: { info: { reset() {}, render: { calls: 25, triangles: 100 } } }, render() { renders++; clock += 10; } },
    renderPrevious: {}, renderCurrent: {}, renderDiagnostics: {}, renderHeadsail: {}, renderWeather: {},
    accumulator: 0, fixedStep: 1/60, simulationPaused: false, frameDt: 1/60, incident: undefined, incidentElapsed: 0,
    progress: { voyages: 0 }, presentationTime: 0, finishBoot() { clock++; }, now: 0,
    callbackStart: 0, simulationEnd: 7, renderSample: undefined, titleCopyMs: 0,
    updateCompass() { clock++; }, audio: { update() { clock += 3; } }, FAIR_WINDS_WORLD: {},
    hudUpdateElapsed: 0, updateHud() { hudUpdates++; clock += 5; }, elements: { gameShell: { dataset: {} } }, simulationTime: 0 };
  const tick = (now) => { clock = 7; ctx.now = now; ctx.renderSample = undefined; ctx.titleCopyMs = 0; runInNewContext(`(() => { ${block} })()`, ctx); };
  return { ctx, tick, output, performanceStats, get renders() { return renders; }, get copies() { return copies; },
    get hudUpdates() { return hudUpdates; }, get gpuBegins() { return gpuBegins; } };
}

test("cached title callbacks omit render samples and resume discards hidden time", () => {
  const f = fixture(), { tick, output, performanceStats, ctx } = f;
  tick(0);
  for (let i = 1; i <= 10; i++) tick(i * 100);
  assert.equal(f.renders, 1); assert.equal(f.gpuBegins, 1); assert.equal(f.copies, 1);
  assert.match(output.textContent, /World renders 1 · CPU avg/);
  assert.match(output.textContent, /Draws avg 25 \/ peak 25/);
  const beforeHidden = output.textContent;
  ctx.document.hidden = true; tick(59_000);
  assert.equal(output.textContent, beforeHidden); assert.equal(f.gpuBegins, 1);
  ctx.document.hidden = false;
  performanceStats.reset();
  tick(60_000);
  tick(61_000);
  assert.match(output.textContent, /interval avg 1000\.0 ms/);
  assert.match(output.textContent, /No world renders in this interval/);
  ctx.started = true;
  tick(61_100);
  assert.equal(f.renders, 2); assert.equal(f.gpuBegins, 2);
});

test("the actual callback tail attributes title capture and active HUD/audio beyond world render", () => {
  const f = fixture(); f.tick(0); f.tick(1000);
  assert.match(f.output.textContent, /Callback CPU avg 25\.5 ms · simulation\/setup 7\.0 · title copy 10\.0 · UI\/audio 3\.5/);
  assert.match(f.output.textContent, /World renders 1 · CPU avg 10\.0 ms/);
  f.performanceStats.reset(); f.ctx.started = true; f.ctx.frameDt = .1;
  f.tick(2000); f.tick(3000);
  assert.equal(f.hudUpdates, 2);
  assert.match(f.output.textContent, /Callback CPU avg 27\.0 ms · simulation\/setup 7\.0 · title copy 0\.0 · UI\/audio 10\.0/);
  assert.match(f.output.textContent, /World renders 2 · CPU avg 10\.0 ms/);
});

test("the actual callback labels paused world draws separately from live sailing and warms up resume", () => {
  const f = fixture(); f.tick(0); f.tick(1000);
  f.ctx.started = true;
  f.ctx.simulationPaused = true;
  for (let now = 2000; now <= 34_000; now += 1000) f.tick(now);
  assert.ok(f.renders > 1, "this correction classifies existing work; it does not cache or disable rendering");
  assert.match(f.output.textContent, /Entry paused frame/);
  assert.match(f.output.textContent, /Live last 30 s · waiting/);
  f.ctx.simulationPaused = false;
  f.tick(35_000);
  assert.match(f.output.textContent, /Entry sailing frame/);
  assert.match(f.output.textContent, /Live last 30 s · waiting/);
  f.tick(36_000);
  assert.match(f.output.textContent, /Live last 30 s · sampled 1.0 s/);
});

test("GPU context probing exists only inside the explicit stats opt-in", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("const performanceStats = new URLSearchParams");
  const end = main.indexOf("const input =", start);
  assert.ok(start >= 0 && end > start);
  const stats = stripTypeScriptTypes(readFileSync(new URL("../src/ui/performance-stats.ts", import.meta.url), "utf8"), { mode: "transform" }).replace(/^export /gm, "");
  const factory = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
  for (const search of ["", "?stats=0", "?stats=1"]) {
    let contexts = 0, extensions = 0;
    const result = runInNewContext(`${stats}\n${factory}\nperformanceStats`, { URLSearchParams, location: { search },
      world: { renderer: { info: {}, getContext() { contexts++; return { createQuery() {}, getExtension() { extensions++; return null; } }; } } },
      document: { createElement: () => ({ setAttribute() {} }), body: { append() {} }, addEventListener() {} } });
    assert.equal(Boolean(result), search === "?stats=1");
    assert.equal(contexts, search === "?stats=1" ? 1 : 0); assert.equal(extensions, contexts);
  }
});
