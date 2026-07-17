import { describe, expect, it } from "vitest";
import { lakeShoalFor, sampleLakeDepth } from "./bathymetry";
import { FAIR_WINDS_WORLD } from "./world-definition";

describe("authored Fair Winds lake layout", () => {
  it("starts the player in deep water inside a genuinely sailable channel", () => {
    expect(
      sampleLakeDepth(
        FAIR_WINDS_WORLD.spawn.x,
        FAIR_WINDS_WORLD.spawn.z,
      ),
    ).toBeGreaterThan(10);

    const channel = FAIR_WINDS_WORLD.routes.find(
      (route) => route.id === "lantern-channel-route",
    );
    expect(channel).toBeDefined();
    for (const point of channel!.points) {
      expect(sampleLakeDepth(point.x, point.z)).toBeGreaterThanOrEqual(
        channel!.minimumDepth,
      );
    }
  });

  it("keeps wide water between the two Lantern Channel shores", () => {
    const cedarHead = lakeShoalFor("beacon-west-headland")!;
    const northLight = lakeShoalFor("north-light")!;
    const dryGap =
      northLight.x -
      cedarHead.x -
      cedarHead.islandRadius -
      northLight.islandRadius;

    expect(dryGap).toBeGreaterThanOrEqual(500);
    expect(sampleLakeDepth(600, 710)).toBeGreaterThan(10);
  });

  it("provides distinct chart areas and course destinations", () => {
    expect(new Set(FAIR_WINDS_WORLD.regions.map((region) => region.purpose))).toEqual(
      new Set(["lesson", "navigation", "exploration", "weather", "harbor"]),
    );
    expect(FAIR_WINDS_WORLD.activities.length).toBeGreaterThanOrEqual(7);
    expect(
      new Set(FAIR_WINDS_WORLD.activities.map((activity) => activity.kind)),
    ).toEqual(new Set(["lesson", "mission", "exploration"]));
    expect(
      new Set(FAIR_WINDS_WORLD.activities.map((activity) => activity.id)).size,
    ).toBe(FAIR_WINDS_WORLD.activities.length);
    for (const activity of FAIR_WINDS_WORLD.activities) {
      expect(Math.hypot(activity.x, activity.z)).toBeLessThan(
        FAIR_WINDS_WORLD.radius,
      );
    }
  });
});
