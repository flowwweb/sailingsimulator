import { describe, expect, it } from "vitest";
import {
  classifyEncounter,
  sailableRouteHeading,
  trafficCommand,
} from "./traffic-navigation";

describe("ambient traffic navigation", () => {
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

  it("keeps its route when the other vessel is on its port side", () => {
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

  it("warns about closing boats without inventing a rule or role", () => {
    const own = { x: 0, z: 0, heading: 0, speed: 2 };
    for (const other of [
      { x: 40, z: 50, heading: -Math.PI / 2, speed: 2 },
      { x: -40, z: 50, heading: Math.PI / 2, speed: 2 },
      { x: 0, z: 50, heading: Math.PI, speed: 2 },
    ]) {
      const advisory = classifyEncounter(own, other);
      expect(advisory.type).toBe("traffic");
      expect(advisory.role).toBe("traffic");
      expect(advisory.advice).toBe("Traffic closing · maintain lookout");
    }
  });

  it("does not present opening or distant traffic as closing", () => {
    const opening = classifyEncounter(
      { x: 0, z: 0, heading: 0, speed: 2 },
      { x: 0, z: 50, heading: 0, speed: 3 },
    );
    expect(opening.type).toBe("clear");
    const distant = classifyEncounter(
      { x: 0, z: 0, heading: 0, speed: 2 },
      { x: 0, z: 181, heading: Math.PI, speed: 2 },
    );
    expect(distant.type).toBe("clear");
  });

  it("keeps stationary and coincident nearby vessels visible", () => {
    const own = { x: 0, z: 0, heading: 0, speed: 0 };
    for (const x of [0, 5]) {
      const advisory = classifyEncounter(own, { x, z: 0, heading: 0, speed: 0 });
      expect(advisory.type).toBe("traffic");
      expect(advisory.advice).toBe("Traffic nearby · maintain lookout");
    }
  });

  it("keeps a close vessel visible even while moving away", () => {
    const own = { x: 0, z: 0, heading: 0, speed: 0 };
    const advisory = classifyEncounter(own, { x: 2, z: 0, heading: Math.PI / 2, speed: 2 });
    expect(advisory.type).toBe("traffic");
    expect(advisory.advice).toBe("Traffic nearby · maintain lookout");
  });

  it("uses actual motion instead of heading when the boat is making leeway", () => {
    const own = { x: 0, z: 0, heading: 0, speed: 2, velocity: { x: 2, z: 0 } };
    const other = { x: 20, z: 0, heading: 0, speed: 0 };
    expect(classifyEncounter(own, other).advice).toBe("Traffic closing · maintain lookout");
    expect(classifyEncounter({ ...own, velocity: { x: -2, z: 0 } }, other).type).toBe("clear");
  });
});
