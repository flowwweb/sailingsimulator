import type {
  SoundscapeKind,
  WorldDefinition,
} from "../game/world-definition";

export interface SoundscapeSnapshot {
  openWater: number;
  shore: number;
  songbirds: number;
  waterbirds: number;
  shelter: number;
  dock: number;
}

interface WorldPosition {
  x: number;
  y: number;
}

const OPEN_LAKE: SoundscapeSnapshot = {
  openWater: 1,
  shore: 0.04,
  songbirds: 0.03,
  waterbirds: 0.16,
  shelter: 0,
  dock: 0,
};

const SOUNDSCAPES: Readonly<Record<SoundscapeKind, SoundscapeSnapshot>> = {
  "open-water": {
    openWater: 1,
    shore: 0.08,
    songbirds: 0.05,
    waterbirds: 0.18,
    shelter: 0.05,
    dock: 0,
  },
  "pine-shore": {
    openWater: 0.34,
    shore: 0.92,
    songbirds: 0.9,
    waterbirds: 0.22,
    shelter: 0.56,
    dock: 0,
  },
  "exposed-reach": {
    openWater: 1,
    shore: 0.22,
    songbirds: 0.08,
    waterbirds: 0.82,
    shelter: 0,
    dock: 0,
  },
  "sheltered-cove": {
    openWater: 0.24,
    shore: 1,
    songbirds: 0.82,
    waterbirds: 0.28,
    shelter: 0.9,
    dock: 0.74,
  },
};

export function sampleSoundscape(
  world: WorldDefinition,
  position: WorldPosition,
): SoundscapeSnapshot {
  const influences = world.regions
    .map((region) => {
      const distance = Math.hypot(
        position.x - region.centerX,
        position.y - region.centerZ,
      );
      return {
        profile: SOUNDSCAPES[region.soundscape],
        weight:
          1 -
          smoothstep(
            region.radius * 0.68,
            region.radius * 1.22,
            distance,
          ),
      };
    })
    .filter(({ weight }) => weight > 0);

  const strongestInfluence = influences.reduce(
    (maximum, { weight }) => Math.max(maximum, weight),
    0,
  );
  const openLakeWeight = 1 - strongestInfluence;
  const totalWeight =
    openLakeWeight +
    influences.reduce((total, { weight }) => total + weight, 0);

  return mixSnapshots([
    { profile: OPEN_LAKE, weight: openLakeWeight / totalWeight },
    ...influences.map(({ profile, weight }) => ({
      profile,
      weight: weight / totalWeight,
    })),
  ]);
}

function mixSnapshots(
  inputs: ReadonlyArray<{
    profile: SoundscapeSnapshot;
    weight: number;
  }>,
): SoundscapeSnapshot {
  const result: SoundscapeSnapshot = {
    openWater: 0,
    shore: 0,
    songbirds: 0,
    waterbirds: 0,
    shelter: 0,
    dock: 0,
  };
  for (const { profile, weight } of inputs) {
    result.openWater += profile.openWater * weight;
    result.shore += profile.shore * weight;
    result.songbirds += profile.songbirds * weight;
    result.waterbirds += profile.waterbirds * weight;
    result.shelter += profile.shelter * weight;
    result.dock += profile.dock * weight;
  }
  return result;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
