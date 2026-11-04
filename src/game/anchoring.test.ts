import { describe, expect, it } from "vitest";
import { createInitialState } from "../sim/model";
import { bowPosition, dropAnchor, payOutRode, stepAnchor } from "./anchoring";

const boat = () => ({ ...createInitialState(), position: { x: 0, y: 0 }, heading: 0, velocity: { x: 0, y: 0 } });

describe("anchor training model", () => {
  it("drops at the bow and keeps slack rode from changing the boat", () => {
    const vessel = boat();
    expect(bowPosition(vessel, 2).y).toBe(2);
    const anchor = payOutRode(dropAnchor(vessel, 2, 4.4), 25);
    const result = stepAnchor(anchor, vessel, 2, 4.4, 1 / 60);
    expect(result.boat.velocity).toEqual(vessel.velocity);
    expect(result.anchor.position).toEqual(anchor.position);
    expect(result.scope).toBe(6);
  });

  it("sets under sustained moderate pull with sufficient scope and opposes outward motion", () => {
    const vessel = { ...boat(), position: { x: 30, y: 0 }, velocity: { x: 0.1, y: 0 } };
    let anchor = payOutRode(dropAnchor(boat(), 2, 4.4), 25);
    for (let i = 0; i < 240; i++) anchor = stepAnchor(anchor, vessel, 2, 4.4, 1 / 60).anchor;
    expect(anchor.set).toBe(true);
    const result = stepAnchor(anchor, vessel, 2, 4.4, 1 / 60);
    expect(result.boat.velocity.x).toBeLessThan(vessel.velocity.x);
  });

  it("drags with insufficient scope or excessive loading and does not set from slack", () => {
    const initial = dropAnchor(boat(), 2, 4.4);
    expect(stepAnchor(initial, boat(), 2, 4.4, 10).anchor.set).toBe(false);
    const moving = { ...boat(), position: { x: 10, y: 0 }, velocity: { x: 1, y: 0 } };
    const result = stepAnchor(initial, moving, 2, 4.4, 1 / 60);
    expect(result.anchor.dragging).toBe(true);
    expect(result.anchor.position.x).toBeGreaterThan(initial.position.x);
    expect(result.anchor.set).toBe(false);
  });

  it("a set anchor drags under excess load and paying out relieves a taut rode", () => {
    const initial = { ...payOutRode(dropAnchor(boat(), 2, 4.4), 25), set: true };
    const pulled = { ...boat(), position: { x: 31, y: 0 }, velocity: { x: 2, y: 0 } };
    const overloaded = stepAnchor(initial, pulled, 2, 4.4, 1 / 60);
    expect(overloaded.anchor.dragging).toBe(true);
    const eased = stepAnchor(payOutRode(initial, 10), pulled, 2, 4.4, 1 / 60);
    expect(eased.tension).toBe(0);
    expect(eased.anchor.dragging).toBe(false);
  });
});


