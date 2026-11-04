import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

test("wind cue segments share wave samples without gaps", () => {
  const source = readFileSync(new URL("../src/render/wind-cues.ts", import.meta.url), "utf8");
  const fn = stripTypeScriptTypes(source.slice(source.indexOf("export function updateWindCues(")), { mode: "strip" }).replace(/^export /, "");
  let samples = 0;
  const waveHeight = (x, z) => x * 0.01 + z * 0.02;
  const smoothstep = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const update = runInNewContext(`${fn}\nupdateWindCues`, {
    SEGMENTS: 6, FIELD_SIZE: 110,
    THREE: { MathUtils: { smoothstep, clamp: (x, a, b) => Math.min(Math.max(x, a), b), euclideanModulo: (n, m) => (n % m + m) % m } },
    sampleLakeDepth: () => 10, depthAtTide: x => x,
    sampleWaveHeight: (_, x, z) => { samples++; return waveHeight(x, z); },
  });
  const position = { array: new Float32Array(216 * 3), setXYZ(i, x, y, z) { this.array.set([x, y, z], i * 3); } };
  const opacity = { array: new Float32Array(216), setX(i, value) { this.array[i] = value; } };
  const cues = { userData: { advection: { x: 0, y: 0 } }, geometry: { getAttribute: key => key === "position" ? position : opacity } };
  const seeds = Float32Array.from({ length: 54 }, (_, i) => (i * 73 % 101) / 101);
  update(cues, seeds, { trueWind: { x: 5, y: -7 }, waves: [], time: 13, tideLevel: -0.4, gust: 0.2 }, { position: { x: 0, y: 0 } }, 0, 0);
  assert.equal(samples, 18 * 7);
  for (let i = 0; i < 216; i++) {
    const [x, y, z] = position.array.slice(i * 3, i * 3 + 3);
    assert.ok(Math.abs(y - (-0.4 + waveHeight(x, z) + 0.045)) < 0.00001);
    if (i % 12 !== 0 && i % 2 === 0) {
      assert.deepEqual(position.array.slice(i * 3, i * 3 + 3), position.array.slice((i - 1) * 3, i * 3));
      assert.equal(opacity.array[i], opacity.array[i - 1]);
    }
  }
});
