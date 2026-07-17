import { describe, expect, it } from "vitest";
import { buoyVisualSpec } from "./buoy-visual";

describe("lateral buoy visuals", () => {
  it("keeps port and starboard marks distinct and upright", () => {
    const port = buoyVisualSpec("port");
    const starboard = buoyVisualSpec("starboard");

    expect(port.color).not.toBe(starboard.color);
    expect(port.topmark).toBe("can");
    expect(starboard.topmark).toBe("cone");
  });
});
