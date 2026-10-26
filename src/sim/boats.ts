export type BoatId =
  | "harbor-20"
  | "cove-24"
  | "coastal-28"
  | "sound-30"
  | "lake-34";
export type SailKind = "mainsail" | "headsail";
export type BoatProfile =
  | "open"
  | "daysailer"
  | "coastal"
  | "workboat"
  | "cruiser";

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
    profile: BoatProfile;
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
  visual: { profile: "open", rigForwardOffset: 0.48, playerHullColor: 0xf0eee8, playerSailColor: 0xf5f2e9, npcHullColor: 0x2f6f78, npcSailColor: 0xe7e0cf, npcTrimColor: 0xd49a4a },
};

export const COVE_24: BoatDefinition = {
  id: "cove-24",
  name: "Juniper 24",
  description: "Light day-sailer with a protected cockpit and balanced sloop rig.",
  hull: {
    length: 7.32,
    beam: 2.36,
    draft: 1.18,
    displacement: 1_720,
    yawInertia: 7_300,
    rightingArm: 0.76,
    longitudinalDragLinear: 102,
    longitudinalDragQuadratic: 47,
    lateralResistanceLinear: 1_040,
    lateralResistanceQuadratic: 530,
  },
  rudder: {
    maximumAngleDegrees: 31,
    responseRate: 6.7,
    forceFactor: 315,
    lever: 2.85,
  },
  sailPlan: [
    {
      id: "cove-main",
      kind: "mainsail",
      area: 18.6,
      designAngleDegrees: 13.5,
      forceCenterForward: 0.12,
      forceCenterHeight: 4.1,
    },
    {
      id: "cove-headsail",
      kind: "headsail",
      area: 10.8,
      designAngleDegrees: 12.5,
      forceCenterForward: 1.72,
      forceCenterHeight: 2.9,
    },
  ],
  polar: [
    { trueWindAngleDegrees: 39, speedToWindRatio: 0.49 },
    { trueWindAngleDegrees: 53, speedToWindRatio: 0.64 },
    { trueWindAngleDegrees: 75, speedToWindRatio: 0.79 },
    { trueWindAngleDegrees: 90, speedToWindRatio: 0.84 },
    { trueWindAngleDegrees: 115, speedToWindRatio: 0.78 },
    { trueWindAngleDegrees: 145, speedToWindRatio: 0.66 },
    { trueWindAngleDegrees: 180, speedToWindRatio: 0.56 },
  ],
  collision: { halfLength: 3.47, halfBeam: 1.07 },
  camera: { distance: 16.4, height: 8.1, lookAhead: 6.4 },
  visual: { profile: "daysailer", rigForwardOffset: 0.16, playerHullColor: 0xe9e3d3, playerSailColor: 0xf4efe3, npcHullColor: 0x3f776d, npcSailColor: 0xeae3d4, npcTrimColor: 0xb67a45 },
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
  visual: { profile: "coastal", rigForwardOffset: 0, playerHullColor: 0xe8e4db, playerSailColor: 0xf2efe5, npcHullColor: 0x9a4d3f, npcSailColor: 0xe9e4d7, npcTrimColor: 0x294f5a },
};

export const SOUND_30: BoatDefinition = {
  id: "sound-30",
  name: "Sound 30",
  description: "Full-bodied working cutter with steady tracking and a deep cockpit.",
  hull: {
    length: 9.14,
    beam: 3.12,
    draft: 1.54,
    displacement: 4_180,
    yawInertia: 20_600,
    rightingArm: 1.02,
    longitudinalDragLinear: 172,
    longitudinalDragQuadratic: 70,
    lateralResistanceLinear: 1_840,
    lateralResistanceQuadratic: 890,
  },
  rudder: {
    maximumAngleDegrees: 33,
    responseRate: 5.2,
    forceFactor: 445,
    lever: 3.72,
  },
  sailPlan: [
    {
      id: "sound-main",
      kind: "mainsail",
      area: 27.5,
      designAngleDegrees: 14,
      forceCenterForward: -0.08,
      forceCenterHeight: 5.35,
    },
    {
      id: "sound-headsail",
      kind: "headsail",
      area: 18.4,
      designAngleDegrees: 12,
      forceCenterForward: 2.32,
      forceCenterHeight: 3.8,
    },
  ],
  polar: [
    { trueWindAngleDegrees: 41, speedToWindRatio: 0.45 },
    { trueWindAngleDegrees: 56, speedToWindRatio: 0.6 },
    { trueWindAngleDegrees: 76, speedToWindRatio: 0.74 },
    { trueWindAngleDegrees: 90, speedToWindRatio: 0.78 },
    { trueWindAngleDegrees: 116, speedToWindRatio: 0.73 },
    { trueWindAngleDegrees: 145, speedToWindRatio: 0.63 },
    { trueWindAngleDegrees: 180, speedToWindRatio: 0.54 },
  ],
  collision: { halfLength: 4.34, halfBeam: 1.43 },
  camera: { distance: 19.2, height: 9.8, lookAhead: 7.8 },
  visual: { profile: "workboat", rigForwardOffset: -0.14, playerHullColor: 0xd7ded8, playerSailColor: 0xeee7d8, npcHullColor: 0x6f342f, npcSailColor: 0xe7dece, npcTrimColor: 0xc49754 },
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
  visual: { profile: "cruiser", rigForwardOffset: -0.08, playerHullColor: 0xdfe5e3, playerSailColor: 0xeee9dc, npcHullColor: 0x334d68, npcSailColor: 0xe4dfd2, npcTrimColor: 0xc7b06c },
};

export const BOAT_DEFINITIONS: Readonly<Record<BoatId, BoatDefinition>> = {
  "harbor-20": HARBOR_20,
  "cove-24": COVE_24,
  "coastal-28": COASTAL_28,
  "sound-30": SOUND_30,
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
