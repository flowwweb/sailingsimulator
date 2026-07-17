export const LAKE_RADIUS = 1_800;

export interface LakeShoal {
  x: number;
  z: number;
  islandRadius: number;
  shelfRadius: number;
}

export const LAKE_SHOALS: readonly LakeShoal[] = [
  { x: -520, z: 430, islandRadius: 55, shelfRadius: 160 },
  { x: 560, z: 585, islandRadius: 74, shelfRadius: 178 },
  { x: 690, z: 620, islandRadius: 52, shelfRadius: 155 },
  { x: 915, z: -440, islandRadius: 90, shelfRadius: 210 },
];

export function sampleLakeDepth(x: number, z: number): number {
  const distanceFromCenter = Math.hypot(x, z);
  if (distanceFromCenter >= LAKE_RADIUS) return 0;

  const edgeProgress = 1 - distanceFromCenter / LAKE_RADIUS;
  let depth = 36 * smootherstep(0, 0.72, edgeProgress);

  for (const shoal of LAKE_SHOALS) {
    const distance = Math.hypot(x - shoal.x, z - shoal.z);
    if (distance >= shoal.shelfRadius) continue;
    const shelfDepth = 12 * smootherstep(
      shoal.islandRadius,
      shoal.shelfRadius,
      distance,
    );
    depth = Math.min(depth, shelfDepth);
  }

  return Math.max(0, depth);
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
