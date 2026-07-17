import { describe, expect, it } from "vitest";
import { createInitialState } from "../sim/model";
import { COASTAL_28, HARBOR_20 } from "../sim/boats";
import { evaluateIncident } from "./hazards";

describe("deterministic grounding and object hazards", () => {
  it("keeps the training boat clear in deep school water", () => {
    const state = createInitialState();
    state.position = { x: 610, y: 400 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("clear");
    expect(incident.severity).toBe("none");
  });

  it("makes deeper-draft boats ground on routes the trainer can clear", () => {
    const state = createInitialState();
    state.position = { x: 1_580, y: 0 };

    const trainer = evaluateIncident(state, HARBOR_20);
    const coastal = evaluateIncident(state, COASTAL_28);

    expect(trainer.kind).toBe("clear");
    expect(coastal.kind).toBe("grounding");
    expect(coastal.clearance).toBeLessThanOrEqual(0.08);
  });

  it("uses tidal water level when calculating grounding clearance", () => {
    const state = createInitialState();
    state.position = { x: 1_580, y: 0 };

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
    state.position = { x: 980, y: 720 };
    state.velocity = { x: 2.1, y: 0.4 };
    const incident = evaluateIncident(state, HARBOR_20);

    expect(incident.kind).toBe("collision");
    expect(incident.object?.id).toBe("north-light");
  });
});
