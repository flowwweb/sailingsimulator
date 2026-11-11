import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const world = read("src/render/world.ts");
const start = world.indexOf("  private updateCamera(");
const end = world.indexOf("\n}\n\nconst HULL_STATIONS", start);
assert.ok(start > 0 && end > start);
const method = stripTypeScriptTypes(world.slice(start, end).replace("private updateCamera(", "function updateCamera("), { mode: "strip" });
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`;
const boatsUrl = moduleUrl(read("src/sim/boats.ts"));
const { HARBOR_20 } = await import(boatsUrl);
const model = await import(moduleUrl(read("src/sim/model.ts").replace('from "./boats";', `from "${boatsUrl}";`)));

class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(point) { return this.set(point.x, point.y, point.z); }
  lerp(point, t) { return this.set(this.x + (point.x - this.x) * t, this.y + (point.y - this.y) * t, this.z + (point.z - this.z) * t); }
  applyMatrix4(matrix) {
    const { x, y, z } = this, e = matrix.elements;
    return this.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
  }
}
class Matrix {
  makeScale(x, y, z) { this.elements = [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; return this; }
}
const THREE = { Matrix4: Matrix, MathUtils: {
  clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
  lerp: (a, b, t) => a + (b - a) * t,
} };
const frame = stripTypeScriptTypes(read("src/render/sailing-frame.ts"), { mode: "strip" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const { updateCamera, SAILING_TO_RENDER } = runInNewContext(`${frame}\n${method}\n({ updateCamera, SAILING_TO_RENDER })`, { THREE, HARBOR_20 });
function camera(aspect) {
  return { aspect, fov: 52, near: .1, far: 3500, position: new Vector(), target: new Vector(),
    projectionMatrix: { copy() {} }, projectionMatrixInverse: { copy() {} },
    lookAt(point) { this.target.copy(point); }, updateProjectionMatrix() {}, updateMatrixWorld() {},
  };
}
function view(heading, aspect = 1280 / 720, title) {
  const state = { camera: camera(aspect), renderCamera: camera(aspect), renderLookAt: new Vector(), activeBoat: HARBOR_20,
    desiredCameraPosition: new Vector(), cameraLookAt: new Vector(), cameraInitialized: false };
  updateCamera.call(state, 0, 0, heading, 0, 1 / 60, undefined, title, 0);
  return (x, z) => {
    const c = state.renderCamera, point = new Vector(x, .7, z).applyMatrix4(SAILING_TO_RENDER);
    const dx = c.target.x - c.position.x, dy = c.target.y - c.position.y, dz = c.target.z - c.position.z;
    const distance = Math.hypot(dx, dy, dz), flat = Math.hypot(dx, dz);
    const px = point.x - c.position.x, py = point.y - c.position.y, pz = point.z - c.position.z;
    return ((px * -dz + pz * dx) / flat) / ((px * dx + py * dy + pz * dz) / distance) / Math.tan(c.fov * Math.PI / 360) / c.aspect;
  };
}

test("the actual chase camera projects port left and starboard right at representative headings", () => {
  assert.match(world, /this\.scene\.applyMatrix4\(SAILING_TO_RENDER\)/);
  assert.match(world, /this\.renderer\.render\(this\.scene, this\.renderCamera\)/);
  for (const headingDegrees of [0, 90, 155, 180, 270]) {
    const heading = headingDegrees * Math.PI / 180;
    for (const aspect of [1280 / 720, 844 / 390, 640 / 360]) {
      const project = view(heading, aspect), boat = project(0, 0);
      const port = heading - 68 * Math.PI / 180;
      assert.ok(project(11 * Math.sin(port), 11 * Math.cos(port)) < boat, `port at ${headingDegrees}`);
      assert.ok(project(10 * Math.cos(heading), -10 * Math.sin(heading)) > boat, `starboard at ${headingDegrees}`);
    }
  }
});

test("the real ArrowRight input and simulation turn toward screen-right without an input inversion", () => {
  const source = stripTypeScriptTypes(read("src/game/input.ts"), { mode: "transform" }).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
  const GameInput = runInNewContext(`${source}\nGameInput`, { document: { hidden: false }, performance });
  const input = Object.assign(Object.create(GameInput.prototype), { canControl: () => true, keys: new Set(["ArrowRight"]), active: new Set(), buttonKeys: new Map(), clickControls: new Map(), dragRudder: 0 });
  const controls = input.read();
  assert.equal(controls.rudder, 1);
  for (const degrees of [0, 90, 155, 180, 270]) {
    const heading = degrees * Math.PI / 180, project = view(heading);
    let state = { ...model.createInitialState(), heading, velocity: { x: 4 * Math.sin(heading), y: 4 * Math.cos(heading) } };
    for (let tick = 0; tick < 60; tick++) state = model.stepBoat(state, controls, { trueWind: { x: 0, y: 0 }, boat: HARBOR_20 }, 1 / 60).state;
    assert.ok(model.wrappedAngle(state.heading - heading) > 0);
    assert.ok(project(30 * Math.sin(state.heading), 30 * Math.cos(state.heading)) > project(30 * Math.sin(heading), 30 * Math.cos(heading)));
  }
});

test("the converted title camera retains the boat-left F composition", () => {
  const main = read("src/main.ts");
  const heading = Number(main.match(/titleState\.heading = degrees\(([\d.]+)\)/)?.[1]);
  const wind = Number(main.match(/titleConfig\.wind\.directionFromDegrees = ([\d.]+)/)?.[1]);
  assert.equal(heading - wind, 65, "the title-only pose retains its original relative wind");
  for (const aspect of [1672 / 941, 844 / 390, 640 / 360]) for (const title of ["arrival", "return"]) {
    const project = view(heading * Math.PI / 180, aspect, title);
    assert.ok(project(0, 0) < -.2);
    assert.ok(project(0, 0) > -.8);
    // Actual campanile foundation (town1100,-500 + local124,46) relative to title boat991,-236.
    assert.ok(project(233, -218) < .25);
    assert.ok(project(233, -218) > -.5);
  }
});
