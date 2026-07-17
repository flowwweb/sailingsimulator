export const LAKE_RADIUS = 1_800;

export interface LakeShoal {
  id: string;
  x: number;
  z: number;
  islandRadius: number;
  shelfRadius: number;
}

export const LAKE_SHOALS: readonly LakeShoal[] = [
  {
    id: "pine-islet",
    x: -650,
    z: 400,
    islandRadius: 65,
    shelfRadius: 170,
  },
  {
    id: "beacon-west-headland",
    x: -320,
    z: 1_050,
    islandRadius: 500,
    shelfRadius: 620,
  },
  {
    id: "north-light",
    x: 980,
    z: 720,
    islandRadius: 300,
    shelfRadius: 400,
  },
  {
    id: "juniper-cove",
    x: 980,
    z: -510,
    islandRadius: 105,
    shelfRadius: 230,
  },
  {
    id: "gull-key",
    x: -930,
    z: -430,
    islandRadius: 48,
    shelfRadius: 135,
  },
  {
    id: "cedar-point",
    x: 1_180,
    z: 220,
    islandRadius: 70,
    shelfRadius: 170,
  },
];

export function lakeShoalFor(id: string): LakeShoal | undefined {
  return LAKE_SHOALS.find((shoal) => shoal.id === id);
}

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
