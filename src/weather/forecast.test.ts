import { describe, expect, it } from "vitest";
import { weatherTrend } from "./forecast";

describe("weather trend", () => {
  it("calls an early reef when stronger air is approaching", () => {
    const trend = weatherTrend(
      { windSpeed: 6, windDirectionFromDegrees: 350, rain: 0.1 },
      { windSpeed: 10.2, windDirectionFromDegrees: 12, rain: 0.35 },
    );
    expect(trend.windDelta).toBeCloseTo(4.2);
    expect(trend.directionDelta).toBe(22);
    expect(trend.reefAdvice).toBe("reef-now");
    expect(trend.summary).toContain("rain increasing");
  });

  it("keeps full sail advice for stable learning weather", () => {
    expect(
      weatherTrend(
        { windSpeed: 5.2, windDirectionFromDegrees: 90, rain: 0 },
        { windSpeed: 5.5, windDirectionFromDegrees: 94, rain: 0.02 },
      ).reefAdvice,
    ).toBe("full-sail");
  });
});
