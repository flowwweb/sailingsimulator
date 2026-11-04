import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

test("training marks use a bounded, unnumbered inflatable model and follow the water", () => {
  class Group { children = []; add(...items) { this.children.push(...items); } }
  class Geometry { constructor(...args) { this.args = args; } }
  class Mesh { position = {}; rotation = {}; constructor(geometry, material) { this.geometry = geometry; this.material = material; } }
  const THREE = { Group, Mesh, Vector2: Geometry, LatheGeometry: Geometry, CylinderGeometry: Geometry, TorusGeometry: Geometry, MeshStandardMaterial: Geometry };
  const source = readFileSync(new URL("../src/render/training-buoy.ts", import.meta.url), "utf8");
  const js = stripTypeScriptTypes(source, { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
  const buoy = runInNewContext(`${js}\ncreateTrainingBuoy(0xd78935)`, { THREE });
  assert.deepEqual(Array.from(buoy.children, part => part.name), ["Inflatable orange body", "Reflective band", "Base seam"]);
  const profile = buoy.children[0].geometry.args[0];
  assert.equal(profile[0].args[1], -0.35);
  assert.equal(profile.at(-1).args[1], 1.64);
  assert.ok(profile.every(point => point.args[0] < .7));
  const world = readFileSync(new URL("../src/render/world.ts", import.meta.url), "utf8");
  assert.match(world, /object\.buoyMark === "training"[\s\S]*?createTrainingBuoy\(spec\.color\)/);
  assert.match(world, /buoy\.position\.y = weather\.tideLevel \+ sampleWaveHeight\(weather\.waves, buoy\.position\.x, buoy\.position\.z, weather\.time\)/);
});
