import { describe, expect, it } from "vitest";
import { createCoastalTerrainGeometry, sampleCoastalTerrainHeight } from "./scenery";

describe("coastal terrain geometry", () => {
  it("builds one varied shoreline rising from a submerged shelf", () => {
    const geometry = createCoastalTerrainGeometry(64);
    const positions = geometry.getAttribute("position");
    const shorelineRadii: number[] = [];
    const heights: number[] = [];

    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex);
      const z = positions.getZ(vertex);
      heights.push(positions.getY(vertex));
      if (vertex % 5 === 0) shorelineRadii.push(Math.hypot(x, z));
    }

    expect(Math.max(...shorelineRadii) - Math.min(...shorelineRadii)).toBeGreaterThan(70);
    expect(Math.min(...heights)).toBeLessThan(0);
    expect(Math.max(...heights)).toBeGreaterThan(50);
    expect(geometry.index?.count).toBe(64 * 4 * 6);
  });

  it("samples the same terrain surface used to ground distant trees", () => {
    const angle = 1.37;
    const shorelineHeight = sampleCoastalTerrainHeight(angle, 1_800);
    const inlandHeight = sampleCoastalTerrainHeight(angle, 2_210);

    expect(shorelineHeight).toBeLessThan(10);
    expect(inlandHeight).toBeGreaterThan(shorelineHeight + 25);
  });
});
