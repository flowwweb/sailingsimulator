export const LAKE_RADIUS = 1_800;

export interface OrganicShape {
  scaleX: number;
  scaleZ: number;
  rotation: number;
  irregularity: number;
  phase: number;
}

export interface LakeShoal extends OrganicShape {
  id: string;
  x: number;
  z: number;
  islandRadius: number;
  shelfRadius: number;
}

export const LAKE_BASIN: OrganicShape & {
  radiusX: number;
  radiusZ: number;
} = {
  radiusX: 1_720,
  radiusZ: 1_570,
  scaleX: 1,
  scaleZ: 1,
  rotation: -0.1,
  irregularity: 0.085,
  phase: 0.62,
};

export const LAKE_SHOALS: readonly LakeShoal[] = [
  {
    id: "pine-islet",
    x: -650,
    z: 400,
    islandRadius: 78,
    shelfRadius: 185,
    scaleX: 1.5,
    scaleZ: 0.72,
    rotation: 0.48,
    irregularity: 0.16,
    phase: 1.1,
  },
  {
    id: "beacon-west-headland",
    x: -320,
    z: 1_300,
    islandRadius: 420,
    shelfRadius: 550,
    scaleX: 1.25,
    scaleZ: 1.42,
    rotation: -0.16,
    irregularity: 0.12,
    phase: 0.35,
  },
  {
    id: "north-light",
    x: 1_050,
    z: 1_160,
    islandRadius: 320,
    shelfRadius: 430,
    scaleX: 0.9,
    scaleZ: 1.35,
    rotation: 0.18,
    irregularity: 0.11,
    phase: 2.1,
  },
  {
    id: "juniper-cove",
    x: 1_390,
    z: -520,
    islandRadius: 280,
    shelfRadius: 400,
    scaleX: 1.16,
    scaleZ: 0.76,
    rotation: 0.14,
    irregularity: 0.13,
    phase: 4.2,
  },
  {
    id: "gull-key",
    x: -930,
    z: -430,
    islandRadius: 70,
    shelfRadius: 150,
    scaleX: 1.8,
    scaleZ: 0.64,
    rotation: -0.56,
    irregularity: 0.17,
    phase: 3.35,
  },
  {
    id: "cedar-point",
    x: 1_450,
    z: 200,
    islandRadius: 260,
    shelfRadius: 380,
    scaleX: 1.1,
    scaleZ: 0.5,
    rotation: 0.16,
    irregularity: 0.14,
    phase: 5.1,
  },
];

export function lakeShoalFor(id: string): LakeShoal | undefined {
  return LAKE_SHOALS.find((shoal) => shoal.id === id);
}

export function isInsideLake(x: number, z: number): boolean {
  return lakeBoundaryDistance(x, z) < 1;
}

export function lakeBoundaryDistance(x: number, z: number): number {
  return organicDistance(
    x,
    z,
    LAKE_BASIN.radiusX,
    LAKE_BASIN.radiusZ,
    LAKE_BASIN,
  );
}

export function shoalDistance(
  shoal: LakeShoal,
  x: number,
  z: number,
): number {
  return organicDistance(
    x - shoal.x,
    z - shoal.z,
    shoal.scaleX,
    shoal.scaleZ,
    shoal,
  );
}

export function sampleLakeDepth(x: number, z: number): number {
  const boundaryDistance = lakeBoundaryDistance(x, z);
  if (boundaryDistance >= 1) return 0;

  const edgeProgress = 1 - boundaryDistance;
  const basinDepth = 36 * smootherstep(0, 0.66, edgeProgress);
  const depthVariation = (
    2.4 * Math.sin((x + 140) / 430) * Math.cos((z - 80) / 520) +
    1.1 * Math.sin((x - z) / 310)
  ) * smootherstep(0.08, 0.55, edgeProgress);
  let depth = Math.min(38, Math.max(0, basinDepth + depthVariation));

  for (const shoal of LAKE_SHOALS) {
    const distance = shoalDistance(shoal, x, z);
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

function organicDistance(
  x: number,
  z: number,
  scaleX: number,
  scaleZ: number,
  shape: OrganicShape,
): number {
  const cosine = Math.cos(shape.rotation);
  const sine = Math.sin(shape.rotation);
  const localX = (x * cosine + z * sine) / scaleX;
  const localZ = (-x * sine + z * cosine) / scaleZ;
  const angle = Math.atan2(localZ, localX);
  return Math.hypot(localX, localZ) /
    organicRadius(angle, shape.irregularity, shape.phase);
}

function organicRadius(
  angle: number,
  irregularity: number,
  phase: number,
): number {
  return 1 + irregularity * (
    0.6 * Math.sin(angle * 3 + phase) +
    0.27 * Math.sin(angle * 5 - phase * 0.7) +
    0.13 * Math.sin(angle * 8 + phase * 1.9)
  );
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
