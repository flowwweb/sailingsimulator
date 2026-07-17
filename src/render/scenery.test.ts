import { describe, expect, it } from "vitest";
import { lightingForTime } from "./scenery";

describe("cinematic lighting palette", () => {
  it("creates bright warm golden hour and dark star-visible night", () => {
    const sunset = lightingForTime(17.4, 0.12, 1);
    const night = lightingForTime(23, 0.08, 1);

    expect(sunset.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(sunset.exposure).toBeGreaterThan(night.exposure);
    expect(night.starOpacity).toBeGreaterThan(0.5);
    expect(sunset.starOpacity).toBeLessThan(night.starOpacity);
  });

  it("dims direct light and compresses the palette under cloud", () => {
    const clear = lightingForTime(13, 0, 1);
    const overcast = lightingForTime(13, 1, 0.7);

    expect(overcast.sunIntensity).toBeLessThan(clear.sunIntensity);
    expect(overcast.exposure).toBeLessThan(clear.exposure);
    expect(overcast.fog.getHex()).not.toBe(clear.fog.getHex());
  });
});
