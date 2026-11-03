import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

const source = readFileSync(new URL("../src/render/world.ts", import.meta.url), "utf8");
const start = source.indexOf("    const atmosphereDue =");
const end = source.indexOf("    this.renderer.render(this.scene, this.camera);", start);
assert.ok(start >= 0 && end > start, "render scheduling block exists");
const schedule = new Function("weather", "titleScene", "titleScreen", source.slice(start, end));

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
    schedule.call(world, {}, "arrival", titleScreen);
  }
  return frames;
}

test("title reflections defer at most one frame when a shadow update coincides", () => {
  for (const fps of [10, 30, 60]) {
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

test("non-title rendering does not defer coincident passes", () => {
  assert.ok(run(60, false).some(frame => frame.atmosphere && frame.reflection));
});
