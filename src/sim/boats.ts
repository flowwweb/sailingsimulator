export type BoatId = "harbor-20" | "coastal-28" | "lake-34";
export type SailKind = "mainsail" | "headsail";

export interface SailDefinition {
  id: string;
  kind: SailKind;
  area: number;
  designAngleDegrees: number;
  forceCenterForward: number;
  forceCenterHeight: number;
}

export interface PolarPoint {
  trueWindAngleDegrees: number;
  speedToWindRatio: number;
}

export interface BoatDefinition {
  id: BoatId;
  name: string;
  description: string;
  hull: {
    length: number;
    beam: number;
    draft: number;
    displacement: number;
    yawInertia: number;
    rightingArm: number;
    longitudinalDragLinear: number;
    longitudinalDragQuadratic: number;
    lateralResistanceLinear: number;
    lateralResistanceQuadratic: number;
  };
  rudder: {
    maximumAngleDegrees: number;
    responseRate: number;
    forceFactor: number;
    lever: number;
  };
  sailPlan: readonly SailDefinition[];
  polar: readonly PolarPoint[];
  collision: {
    halfLength: number;
    halfBeam: number;
  };
  camera: {
    distance: number;
    height: number;
    lookAhead: number;
  };
}

export const HARBOR_20: BoatDefinition = {
  id: "harbor-20",
  name: "Harbor 20",
  description: "Forgiving ballasted training keelboat with one mainsail.",
  hull: {
    length: 6.05,
    beam: 2.18,
    draft: 1.12,
    displacement: 1_100,
    yawInertia: 4_200,
    rightingArm: 0.72,
    longitudinalDragLinear: 95,
    longitudinalDragQuadratic: 42,
    lateralResistanceLinear: 880,
    lateralResistanceQuadratic: 520,
  },
  rudder: {
    maximumAngleDegrees: 28,
    responseRate: 7,
    forceFactor: 250,
    lever: 2.4,
  },
  sailPlan: [
    {
      id: "harbor-main",
      kind: "mainsail",
      area: 18,
      designAngleDegrees: 14,
      forceCenterForward: 0.25,
      forceCenterHeight: 3.8,
    },
  ],
  polar: [
    { trueWindAngleDegrees: 40, speedToWindRatio: 0.43 },
    { trueWindAngleDegrees: 55, speedToWindRatio: 0.55 },
    { trueWindAngleDegrees: 75, speedToWindRatio: 0.68 },
    { trueWindAngleDegrees: 90, speedToWindRatio: 0.72 },
    { trueWindAngleDegrees: 115, speedToWindRatio: 0.66 },
    { trueWindAngleDegrees: 145, speedToWindRatio: 0.56 },
    { trueWindAngleDegrees: 180, speedToWindRatio: 0.48 },
  ],
  collision: { halfLength: 2.85, halfBeam: 0.98 },
  camera: { distance: 13.5, height: 7.2, lookAhead: 5.8 },
};

export const COASTAL_28: BoatDefinition = {
  id: "coastal-28",
  name: "Coastal 28",
  description: "Responsive coastal sloop with mainsail and optional headsail.",
  hull: {
    length: 8.55,
    beam: 2.82,
    draft: 1.62,
    displacement: 3_150,
    yawInertia: 14_800,
    rightingArm: 0.94,
    longitudinalDragLinear: 145,
    longitudinalDragQuadratic: 63,
    lateralResistanceLinear: 1_520,
    lateralResistanceQuadratic: 780,
  },
  rudder: {
    maximumAngleDegrees: 30,
    responseRate: 5.8,
    forceFactor: 390,
    lever: 3.5,
  },
  sailPlan: [
    {
      id: "coastal-main",
      kind: "mainsail",
      area: 24,
      designAngleDegrees: 13,
      forceCenterForward: 0.1,
      forceCenterHeight: 5.1,
    },
    {
      id: "coastal-headsail",
      kind: "headsail",
      area: 16,
      designAngleDegrees: 12,
      forceCenterForward: 2.2,
      forceCenterHeight: 3.6,
    },
  ],
  polar: [
    { trueWindAngleDegrees: 38, speedToWindRatio: 0.5 },
    { trueWindAngleDegrees: 52, speedToWindRatio: 0.66 },
    { trueWindAngleDegrees: 75, speedToWindRatio: 0.82 },
    { trueWindAngleDegrees: 90, speedToWindRatio: 0.88 },
    { trueWindAngleDegrees: 115, speedToWindRatio: 0.81 },
    { trueWindAngleDegrees: 145, speedToWindRatio: 0.68 },
    { trueWindAngleDegrees: 180, speedToWindRatio: 0.58 },
  ],
  collision: { halfLength: 4.05, halfBeam: 1.28 },
  camera: { distance: 17.5, height: 9.1, lookAhead: 7.4 },
};

export const LAKE_34: BoatDefinition = {
  id: "lake-34",
  name: "Lake 34",
  description: "Heavy cruising monohull with deep draft and steady momentum.",
  hull: {
    length: 10.35,
    beam: 3.38,
    draft: 1.96,
    displacement: 5_650,
    yawInertia: 31_000,
    rightingArm: 1.08,
    longitudinalDragLinear: 205,
    longitudinalDragQuadratic: 84,
    lateralResistanceLinear: 2_260,
    lateralResistanceQuadratic: 1_020,
  },
  rudder: {
    maximumAngleDegrees: 32,
    responseRate: 4.6,
    forceFactor: 510,
    lever: 4.2,
  },
  sailPlan: [
    {
      id: "lake-main",
      kind: "mainsail",
      area: 34,
      designAngleDegrees: 13,
      forceCenterForward: 0,
      forceCenterHeight: 6.3,
    },
    {
      id: "lake-headsail",
      kind: "headsail",
      area: 24,
      designAngleDegrees: 11,
      forceCenterForward: 2.8,
      forceCenterHeight: 4.5,
    },
  ],
  polar: [
    { trueWindAngleDegrees: 40, speedToWindRatio: 0.46 },
    { trueWindAngleDegrees: 55, speedToWindRatio: 0.61 },
    { trueWindAngleDegrees: 75, speedToWindRatio: 0.76 },
    { trueWindAngleDegrees: 90, speedToWindRatio: 0.8 },
    { trueWindAngleDegrees: 115, speedToWindRatio: 0.75 },
    { trueWindAngleDegrees: 145, speedToWindRatio: 0.65 },
    { trueWindAngleDegrees: 180, speedToWindRatio: 0.55 },
  ],
  collision: { halfLength: 4.92, halfBeam: 1.55 },
  camera: { distance: 21, height: 10.8, lookAhead: 8.8 },
};

export const BOAT_DEFINITIONS: Readonly<Record<BoatId, BoatDefinition>> = {
  "harbor-20": HARBOR_20,
  "coastal-28": COASTAL_28,
  "lake-34": LAKE_34,
};

export function getBoatDefinition(id: BoatId): BoatDefinition {
  return BOAT_DEFINITIONS[id];
}

export function getSailDefinition(
  boat: BoatDefinition,
  kind: SailKind,
): SailDefinition | undefined {
  return boat.sailPlan.find((sail) => sail.kind === kind);
}

export function referencePolarSpeed(
  boat: BoatDefinition,
  trueWindAngleRadians: number,
  trueWindSpeed: number,
): number {
  const angle = Math.min(
    Math.abs((trueWindAngleRadians * 180) / Math.PI),
    180,
  );
  if (angle < boat.polar[0]!.trueWindAngleDegrees || trueWindSpeed <= 0) return 0;

  for (let index = 1; index < boat.polar.length; index += 1) {
    const lower = boat.polar[index - 1]!;
    const upper = boat.polar[index]!;
    if (angle > upper.trueWindAngleDegrees) continue;
    const span = upper.trueWindAngleDegrees - lower.trueWindAngleDegrees;
    const t = span <= 0 ? 0 : (angle - lower.trueWindAngleDegrees) / span;
    const ratio =
      lower.speedToWindRatio +
      (upper.speedToWindRatio - lower.speedToWindRatio) * t;
    return trueWindSpeed * ratio;
  }

  return trueWindSpeed * boat.polar.at(-1)!.speedToWindRatio;
}
