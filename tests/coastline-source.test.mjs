import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
const load = (source) => runInNewContext(stripTypeScriptTypes(source, { mode: "transform" }).replace(/^export /gm, "") + "\n({ lakeBoundaryRadius, lakeBoundaryDistance, sampleLakeDepth, depthAtTide })");
const bath = load(read("game/bathymetry"));
const source = read("render/scenery");
const start = source.indexOf("const COASTAL_RADIAL_BANDS");
const end = source.indexOf("\nconst NIGHT_SKY", start);
assert.ok(start >= 0 && end > start);
const terrainSource = stripTypeScriptTypes(source.slice(start, end), { mode: "transform" }).replace(/^export /gm, "");
const terrain = runInNewContext(`${terrainSource}\n({ coastalTerrainBand, sampleCoastalTerrainHeight })`, {
  lakeBoundaryRadius: bath.lakeBoundaryRadius,
  THREE: { MathUtils: { euclideanModulo: (x, n) => ((x % n) + n) % n, lerp: (a, b, t) => a + (b - a) * t } },
});
const cross = (a, b) => a.x * b.y - a.y * b.x;

test("shore follows the physical basin edge within the 256-segment mesh error budget", () => {
  const segments = 256;
  assert.match(source, /const COASTAL_TERRAIN_SEGMENTS = 256/);
  let maxError = 0, minRadius = Infinity, maxRadius = 0;
  for (let i = 0; i < segments; i++) {
    const a = i * 2 * Math.PI / segments, b = (i + 1) * 2 * Math.PI / segments;
    const first = terrain.coastalTerrainBand(a, 1), next = terrain.coastalTerrainBand(b, 1);
    assert.ok(Math.abs(first.radius - bath.lakeBoundaryRadius(a)) < 1e-9);
    assert.ok(first.height >= 1.6 && terrain.coastalTerrainBand(a, 0).height <= -1.8);
    minRadius = Math.min(minRadius, first.radius); maxRadius = Math.max(maxRadius, first.radius);
    const p = { x: Math.sin(a) * first.radius, y: Math.cos(a) * first.radius };
    const q = { x: Math.sin(b) * next.radius, y: Math.cos(b) * next.radius };
    for (let k = 1; k < 20; k++) {
      const angle = (i + k / 20) * 2 * Math.PI / segments;
      const u = { x: Math.sin(angle), y: Math.cos(angle) };
      const chord = cross(p, q) / cross(u, { x: q.x - p.x, y: q.y - p.y });
      maxError = Math.max(maxError, Math.abs(chord - bath.lakeBoundaryRadius(angle)));
    }
  }
  assert.ok(maxRadius - minRadius > 200);
  assert.ok(maxError < 0.34, `maximum shoreline chord error: ${maxError}`);
  assert.equal(segments * 6 * 2 - 192 * 6 * 2, 768);
});

test("sampled navigable water intrusion stays below one metre across tidal extremes", () => {
  let maxIntrusion = 0;
  for (const tide of [-1.5, -0.6, 0, 0.6, 1.5]) for (let i = 0; i < 128; i++) {
    const angle = (i + .37) * 2 * Math.PI / 128, boundary = bath.lakeBoundaryRadius(angle);
    for (let offset = -8; offset <= 0; offset += .25) {
      const radius = boundary + offset, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const depth = bath.depthAtTide(bath.sampleLakeDepth(x, z), tide);
      if (depth > .9 && terrain.sampleCoastalTerrainHeight(angle, radius) > tide) maxIntrusion = Math.max(maxIntrusion, -offset);
    }
  }
  assert.ok(maxIntrusion < .75, `navigable-water overlap ${maxIntrusion} m`);
});

test("water discards only beyond the permanent outer basin and still uses tide and waves", () => {
  const water = read("render/water-surface");
  assert.match(water, /if \(boundaryDistance >= 1\.0\) return -1\.0;/);
  assert.match(water, /if \(meanDepth < 0\.0\) discard;/);
  assert.match(water, /float waterDepth = max\(0\.0, meanDepth \+ uTide\)/);
  assert.match(water, /world\.y \+= height/);
  assert.doesNotMatch(water, /if \(meanDepth <= 0\.0\) discard/);
  assert.ok(bath.lakeBoundaryDistance(210, -310) < 1);
});

test("terrain rings remain ordered and preserve the authored headland and valley", () => {
  let minSeparation = Infinity;
  for (let i = 0; i < 2048; i++) {
    const angle = i * 2 * Math.PI / 2048;
    for (let band = 0; band < 6; band++) {
      minSeparation = Math.min(minSeparation, terrain.coastalTerrainBand(angle, band + 1).radius - terrain.coastalTerrainBand(angle, band).radius);
    }
  }
  assert.ok(minSeparation >= 8);
  assert.ok(terrain.sampleCoastalTerrainHeight(1.55, 2150) > terrain.sampleCoastalTerrainHeight(.52, 1900) + 20);
  assert.ok(terrain.sampleCoastalTerrainHeight(4.22, 2260) > terrain.sampleCoastalTerrainHeight(3.92, 2260) + 15);
  assert.equal((256 + 1) * 7 - (192 + 1) * 7, 448);
});
