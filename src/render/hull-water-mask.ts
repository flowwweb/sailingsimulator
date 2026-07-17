export const INTERIOR_FLOOR_BOW_Z = 3.02;

const HULL_CONTACT_STATIONS = [
  { z: 3.15, width: 0.035 },
  { z: 2.12, width: 0.76 },
  { z: 0.35, width: 1.08 },
  { z: -1.45, width: 1 },
  { z: -2.62, width: 0.67 },
] as const;

export const HULL_CONTACT_BOW_Z = HULL_CONTACT_STATIONS[0].z;
export const HULL_CONTACT_STERN_Z = HULL_CONTACT_STATIONS.at(-1)!.z;

/** Returns the outside hull width at a longitudinal boat-local position. */
export function hullContactWidthAt(z: number): number {
  const clampedZ = Math.max(HULL_CONTACT_STERN_Z, Math.min(HULL_CONTACT_BOW_Z, z));
  for (let index = 0; index < HULL_CONTACT_STATIONS.length - 1; index += 1) {
    const bow = HULL_CONTACT_STATIONS[index]!;
    const stern = HULL_CONTACT_STATIONS[index + 1]!;
    if (clampedZ <= bow.z && clampedZ >= stern.z) {
      const progress = (bow.z - clampedZ) / (bow.z - stern.z);
      return bow.width + (stern.width - bow.width) * progress;
    }
  }
  return HULL_CONTACT_STATIONS.at(-1)!.width;
}
