import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWindCues, updateWindCues, createWindPennant, updateWindPennant } from "./wind-cues";
import { createInitialState } from "../sim/model";
import { DEFAULT_WEATHER } from "../weather/types";
import { WeatherSystem } from "../weather/weather";
import { sampleWaves } from "../weather/waves";

const state = { ...createInitialState(), position: { x: 0, y: 0 } };
const snapshot = new WeatherSystem(DEFAULT_WEATHER).sample(13);

describe("true-wind surface cues", () => {
  it("keeps surface cues off permanent inland terrain even at high tide", () => {
    const [cues, seeds] = createWindCues();
    const inland = { ...state, position: { x: 1390, y: -520 } };
    updateWindCues(cues, seeds, { ...snapshot, tideLevel: 1.5 }, inland, inland.position.x, inland.position.y);
    expect(Array.from(cues.geometry.getAttribute("aOpacity").array).every(value => value === 0)).toBe(true);
    updateWindCues(cues, seeds, { ...snapshot, tideLevel: 1.5 }, state, 0, 0);
    expect(Array.from(cues.geometry.getAttribute("aOpacity").array).some(value => value > 0)).toBe(true);
  });
  it("flies the mast pennant down apparent wind despite boat heading and heel", () => {
    const rig = new THREE.Group();
    rig.rotation.set(0.1, 1.6, -0.35);
    const pennant = createWindPennant();
    rig.add(pennant);
    updateWindPennant(pennant, { x: 5, y: -3 }, 4);
    const positions = pennant.geometry.getAttribute("position");
    const tip = new THREE.Vector3(positions.getX(16), positions.getY(16), positions.getZ(16)).transformDirection(rig.matrixWorld);
    const expected = new THREE.Vector3(5, 0, -3).normalize();
    expect(tip.dot(expected)).toBeGreaterThan(0.995);
    expect(positions.getX(0) + positions.getX(1)).toBeCloseTo(0);
    updateWindPennant(pennant, { x: 0, y: 0 }, 4);
    const calmTip = new THREE.Vector3(positions.getX(16), positions.getY(16), positions.getZ(16)).transformDirection(rig.matrixWorld);
    expect(calmTip.y).toBeCloseTo(-1);
    expect([...positions.array].every(Number.isFinite)).toBe(true);
  });

  it.each([[8, 0], [-8, 0], [0, 8], [0, -8], [5, -7]])("follows actual wind-to vector (%s,%s), never nautical wind-from", (x, y) => {
    const [cues, seeds] = createWindCues();
    updateWindCues(cues, seeds, { ...snapshot, trueWind: { x, y } }, state, 0, 0);
    const p = cues.geometry.getAttribute("position");
    const dx = p.getX(1) - p.getX(0);
    const dz = p.getZ(1) - p.getZ(0);
    expect(dx * x + dz * y).toBeGreaterThan(0);
    expect(Math.abs(dx * y - dz * x)).toBeLessThan(0.0001);
  });

  it("does not inherit boat motion and integrates a gust without a phase jump", () => {
    const [cues, seeds] = createWindCues();
    updateWindCues(cues, seeds, { ...snapshot, trueWind: { x: 4, y: 0 } }, state, 0, 0);
    const p = cues.geometry.getAttribute("position");
    const before = p.getX(0);
    updateWindCues(cues, seeds, { ...snapshot, time: snapshot.time + 0.1, trueWind: { x: 8, y: 0 } }, state, 0, 0);
    expect(p.getX(0) - before).toBeCloseTo(0.8, 4);
    const after = p.getX(0);
    updateWindCues(cues, seeds, { ...snapshot, time: snapshot.time + 0.1, trueWind: { x: 8, y: 0 } }, { ...state, velocity: { x: 20, y: 0 } }, 0.25, 0.1);
    expect(p.getX(0)).toBe(after);
  });

  it("rides the same tide/waves as wake contact and fades both ends", () => {
    const [cues, seeds] = createWindCues();
    updateWindCues(cues, seeds, snapshot, state, 0, 0);
    const p = cues.geometry.getAttribute("position");
    const a = cues.geometry.getAttribute("aOpacity");
    for (let i = 0; i < p.count; i += 1) {
      expect(p.getY(i)).toBeCloseTo(snapshot.tideLevel + sampleWaves(snapshot.waves, p.getX(i), p.getZ(i), snapshot.time).height + 0.045, 4);
      expect(a.getX(i)).toBeGreaterThanOrEqual(0);
      expect(a.getX(i)).toBeLessThan(0.17);
    }
    expect(a.getX(0)).toBe(0);
    expect(a.getX(11)).toBeLessThan(1e-8);
    expect((cues.material as THREE.ShaderMaterial).depthWrite).toBe(false);
  });

  it("removes calm cues and produces deterministic seeds", () => {
    const [cues, seeds] = createWindCues();
    expect(createWindCues()[1]).toEqual(seeds);
    updateWindCues(cues, seeds, { ...snapshot, trueWind: { x: 0, y: 0 } }, state, 0, 0);
    expect(cues.visible).toBe(false);
  });
});
