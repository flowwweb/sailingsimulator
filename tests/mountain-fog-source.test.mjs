import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
const url = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
const { createRandom } = await import(url(read("weather/prng")));
const { HARBOR_20 } = await import(url(read("sim/boats")));
const buoy = read("game/first-buoy").match(/export const FIRST_BUOY = (\{[\s\S]*?\}) as const;/);
assert.ok(buoy);
const start = runInNewContext(`(${buoy[1]})`);
class Attribute {
  constructor(array, stride) { this.array = array; this.stride = stride; }
  getX(i) { return this.array[i * this.stride]; } getY(i) { return this.array[i * this.stride + 1]; } getZ(i) { return this.array[i * this.stride + 2]; }
  setXYZ(i, x, y, z) { this.array[i * this.stride] = x; this.array[i * this.stride + 1] = y; this.array[i * this.stride + 2] = z; }
}
class Geometry {
  attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  setIndex(indices) { this.indices = indices; }
  computeVertexNormals() { this.attributes.normal = new Attribute(new Float32Array(this.attributes.position.array.length), 3); }
  getAttribute(name) { return this.attributes[name]; }
  computeBoundingSphere() {}
}
class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; } }
const smoothstep = (v, a, b) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const THREE = { BufferGeometry: Geometry, Float32BufferAttribute: Attribute, Mesh, MathUtils: { smoothstep, lerp: (a, b, t) => a + (b - a) * t } };
const scenery = read("render/scenery");
const first = scenery.indexOf("  private createDistantMountains(): void {");
const last = scenery.indexOf("  private createShoreMasses()", first);
assert.ok(first >= 0 && last > first);
const code = stripTypeScriptTypes(`class Probe { root = { children: [], add(x) { this.children.push(x); } }; dynamicMaterial() { return {}; } ${scenery.slice(first, last)} }`, { mode: "transform" });
const Probe = runInNewContext(`${code}\nProbe`, { THREE, createRandom, LAKE_RADIUS: 1800 });
const world = read("render/world");
const nearExpression = world.match(/const fogNear = titleScreen \? ([^;]+);/);
const farExpression = world.match(/const fogFar = titleScreen \? ([^;]+);/);
assert.ok(nearExpression && farExpression);
const fog = (visibility, titleScreen = false) => runInNewContext(`({ near: ${nearExpression[0].replace('const fogNear = ', '').replace(';', '')}, far: ${farExpression[0].replace('const fogFar = ', '').replace(';', '')} })`, { titleScreen, weather: { visibility }, Math, THREE });

test("existing ridge geometry is not fully fogged from the first-lesson camera in clear weather", () => {
  const p = new Probe(); p.createDistantMountains();
  assert.equal(p.root.children.length, 3);
  const heading = start.startHeadingDegrees * Math.PI / 180;
  const fx = Math.sin(heading), fz = Math.cos(heading), distance = HARBOR_20.camera.distance;
  const camera = { x: start.start.x - fx * distance + Math.cos(heading) * distance * .36, z: start.start.z - fz * distance - Math.sin(heading) * distance * .36 };
  const look = { x: start.start.x + fx * HARBOR_20.camera.lookAhead, z: start.start.z + fz * HARBOR_20.camera.lookAhead };
  const bearing = Math.atan2(look.x - camera.x, look.z - camera.z), halfFov = Math.atan(Math.tan(26 * Math.PI / 180) * 16 / 9);
  const clear = fog(1), poor = fog(.35);
  assert.equal(clear.far, 4000); assert.ok(poor.far < clear.far); assert.equal(fog(1, true).far, 4400);
  for (const [layer, ridge] of p.root.children.entries()) {
    assert.equal(ridge.geometry.indices.length / 3, 4096);
    const positions = ridge.geometry.attributes.position, depths = [];
    for (let i = 1025; i < 2050; i++) {
      const x = positions.getX(i) - camera.x, z = positions.getZ(i) - camera.z;
      const delta = Math.atan2(Math.sin(Math.atan2(x, z) - bearing), Math.cos(Math.atan2(x, z) - bearing));
      if (Math.abs(delta) <= halfFov) depths.push(x * Math.sin(bearing) + z * Math.cos(bearing));
    }
    depths.sort((a, b) => a - b);
    assert.ok(depths.length > 100);
    const median = depths[Math.floor(depths.length / 2)];
    assert.ok(median < 3500, `layer ${layer} median lies inside camera far plane`);
    assert.equal(1 - smoothstep(median, 260, 2000), 0, `layer ${layer} was fully fogged before`);
    assert.ok(1 - smoothstep(median, clear.near, clear.far) > .2, `layer ${layer} has clear-weather contrast`);
    assert.equal(1 - smoothstep(median, poor.near, poor.far), 0, `layer ${layer} remains hidden in poor visibility`);
  }
  assert.match(world, /this\.water\.material\.uniforms\.uFogFar!\.value = fogFar/);
});


test("existing shower and poor-visibility fog ranges are preserved", async () => {
  const { WEATHER_PRESETS } = await import(url(read("weather/types")));
  const source = read("weather/weather");
  const match = source.match(/visibility: (clamp\(this\.config\.visibility - this\.config\.rain \* 0\.16, 0\.35, 1\))/);
  assert.ok(match, "weather visibility expression missing");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const visibility = runInNewContext(`(function () { return ${match[1]}; }).call({ config: preset })`, { clamp, preset: WEATHER_PRESETS["Passing shower"] });
  assert.ok(Math.abs(visibility - .6208) < 1e-12);
  assert.ok(Math.abs(fog(visibility).far - 1241.6) < 1e-9);
  assert.equal(fog(.35).far, 1080);
  assert.equal(fog(.72).far, 1440);
  assert.ok(fog(.86).far > 1720 && fog(.86).far < 4000);
  assert.match(world, /this\.water\.material\.uniforms\.uFogNear!\.value = fogNear/);
  assert.match(world, /private readonly camera = new THREE\.PerspectiveCamera\(52, 1, 0\.1, 3_500\)/);
});
