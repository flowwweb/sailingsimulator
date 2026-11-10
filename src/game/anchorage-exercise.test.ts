import { describe, expect, it } from "vitest";
import { createInitialState } from "../sim/model";
import { AnchorageExercise } from "./anchorage-exercise";

const boat = () => ({ ...createInitialState(), position: { x: 30, y: 0 }, heading: 0, velocity: { x: 0, y: 0 } });

function recovering(rode: number): AnchorageExercise {
  const exercise = new AnchorageExercise({ x: 0, y: 2 }, { halfLength: 2, draft: 0.6 });
  exercise.stage = "recover";
  exercise.anchor = { position: { x: 0, y: 2 }, rode, setSeconds: 8, set: true, dragging: false, draggedDistance: 0 };
  return exercise;
}

describe("anchor recovery", () => {
  it("keeps pulling on a nearly taut rode while the boat drifts slightly inward", () => {
    const exercise = recovering(Math.hypot(30, 7.6) + 0.3);
    let vessel = boat();
    for (let i = 0; i < 100; i++) {
      vessel = { ...vessel, position: { x: vessel.position.x - 0.001, y: 0 } };
      expect(exercise.haul(vessel, 7)).toBe(true);
      expect(exercise.step(vessel, 7, 1 / 60).velocity.x).toBeLessThan(vessel.velocity.x);
    }
    expect(exercise.anchor!.rode).toBeGreaterThanOrEqual(Math.hypot(vessel.position.x, 7.6));
  });

  it("takes in slack rode before applying a recovery pull", () => {
    const exercise = recovering(45);
    const vessel = boat();
    expect(exercise.haul(vessel, 7)).toBe(true);
    expect(exercise.anchor!.rode).toBe(40);
    expect(exercise.step(vessel, 7, 1 / 60).velocity).toEqual(vessel.velocity);
  });
});
