import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
const url = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
const bath = await import(url(read("game/bathymetry")));
class Geometry { setAttribute() {} setIndex() {} computeVertexNormals() {} }
class Vector { constructor(...v) { this.values = v; } normalize() { return this; } }
class Material { constructor(options) { Object.assign(this, options); } }
class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; } }
class Matrix { makeScale(x, y, z) { this.elements = [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; return this; } }
const THREE = { BufferGeometry: Geometry, BufferAttribute: class {}, Vector2: Vector, Vector3: Vector, Vector4: Vector, Matrix4: Matrix, Color: class {}, ShaderMaterial: Material, Mesh };
const frame = stripTypeScriptTypes(read("render/sailing-frame"), { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const SAILING_TO_RENDER = runInNewContext(`${frame}\nSAILING_TO_RENDER`, { THREE });
const source = stripTypeScriptTypes(read("render/water-surface"), { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const createWater = runInNewContext(`${source}\ncreateWaterSurface`, { THREE, SAILING_TO_RENDER, LAKE_BASIN: bath.LAKE_BASIN, LAKE_SHOALS: bath.LAKE_SHOALS });
const water = createWater({ compact: true, reflectionTexture: {}, reflectionMatrix: {} });
const shader = water.material.fragmentShader, bounds = water.material.uniforms.uShoalBoundSquared.value;
const shoals = bath.LAKE_SHOALS.map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? Math.fround(v) : v])));
const inside = (s, x, z) => bath.shoalDistance(s, x, z) < s.shelfRadius;
const skipped = (i, x, z) => {
  const dx = Math.fround(Math.fround(x) - shoals[i].x), dz = Math.fround(Math.fround(z) - shoals[i].z);
  return Math.fround(Math.fround(dx * dx) + Math.fround(dz * dz)) > bounds[i];
};

test("shader uses actual conservative bounds before the original shoal calculation", () => {
  assert.equal(bounds.length, shoals.length);
  assert.match(shader, /if \(dot\(shoalDelta, shoalDelta\) > uShoalBoundSquared\[index\]\) continue;/);
  assert.match(shader, /float localShoalDistance = organicDistance\(\s*shoalDelta/);
  assert.match(shader, /depth = mix\(depth, min\(depth, shelfDepth\), shelfBlend\)/);
  assert.match(water.material.vertexShader, /world\.z = -world\.z;[\s\S]*vWorldPosition = world\.xyz;/);
  assert.match(shader, /estimatedDepth\(vWorldPosition\.xz\)/);
});

test("guard preserves every actual shoal contribution across basin and bound-edge samples", () => {
  let baselineCalls = 0, guardedCalls = 0, compared = 0;
  const check = (x, z) => {
    for (let i = 0; i < shoals.length; i++) {
      baselineCalls++;
      const reference = inside(shoals[i], x, z);
      const skip = skipped(i, x, z);
      if (!skip) guardedCalls++;
      assert.ok(!reference || !skip, `missed shoal ${i} at ${x}, ${z}`);
      compared++;
    }
  };
  for (let z = -1800; z <= 1800; z += 30) for (let x = -1800; x <= 1800; x += 30) {
    if (bath.lakeBoundaryDistance(x, z) < 1) check(x, z);
  }
  for (let i = 0; i < shoals.length; i++) {
    const s = shoals[i], radius = Math.sqrt(bounds[i]);
    for (let j = 0; j < 512; j++) {
      const angle = j * Math.PI / 256;
      for (const factor of [.9998, 1, 1.0002]) check(s.x + Math.cos(angle) * radius * factor, s.z + Math.sin(angle) * radius * factor);
    }
  }
  assert.ok(compared > 100_000);
  assert.ok(guardedCalls < baselineCalls / 3, `${guardedCalls} vs ${baselineCalls} detailed evaluations`);
});
