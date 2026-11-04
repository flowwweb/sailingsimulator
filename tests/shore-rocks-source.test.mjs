import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8");
const url = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
const bathUrl = url(read("game/bathymetry")), bath = await import(bathUrl);
const boatsUrl = url(read("sim/boats")), boats = await import(boatsUrl);
const modelUrl = url(read("sim/model").replace('from "./boats";', `from "${boatsUrl}";`)), model = await import(modelUrl);
const townUrl = url(read("game/town-solids"));
const worldUrl = url(read("game/world-definition").replace('from "./bathymetry";', `from "${bathUrl}";`).replace('from "./town-solids";', `from "${townUrl}";`)), world = await import(worldUrl);
const dockingUrl = url(read("game/docking"));
const hazards = await import(url(read("game/hazards").replace('from "../sim/model";', `from "${modelUrl}";`).replace('from "../sim/boats";', `from "${boatsUrl}";`).replace('from "./docking";', `from "${dockingUrl}";`).replace('from "./bathymetry";', `from "${bathUrl}";`).replace('from "./world-definition";', `from "${worldUrl}";`)));
const prng = await import(url(read("weather/prng")));
const scenery = read("render/scenery"), terrainStart = scenery.indexOf("const COASTAL_RADIAL_BANDS"), terrainEnd = scenery.indexOf("\nconst NIGHT_SKY", terrainStart);
const terrainCode = stripTypeScriptTypes(scenery.slice(terrainStart, terrainEnd), { mode: "transform" }).replace(/^export /gm, "");
const math = { euclideanModulo: (x, n) => ((x % n) + n) % n, lerp: (a, b, t) => a + (b - a) * t };
const terrain = runInNewContext(`${terrainCode}\n({ coastalTerrainBand, sampleCoastalTerrainHeight })`, { lakeBoundaryRadius: bath.lakeBoundaryRadius, THREE: { MathUtils: math } });

class Vector3 { x = 0; y = 0; z = 0; set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Euler { set() { return this; } }
class Quaternion { setFromEuler() { return this; } }
class Matrix4 { compose(position, _rotation, scale) { this.position = { ...position }; this.scale = { ...scale }; return this; } }
class DodecahedronGeometry { constructor(radius) { this.radius = radius; } }
class InstancedMesh {
  instances = []; instanceMatrix = {};
  constructor(geometry, _material, count) { this.geometry = geometry; this.count = count; }
  setMatrixAt(index, matrix) { this.instances[index] = { position: { ...matrix.position }, scale: { ...matrix.scale } }; }
}
const rockStart = scenery.indexOf("  private createShoreRocks(): void {");
const rockEnd = scenery.indexOf("  private createHillsideScrub(): void {", rockStart);
assert.ok(rockStart >= 0 && rockEnd > rockStart);
const methods = scenery.slice(rockStart, rockEnd);
const probeCode = stripTypeScriptTypes(`class Probe { root = { children: [], add(item) { this.children.push(item); } }; dynamicMaterial() { return {}; } ${methods} }`, { mode: "transform" });
const Probe = runInNewContext(`${probeCode}\nProbe`, { THREE: { Vector3, Euler, Quaternion, Matrix4, DodecahedronGeometry, InstancedMesh }, createRandom: prng.createRandom, ...terrain });

// A transformed dodecahedron is contained by the sphere of its largest scale;
// requiring this whole conservative footprint to be permanent land covers all tides.
test("all seeded shoreline rock and stone bounds remain on physical land", () => {
  const probe = new Probe(); probe.createShoreRocks(); probe.createShorelineDrift();
  assert.deepEqual(Array.from(probe.root.children, (mesh) => mesh.count), [120, 210]);
  for (const mesh of probe.root.children) for (let i = 0; i < mesh.instances.length; i++) {
    const { position, scale } = mesh.instances[i];
    const extent = mesh.geometry.radius * Math.max(scale.x, scale.y, scale.z);
    let nearest = { x: position.x, z: position.z, boundary: bath.lakeBoundaryDistance(position.x, position.z) };
    for (let j = 0; j < 64; j++) {
      const angle = j * Math.PI / 32, x = position.x + extent * Math.cos(angle), z = position.z + extent * Math.sin(angle);
      assert.equal(bath.sampleLakeDepth(x, z), 0, `${mesh.name} #${i} footprint crosses water at sample ${j}`);
      const boundary = bath.lakeBoundaryDistance(x, z);
      if (boundary < nearest.boundary) nearest = { x, z, boundary };
    }
    if (i % 17 === 0 || i === 35) {
      const state = { ...model.createInitialState(), position: { x: nearest.x, y: nearest.z } };
      for (let heading = 0; heading < 8; heading++) {
        state.heading = heading * Math.PI / 4;
        const incident = hazards.evaluateIncident(state, boats.HARBOR_20, world.FAIR_WINDS_WORLD, 1.5);
        assert.notEqual(incident.severity, "none", `${mesh.name} #${i} nearest footprint allowed at high tide`);
      }
    }
  }
});

