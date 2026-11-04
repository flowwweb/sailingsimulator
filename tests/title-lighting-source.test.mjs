import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const world = readFileSync(new URL("../src/render/world.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

test("camera reset refreshes lighting and reflection even when title time is frozen", () => {
  const start = world.indexOf("  resetCamera(): void {");
  const end = world.indexOf("\n  resetWake()", start);
  assert.ok(start >= 0 && end > start);
  const reset = world.slice(start, end).replace("resetCamera(): void", "function resetCamera()");
  const state = { cameraInitialized: true, renderClock: 4, lastAtmosphereAt: 4, lastReflectionAt: 4 };
  runInNewContext(`${reset}; resetCamera.call(state);`, { state });
  assert.equal(state.cameraInitialized, false);
  assert.equal(state.lastAtmosphereAt, Number.NEGATIVE_INFINITY);
  assert.equal(state.lastReflectionAt, Number.NEGATIVE_INFINITY);
  assert.ok(state.renderClock - state.lastAtmosphereAt >= 1 / 15);
  assert.match(world, /this\.updateAtmosphere\(weather, titleScene\)/);
  assert.match(world, /this\.renderer\.shadowMap\.needsUpdate = true/);
  assert.match(main, /addEventListener\("webglcontextrestored"[^\n]*world\.resize\(\); world\.resetCamera\(\)/);
  assert.match(main, /window\.addEventListener\("resize", \(\) => \{\s*titleFrameDirty = true;\s*world\.resize\(\);\s*if \(!started\) world\.resetCamera\(\)/);
});
