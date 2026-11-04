import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";

test("cached title callbacks omit render samples and resume discards hidden time", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = source.indexOf("  const renderScene = !webglContextLost");
  const end = source.indexOf("\n  if (started) updateCompass", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  const statsSource = readFileSync(new URL("../src/ui/performance-stats.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(statsSource, { mode: "transform" }).replace(/^export /gm, "");
  const output = { textContent: "" };
  const performanceStats = runInNewContext(`${js}\nnew PerformanceStats(output)`, { output });
  let renders = 0;
  const ctx = { webglContextLost: false, started: false, document: { hidden: false }, titleFrameDirty: true,
    titleFrameContext: { drawImage() {} }, titleFrame: { width: 0, height: 0, hidden: true }, canvas: { width: 800, height: 450 },
    FIRST_BUOY_MARKS: [], firstBuoy: undefined, anchorage: undefined, state: {}, weather: { tideLevel: 0 }, performanceStats, performance: { now: () => 0 },
    world: { setWorldObjectVisible() {}, setAnchorRode() {}, renderer: { info: { reset() {}, render: { calls: 25, triangles: 100 } } }, render() { renders++; } },
    renderPrevious: {}, renderCurrent: {}, renderDiagnostics: {}, renderHeadsail: {}, renderWeather: {},
    accumulator: 0, fixedStep: 1/60, simulationPaused: false, frameDt: 1/60, incident: undefined, incidentElapsed: 0,
    progress: { voyages: 0 }, presentationTime: 0, finishBoot() {}, now: 0 };
  const tick = (now) => { ctx.now = now; runInNewContext(`(() => { ${block} })()`, ctx); };
  tick(0);
  for (let i = 1; i <= 10; i++) tick(i * 100);
  assert.equal(renders, 1);
  assert.match(output.textContent, /World renders 1 · CPU avg/);
  assert.match(output.textContent, /Draws avg 25 \/ peak 25/);
  performanceStats.reset();
  tick(60_000);
  tick(61_000);
  assert.match(output.textContent, /interval avg 1000\.0 ms/);
  assert.match(output.textContent, /No world renders in this interval/);
  ctx.started = true;
  tick(61_100);
  assert.equal(renders, 2);
});
