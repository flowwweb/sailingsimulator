import { describe, expect, it } from "vitest";
import { sailableRouteHeading, trafficCommand } from "./traffic-navigation";

describe("NPC COLREGS navigation", () => {
  it("alters to starboard and slows in a head-on meeting", () => {
    const command = trafficCommand(
      { x: 0, z: 0, heading: 0, speed: 3 },
      { x: 0, z: 80, heading: Math.PI, speed: 3 },
      0,
      4,
      1,
    );
    expect(command.giveWay).toBe(true);
    expect(command.heading).toBeGreaterThan(0);
    expect(command.speed).toBeLessThan(3);
  });

  it("stands on when the other vessel is on its port side", () => {
    const command = trafficCommand(
      { x: 0, z: 0, heading: 0, speed: 3 },
      { x: -60, z: 70, heading: Math.PI / 2, speed: 3 },
      0,
      4,
      1,
    );
    expect(command.giveWay).toBe(false);
    expect(command.heading).toBeCloseTo(0);
  });

  it("chooses a tack rather than motoring straight into the no-go zone", () => {
    expect(sailableRouteHeading(0.1, 0, 1)).toBeCloseTo((42 * Math.PI) / 180);
    expect(sailableRouteHeading(-0.1, 0, -1)).toBeCloseTo((-42 * Math.PI) / 180);
    expect(sailableRouteHeading(Math.PI / 2, 0, 1)).toBeCloseTo(Math.PI / 2);
  });
});
