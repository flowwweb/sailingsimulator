import { describe, expect, it } from "vitest";
import { LAKE_SHOALS, lakeBoundaryDistance, sampleLakeDepth, shoalDistance } from "./bathymetry";

// Evaluate every shoal to check the conservative rejection against the original depth calculation.
function unculledDepth(x: number, z: number): number {
  const boundary = lakeBoundaryDistance(x, z);
  if (boundary >= 1) return 0;
  const smooth = (a: number, b: number, value: number): number => {
    const t = Math.min(Math.max((value - a) / (b - a), 0), 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const edge = 1 - boundary;
  const base = 36 * smooth(0, 0.66, edge);
  const variation = (2.4 * Math.sin((x + 140) / 430) * Math.cos((z - 80) / 520) + 1.1 * Math.sin((x - z) / 310)) * smooth(0.08, 0.55, edge);
  let depth = Math.min(38, Math.max(0, base + variation));
  for (const shoal of LAKE_SHOALS) {
    const distance = shoalDistance(shoal, x, z);
    if (distance < shoal.shelfRadius) depth = Math.min(depth, 12 * smooth(shoal.islandRadius, shoal.shelfRadius, distance));
  }
  return Math.max(0, depth);
}

describe("lake depth shoal rejection", () => {
  it("preserves exact depth across the lake and around each shoal", () => {
    for (let x = -1800; x <= 1800; x += 75) for (let z = -1650; z <= 1650; z += 75) {
      expect(sampleLakeDepth(x, z)).toBe(unculledDepth(x, z));
    }
    for (const shoal of LAKE_SHOALS) for (let i = 0; i < 72; i++) for (const scale of [0.99, 1, 1.01, 1.2]) {
      const angle = i * Math.PI / 36;
      const distance = shoal.shelfRadius * scale;
      const x = shoal.x + Math.cos(angle) * distance;
      const z = shoal.z + Math.sin(angle) * distance;
      expect(sampleLakeDepth(x, z)).toBe(unculledDepth(x, z));
    }
  });
});
