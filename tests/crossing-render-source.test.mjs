import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

test("visible crossing boat follows tide and wave; hidden boat does not sample", () => {
  const source = readFileSync("src/render/ambient-life.ts", "utf8");
  const start = source.indexOf("    if (this.crossingBoat.visible) {");
  const end = source.indexOf("    this.birds.forEach", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  let samples = 0;
  const crossingBoat = { visible: true, position: { x: 3, z: 4, y: 0 } };
  const context = { boat: { crossingBoat }, weather: { tideLevel: 1.5, waves: [] }, time: 10,
    sampleWaves: (_waves, x, z, t) => { samples++; assert.deepEqual([x, z, t], [3, 4, 10]); return { height: .4 }; } };
  runInNewContext(`(function(){ ${body} }).call(boat)`, context);
  assert.equal(crossingBoat.position.y, 1.9);
  crossingBoat.visible = false;
  runInNewContext(`(function(){ ${body} }).call(boat)`, context);
  assert.equal(samples, 1);
});

test("NPC hazard validation covers the tick that completes the encounter", () => {
  const source = readFileSync("src/main.ts", "utf8");
  assert.match(source, /if \(crossing\.other && \(crossing\.stage === "crossing" \|\| crossing\.stage === "complete"\)\)/);
  assert.ok(source.indexOf('crossing.stage = "failed"; crossing.failure = "unsafe"') < source.indexOf('beforeStage !== "complete" && crossing.stage === "complete"'));
});
