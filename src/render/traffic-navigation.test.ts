import { describe, expect, it } from "vitest";
import {
  classifyEncounter,
  sailableRouteHeading,
  trafficCommand,
} from "./traffic-navigation";

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

  it("coaches the player to give way to closing traffic on starboard", () => {
    const advisory = classifyEncounter(
      { x: 0, z: 0, heading: 0, speed: 2 },
      { x: 40, z: 50, heading: -Math.PI / 2, speed: 2 },
    );
    expect(advisory.type).toBe("crossing");
    expect(advisory.role).toBe("give-way");
    expect(advisory.advice).toContain("starboard");
  });

  it("identifies a stand-on crossing and ignores opening traffic", () => {
    const standOn = classifyEncounter(
      { x: 0, z: 0, heading: 0, speed: 2 },
      { x: -40, z: 50, heading: Math.PI / 2, speed: 2 },
    );
    expect(standOn.role).toBe("stand-on");
    const opening = classifyEncounter(
      { x: 0, z: 0, heading: 0, speed: 2 },
      { x: 0, z: 50, heading: 0, speed: 3 },
    );
    expect(opening.type).toBe("clear");
  });
});
