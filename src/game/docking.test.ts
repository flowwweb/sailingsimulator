import { describe, expect, it } from "vitest";
import { HARBOR_20 } from "../sim/boats";
import { createInitialState } from "../sim/model";
import { dockingPoint, evaluateDocking, mooredBoatState } from "./docking";
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
});
