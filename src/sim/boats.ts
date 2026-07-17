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
  visual: {
    rigForwardOffset: number;
    playerHullColor: number;
    playerSailColor: number;
    npcHullColor: number;
    npcSailColor: number;
    npcTrimColor: number;
  };
}

export const HARBOR_20: BoatDefinition = {
  id: "harbor-20",
  name: "Fair Winds Dinghy",
  description: "Stable open centerboard dinghy with one mainsail.",
  hull: {
    length: 4.65,
    beam: 1.72,
    draft: 0.82,
    displacement: 520,
    yawInertia: 1_500,
    rightingArm: 0.5,
    longitudinalDragLinear: 55,
    longitudinalDragQuadratic: 25,
    lateralResistanceLinear: 520,
    lateralResistanceQuadratic: 280,
  },
  rudder: {
    maximumAngleDegrees: 32,
    responseRate: 8,
    forceFactor: 180,
    lever: 1.75,
  },
  sailPlan: [
    {
      id: "harbor-main",
      kind: "mainsail",
      area: 10.8,
      designAngleDegrees: 14,
      forceCenterForward: 0.15,
      forceCenterHeight: 2.5,
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
  collision: { halfLength: 2.2, halfBeam: 0.78 },
  camera: { distance: 14.5, height: 6.2, lookAhead: 4.5 },
  visual: { rigForwardOffset: 0.48, playerHullColor: 0xf0eee8, playerSailColor: 0xf5f2e9, npcHullColor: 0x2f6f78, npcSailColor: 0xe7e0cf, npcTrimColor: 0xd49a4a },
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
  visual: { rigForwardOffset: 0, playerHullColor: 0xe8e4db, playerSailColor: 0xf2efe5, npcHullColor: 0x9a4d3f, npcSailColor: 0xe9e4d7, npcTrimColor: 0x294f5a },
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
  visual: { rigForwardOffset: -0.08, playerHullColor: 0xdfe5e3, playerSailColor: 0xeee9dc, npcHullColor: 0x334d68, npcSailColor: 0xe4dfd2, npcTrimColor: 0xc7b06c },
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
