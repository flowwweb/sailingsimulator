import {
  shoalDistance,
  type LakeShoal,
} from "../game/bathymetry";

export function landmarkGroundHeight(
  shoal: LakeShoal,
  worldX: number,
  worldZ: number,
  islandHeight: number,
  summitHeight: number,
): number {
  const distance = shoalDistance(shoal, worldX, worldZ);
  const inner = shoal.islandRadius * 0.46;
  const outer = shoal.islandRadius * 1.02;
  const progress = smootherstep(inner, outer, distance);
  return summitHeight + (1.6 - summitHeight) * progress;
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
