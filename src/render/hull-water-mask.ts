export const HULL_WATER_MASK_HALF_BEAM = 0.82;
export const HULL_WATER_MASK_HALF_LENGTH = 2.42;
export const INTERIOR_FLOOR_BOW_Z = 3.02;

export function isInsideHullWaterMask(x: number, z: number): boolean {
  return (
    (x / HULL_WATER_MASK_HALF_BEAM) ** 2 +
      (z / HULL_WATER_MASK_HALF_LENGTH) ** 2 <
    1
  );
}
