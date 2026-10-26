import { describe, expect, it } from "vitest";
import { createInitialState } from "../sim/model";
import { BOAT_DEFINITIONS, COASTAL_28, HARBOR_20 } from "../sim/boats";
import { evaluateIncident } from "./hazards";
import { FAIR_WINDS_WORLD } from "./world-definition";
import { LAKE_SHOALS } from "./bathymetry";

describe("deterministic grounding and object hazards", () => {
  it("grounds all five drafts at retained inland and outside-lake points at every supported tide", () => {
    const permanentLand = { ...FAIR_WINDS_WORLD, objects: [] };
    for (const [x, z] of [[1390, -520], [1240, -490], [2200, 0], ...LAKE_SHOALS.map(shoal => [shoal.x, shoal.z])]) {
      for (const tide of [-3, -1.5, -0.6, 0.6, 1.5, 3]) for (const boat of Object.values(BOAT_DEFINITIONS)) {
        const state = createInitialState(); state.position = { x: x!, y: z! };
        const result = evaluateIncident(state, boat, permanentLand, tide);
        expect(result.kind, `${x},${z} tide${tide} ${boat.id}`).toBe("grounding");
        expect(result.depth).toBe(0);
        expect(result.clearance).toBe(-boat.hull.draft);
      }
    }
  });

  it("preserves custom world depth and detects dry bow, center and stern contact at high tide", () => {
    const state = createInitialState(); state.position = { x: 0, y: 0 }; state.heading = Math.PI / 2;
    for (const sampleDepth of [(x: number) => x > 1 ? 0 : 4, (x: number) => x < -1 ? 0 : 4, (x: number) => Math.abs(x) < 0.5 ? 0 : 4]) {
      const world = { ...FAIR_WINDS_WORLD, objects: [], sampleDepth };
      expect(evaluateIncident(state, HARBOR_20, world, 1.5).depth).toBe(0);
      expect(evaluateIncident(state, HARBOR_20, world, 1.5).kind).toBe("grounding");
    }
    const water = { ...FAIR_WINDS_WORLD, objects: [], sampleDepth: () => 1 };
    expect(evaluateIncident(state, HARBOR_20, water, 1.5).kind).toBe("clear");
    expect(evaluateIncident(state, HARBOR_20, water, -0.2).kind).toBe("grounding");
    expect(evaluateIncident(state, HARBOR_20, water, -1.5).depth).toBe(0);
  });
  it("keeps the training boat clear in deep school water", () => {
    const state = createInitialState();
    state.position = { x: 610, y: 400 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("clear");
    expect(incident.severity).toBe("none");
  });

  it("makes deeper-draft boats ground on routes the trainer can clear", () => {
    const state = createInitialState();
    state.position = { x: 1_590, y: 0 };

    const trainer = evaluateIncident(state, HARBOR_20);
    const coastal = evaluateIncident(state, COASTAL_28);

    expect(trainer.kind).toBe("clear");
    expect(coastal.kind).toBe("grounding");
    expect(coastal.clearance).toBeLessThanOrEqual(0.08);
  });

  it("uses tidal water level when calculating grounding clearance", () => {
    const state = createInitialState();
    state.position = { x: 1_590, y: 0 };

    const lowWater = evaluateIncident(state, COASTAL_28, undefined, -0.5);
    const highWater = evaluateIncident(state, COASTAL_28, undefined, 2);

    expect(lowWater.kind).toBe("grounding");
    expect(highWater.kind).toBe("clear");
  });

  it("treats a slow buoy brush as a recoverable touch", () => {
    const state = createInitialState();
    state.position = { x: 210, y: -310 };
    state.velocity = { x: 0.3, y: 0.2 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("touch");
    expect(incident.severity).toBe("touch");
    expect(incident.object?.id).toBe("juniper-buoy");
  });

  it("treats a moving rock strike as an impact", () => {
    const state = createInitialState();
    state.position = { x: -586, y: 396 };
    state.velocity = { x: 2.4, y: 0.6 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("collision");
    expect(incident.severity).toBe("impact");
    expect(incident.object?.kind).toBe("rock");
  });

  it("reports a controlled Juniper pier arrival as docking", () => {
    const dock = FAIR_WINDS_WORLD.objects.find(
      (object) => object.id === "juniper-cove-dock",
    )!;
    const state = createInitialState();
    state.position = { x: 1_044, y: -479 };
    state.heading = dock.docking!.heading;
    state.velocity = { x: 0.2, y: 0.1 };

    const incident = evaluateIncident(state, HARBOR_20);
    expect(incident.kind).toBe("docking");
    expect(incident.object?.id).toBe("juniper-cove-dock");
  });

  it("reports high-speed grounding as an impact", () => {
    const state = createInitialState();
    state.position = { x: 1_700, y: 0 };
    state.velocity = { x: 3, y: 0 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("grounding");
    expect(incident.severity).toBe("impact");
    expect(incident.depth).toBeLessThan(HARBOR_20.hull.draft);
  });

  it("makes the North Light island a real collision hazard", () => {
    const state = createInitialState();
    state.position = { x: 1_050, y: 1_160 };
    state.velocity = { x: 2.1, y: 0.4 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("collision");
    expect(incident.object?.id).toBe("north-light");
  });
});
