import { describe, expect, it } from "vitest";
import { HARBOR_20 } from "../sim/boats";
import { createInitialState, stepBoat } from "../sim/model";
import { castOffRequested, dockingPoint, evaluateDocking, mooredBoatState, retainDockDeparture } from "./docking";
import { evaluateIncident } from "./hazards";
import { FAIR_WINDS_WORLD } from "./world-definition";

describe("Juniper Cove docking", () => {
  const dock = FAIR_WINDS_WORLD.objects.find(
    (object) => object.id === "juniper-cove-dock",
  )!;
  const point = dockingPoint(dock);

  it("captures a slow, aligned arrival beside the pier", () => {
    const state = createInitialState();
    state.position = { x: point.x + 1, y: point.z };
    state.heading = dock.docking!.heading + 0.08;
    state.velocity = { x: 0.2, y: 0.15 };

    const docking = evaluateDocking(state, HARBOR_20, FAIR_WINDS_WORLD);
    expect(docking?.object.id).toBe("juniper-cove-dock");
    expect(docking?.speed).toBeLessThan(dock.docking!.maxSpeed);
    expect(mooredBoatState(state, docking!).velocity).toEqual({ x: 0, y: 0 });
  });

  it("rejects fast or badly aligned approaches", () => {
    const fast = createInitialState();
    fast.position = { x: point.x, y: point.z };
    fast.heading = dock.docking!.heading;
    fast.velocity = { x: 1.4, y: 0 };

    const crosswise = {
      ...fast,
      velocity: { x: 0.2, y: 0.1 },
      heading: dock.docking!.heading + Math.PI / 2,
    };

    expect(evaluateDocking(fast, HARBOR_20, FAIR_WINDS_WORLD)).toBeUndefined();
    expect(
      evaluateDocking(crosswise, HARBOR_20, FAIR_WINDS_WORLD),
    ).toBeUndefined();
  });

  it("allows sustained cast-off inside the berth, then restores capture after departure", () => {
    const arrival = createInitialState();
    arrival.position = { x: point.x, y: point.z };
    arrival.heading = dock.docking!.heading;
    arrival.velocity = { x: 0.2, y: 0.1 };
    let state = mooredBoatState(arrival, evaluateDocking(arrival, HARBOR_20, FAIR_WINDS_WORLD)!);
    expect(state.velocity).toEqual({ x: 0, y: 0 });
    expect(state.yawRate).toBe(0);
    expect(state.rudderAngle).toBe(0);
    let departure = dock as typeof dock | undefined;
    for (let step = 0; step < 60; step++) {
      state = stepBoat(state, { rudder: -1, sheetRate: -1 }, { trueWind: { x: 10, y: 0 }, boat: HARBOR_20 }, 1 / 60).state;
      departure = retainDockDeparture(state, departure);
      expect(departure).toBe(dock);
      expect(evaluateDocking(state, HARBOR_20, FAIR_WINDS_WORLD, departure)).toBeUndefined();
      expect(evaluateIncident(state, HARBOR_20, FAIR_WINDS_WORLD, 0, departure).kind).toBe("clear");
    }
    expect(Math.hypot(state.position.x - point.x, state.position.y - point.z)).toBeGreaterThan(0);
    const atBoundary = { ...state, position: { x: point.x + dock.docking!.captureRadius, y: point.z } };
    expect(retainDockDeparture(atBoundary, departure)).toBe(dock);
    const outside = { ...state, position: { x: point.x + dock.docking!.captureRadius + 0.001, y: point.z } };
    departure = retainDockDeparture(outside, departure);
    expect(departure).toBeUndefined();
    expect(retainDockDeparture(arrival, departure)).toBeUndefined();
    expect(evaluateDocking(arrival, HARBOR_20, FAIR_WINDS_WORLD, departure)?.object).toBe(dock);
    expect(evaluateIncident(arrival, HARBOR_20, FAIR_WINDS_WORLD, 0, departure).kind).toBe("docking");
  });

  it("holds a captured arrival until a fresh helm or sheet intent", () => {
    const heldArrival = { rudder: 1, sheetRate: 0 };
    for (let step = 0; step < 60; step++) expect(castOffRequested(heldArrival, heldArrival)).toBe(false);
    const released = { rudder: 0, sheetRate: 0 };
    expect(castOffRequested(released, heldArrival)).toBe(false);
    expect(castOffRequested(heldArrival, released)).toBe(true);
    expect(castOffRequested({ rudder: 1, sheetRate: -1 }, heldArrival)).toBe(true);
    expect(castOffRequested({ rudder: -1, sheetRate: 0 }, heldArrival)).toBe(true);
    expect(castOffRequested({ rudder: 0.01, sheetRate: 0 }, released)).toBe(false);
  });

  it("excludes only the departing berth and permits normal capture after a reset", () => {
    const state = createInitialState();
    state.position = { x: point.x, y: point.z };
    state.heading = dock.docking!.heading;
    const other = { ...dock, id: "other-berth" };
    const world = { ...FAIR_WINDS_WORLD, objects: [dock, other] };
    expect(evaluateDocking(state, HARBOR_20, world, dock)?.object).toBe(other);
    expect(evaluateIncident(state, HARBOR_20, world, 0, dock).object).toBe(other);
    const resetDeparture = retainDockDeparture(state, undefined);
    expect(resetDeparture).toBeUndefined();
    expect(evaluateDocking(state, HARBOR_20, world, resetDeparture)?.object).toBe(dock);
  });

  it("keeps collision and grounding detection active while leaving a berth", () => {
    const state = createInitialState();
    state.position = { x: dock.x, y: dock.z };
    state.heading = dock.docking!.heading;
    expect(evaluateIncident(state, HARBOR_20, FAIR_WINDS_WORLD, 0, dock).kind).toBe("collision");
    const shoalWorld = { ...FAIR_WINDS_WORLD, objects: [ { ...dock, collision: undefined } ], sampleDepth: () => 0 };
    state.position = { x: point.x, y: point.z };
    expect(evaluateIncident(state, HARBOR_20, shoalWorld, 0, dock).kind).toBe("grounding");
  });
});
