import * as THREE from "three";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { assert, expect, test } from "vitest";
import { BOAT_DEFINITIONS, HARBOR_20 } from "../sim/boats";
import { SailingWorld } from "./world";

function cameraWorld() {
  return Object.assign(Object.create(SailingWorld.prototype), {
    camera: new THREE.PerspectiveCamera(52, 844 / 390, 0.1, 3500),
    activeBoat: HARBOR_20,
    desiredCameraPosition: new THREE.Vector3(),
    cameraLookAt: new THREE.Vector3(),
    cameraInitialized: false,
  });
}

// Exercise the real UI action without booting main.ts and its browser/render loop.
const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const resetBoatAction = mainSource.slice(
  mainSource.indexOf("function resetBoat(): void {"),
  mainSource.indexOf("function selectBoat("),
).replace("function resetBoat(): void", "function resetBoat()");

function resetContext(world: ReturnType<typeof cameraWorld>, stage: string) {
  const state = { position: { x: 610, y: 330 }, heave: -2.85, heading: 0 };
  return {
    world, state: { ...state, position: { x: 1172, y: -371 } }, previousState: {},
    started: true, activitySession: undefined, activityView: undefined, firstBuoy: undefined, dummyRecovery: undefined,
    academy: { view: () => ({ stage }) },
    interruptLessonAttempt() {}, prepareLessonAttempt() {},
    createGameState: () => state,
    computeSailAerodynamics: () => ({}), computeHeadsailAerodynamics: () => ({}),
    weather: { trueWind: {} }, activeBoat: HARBOR_20,
    diagnostics: {}, headsailDiagnostics: {},
    audio: { resetMotionState() {} }, lessonCompletedAt: 0, lastManeuverCount: 0,
    clearDocking() {}, clearIncident() {}, elements: { status: { textContent: "" } },
  };
}

test("visible free-sail reset snaps the first camera frame from distant and incident poses", () => {
  for (const stage of ["free-sail", "lesson-complete", "complete"]) {
    for (const incident of [undefined, { elapsed: 3, result: { point: { x: 1174, z: -370 } } }]) {
      const world = cameraWorld(), expected = cameraWorld();
      world.resetWake = () => {};
      world.updateCamera(1172, -371, 1.48, 0.15, 1 / 60, incident);
      const context = resetContext(world, stage);
      runInNewContext(`${resetBoatAction}; resetBoat();`, context);
      expect(context.previousState).toBe(context.state);
      world.updateCamera(610, 330, 0, -2.85, 1 / 60);
      expected.updateCamera(610, 330, 0, -2.85, 1 / 60);
      expect(world.camera.position.distanceTo(expected.camera.position)).toBeLessThan(1e-10);
      expect(world.camera.quaternion.angleTo(expected.camera.quaternion)).toBeLessThan(1e-7);
    }
  }
});

test("visible lesson reset still delegates to the existing lesson preparation", () => {
  const context = resetContext(cameraWorld(), "active");
  const state = context.state;
  let attempts = 0;
  context.prepareLessonAttempt = () => { attempts++; };
  runInNewContext(`${resetBoatAction}; resetBoat();`, context);
  expect(attempts).toBe(1);
  expect(context.state).toBe(state);
});

test("visible first-buoy reset delegates to a fresh journey attempt", () => {
  const attempts: string[] = [];
  const context = {
    ...resetContext(cameraWorld(), "free-sail"), firstBuoy: {},
    prepareLessonAttempt: (kind: string) => { attempts.push(kind); },
  };
  const state = context.state;
  runInNewContext(`${resetBoatAction}; resetBoat();`, context);
  expect(attempts).toEqual(["first-buoy"]);
  expect(context.state).toBe(state);
});

test("camera position and target follow the same boat height through chase, impact and recovery", () => {
  for (const boat of Object.values(BOAT_DEFINITIONS)) {
    for (const heading of [0, 1.48, -2.4]) {
      for (const tide of [-3, -1.5, 0.6, 1.5, 3]) {
        const reference = cameraWorld(), tidal = cameraWorld();
        reference.activeBoat = tidal.activeBoat = boat;
        for (let frame = 0; frame < 420; frame++) {
          const heave = Math.sin(frame / 30) * 0.2;
          const incident = frame >= 30 && frame < 240
            ? { elapsed: (frame - 30) / 60, result: { point: { x: 1174, z: -370 } } }
            : undefined;
          reference.updateCamera(1172, -371, heading, heave, 1 / 60, incident);
          tidal.updateCamera(1172, -371, heading, heave + tide, 1 / 60, incident);
          assert(Math.abs(tidal.camera.position.x - reference.camera.position.x) < 5e-11);
          assert(Math.abs(tidal.camera.position.z - reference.camera.position.z) < 5e-11);
          assert(Math.abs(tidal.camera.position.y - reference.camera.position.y - tide) < 5e-11);
          assert(Math.abs(tidal.cameraLookAt.y - reference.cameraLookAt.y - tide) < 5e-11);
          assert(tidal.camera.quaternion.angleTo(reference.camera.quaternion) < 1e-7);
          if (frame === 300) { reference.resetCamera(); tidal.resetCamera(); }
        }
      }
    }
  }
});

test("camera reset uses the supplied height immediately after a title view", () => {
  const world = cameraWorld();
  for (const title of ["arrival", "return"]) {
    world.updateCamera(1100, -500, 1.2, 0.15, 1 / 60, undefined, title, 2);
    expect(world.camera.fov).toBe(30);
    world.resetCamera();
    world.updateCamera(610, 330, 0, -2.85, 1 / 60);
    expect(world.camera.fov).toBe(52);
    expect(world.camera.position.y).toBeCloseTo(-2.85 + HARBOR_20.camera.height, 10);
    expect(world.cameraLookAt.y).toBeCloseTo(-2.85 + 1.2, 10);
  }
});
