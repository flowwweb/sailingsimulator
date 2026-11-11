import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../src/render/world.ts", import.meta.url), "utf8");
const start = source.indexOf("    const atmosphereDue =");
const end = source.indexOf("    this.renderer.render(this.scene, this.renderCamera);", start);
assert.ok(start >= 0 && end > start, "render scheduling block exists");
const schedule = new Function("weather", "titleScene", "titleScreen", "frameDt", source.slice(start, end));

function run(fps, titleScreen) {
  const frames = [];
  const world = {
    renderClock: 0, lastAtmosphereAt: -Infinity, lastReflectionAt: -Infinity,
    reflectionInterval: 1 / 24, titleReflectionDeferred: false,
    updateAtmosphere() { frames.at(-1).atmosphere = true; },
    updateReflection() { frames.at(-1).reflection = true; },
  };
  for (let i = 0; i < fps * 3; i++) {
    world.renderClock = i / fps;
    frames.push({ atmosphere: false, reflection: false,
      reflectionDue: world.renderClock - world.lastReflectionAt >= world.reflectionInterval,
      deferredBefore: world.titleReflectionDeferred,
      hadReflection: Number.isFinite(world.lastReflectionAt) });
    schedule.call(world, {}, "arrival", titleScreen, 1 / fps);
  }
  return frames;
}

test("title reflections defer at most one frame when a shadow update coincides", () => {
  for (const fps of [30, 60]) {
    const frames = run(fps, true);
    assert.ok(frames.some(frame => frame.reflection));
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].atmosphere && frames[i].reflectionDue && frames[i].hadReflection && !frames[i].deferredBefore) {
        assert.equal(frames[i].reflection, false);
        if (i + 1 < frames.length) assert.equal(frames[i + 1].reflection, true);
      }
    }
  }
});

test("low frame rates never defer a due reflection", () => {
  for (const fps of [10, 15]) {
    for (const frame of run(fps, true)) {
      if (frame.reflectionDue) assert.equal(frame.reflection, true);
    }
  }
});

test("non-title rendering does not defer coincident passes", () => {
  assert.ok(run(60, false).some(frame => frame.atmosphere && frame.reflection));
});

test("reflection skips the redundant automatic-mode clear and preserves its manual fallback and pass state", () => {
  const start = source.indexOf("  private updateReflection(): void {");
  const end = source.indexOf("\n  }", start) + 4;
  assert.ok(start >= 0 && end > start);
  const reflection = new Function(`${stripTypeScriptTypes(source.slice(start, end).replace("  private updateReflection", "function updateReflection"), { mode: "strip" })}\nreturn updateReflection;`)();
  const chain = () => ({ y: 0, set() { return this; }, copy(value) { this.y = value?.y ?? 0; return this; }, add() { return this; }, multiply() { return this; } });
  for (const autoClear of [true, false]) {
    let clears = 0, renders = 0;
    const originalTarget = {}, originalPlanes = [], targetChanges = [], reflectionPasses = [];
    const world = { renderCamera: { position: chain(), near: .1, far: 3500, aspect: 2, projectionMatrix: chain(), projectionMatrixInverse: chain(), getWorldDirection() {} },
      reflectionCamera: { position: chain(), up: chain(), projectionMatrix: chain(), projectionMatrixInverse: chain(), matrixWorldInverse: chain(), lookAt() {}, updateMatrixWorld() {} },
      reflectionViewDirection: chain(), reflectedCameraPosition: chain(), reflectedCameraTarget: chain(), reflectionMatrix: chain(), reflectionClipPlane: {}, reflectionClippingPlanes: [],
      water: { visible: true, position: { y: 0 } }, boatRoot: { visible: true }, wakeFoam: { visible: false }, hullContactFoam: { visible: true },
      windLines: { visible: true }, rain: { visible: false }, wakeLines: [{ visible: true }, { visible: false }], scene: { background: { isColor: true } }, reflectionTarget: {},
      scenery: { setReflectionPass: value => reflectionPasses.push(value) },
      renderer: { autoClear, xr: { enabled: true }, clippingPlanes: originalPlanes, getRenderTarget: () => originalTarget,
        setRenderTarget: target => targetChanges.push(target), clear() { clears++; }, render(scene) { if (this.autoClear || scene.background.isColor) this.clear(); renders++; } } };
    reflection.call(world);
    assert.equal(clears, autoClear ? 1 : 2); assert.equal(renders, 1);
    assert.deepEqual(targetChanges, [world.reflectionTarget, originalTarget]);
    assert.deepEqual(reflectionPasses, [true, false]);
    assert.equal(world.renderer.xr.enabled, true); assert.equal(world.renderer.clippingPlanes, originalPlanes);
    assert.equal(world.water.visible, true); assert.equal(world.wakeFoam.visible, false);
    assert.equal(world.hullContactFoam.visible, true); assert.equal(world.rain.visible, false);
    assert.deepEqual(world.wakeLines.map(line => line.visible), [true, false]);
  }
});
