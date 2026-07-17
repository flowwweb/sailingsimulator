import { describe, expect, it } from "vitest";
import { createInitialState } from "../sim/model";
import { HARBOR_20 } from "../sim/boats";
import { DEFAULT_WEATHER, type WeatherSnapshot } from "../weather/types";
import { WeatherSystem } from "../weather/weather";
import { sampleWaves } from "../weather/waves";
import { wakeSurfacePoints } from "./wake-surface";

describe("wake surface placement", () => {
  it("keeps both wake rails just above the local tide and wave surface", () => {
    const weather = new WeatherSystem(DEFAULT_WEATHER).sample(37) as WeatherSnapshot;
    const state = {
      ...createInitialState(),
      position: { x: 24, y: -18 },
      heading: Math.PI / 3,
    };

    for (const point of wakeSurfacePoints(state, HARBOR_20, weather)) {
      const surface =
        weather.tideLevel +
        sampleWaves(weather.waves, point.x, point.z, weather.time).height;
      expect(point.y).toBeGreaterThan(surface);
      expect(point.y - surface).toBeCloseTo(0.035, 6);
    }
  });
});
