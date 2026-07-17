import type { BoatState } from "../sim/model";
import type { BoatDefinition } from "../sim/boats";
import type { WeatherSnapshot } from "../weather/types";
import { sampleWaves } from "../weather/waves";

export interface WakeSurfacePoint {
  x: number;
  y: number;
  z: number;
}

const WAKE_SURFACE_CLEARANCE = 0.035;

export function wakeSurfacePoints(
  state: BoatState,
  boat: BoatDefinition,
  weather: WeatherSnapshot,
): readonly [WakeSurfacePoint, WakeSurfacePoint] {
  const starboardX = Math.cos(state.heading);
  const starboardZ = -Math.sin(state.heading);
  const sternOffset = boat.hull.length * 0.53;
  const halfWidth = boat.hull.beam * 0.42;
  const sternX = state.position.x - Math.sin(state.heading) * sternOffset;
  const sternZ = state.position.y - Math.cos(state.heading) * sternOffset;

  const pointAt = (side: number): WakeSurfacePoint => {
    const x = sternX + starboardX * halfWidth * side;
    const z = sternZ + starboardZ * halfWidth * side;
    return {
      x,
      y:
        weather.tideLevel +
        sampleWaves(weather.waves, x, z, weather.time).height +
        WAKE_SURFACE_CLEARANCE,
      z,
    };
  };

  return [pointAt(-1), pointAt(1)];
}
