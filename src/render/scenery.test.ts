import * as THREE from "three";
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

  it("samples the rendered triangles used to ground distant trees", () => {
    const geometry = createCoastalTerrainGeometry();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    const raycaster = new THREE.Raycaster();
    const samples = [
      { angle: 0.17, radius: 1_850 },
      { angle: 1.37, radius: 1_930 },
      { angle: 3.82, radius: 2_090 },
      { angle: 5.91, radius: 2_220 },
    ];

    for (const sample of samples) {
      const x = Math.sin(sample.angle) * sample.radius;
      const z = Math.cos(sample.angle) * sample.radius;
      raycaster.set(
        new THREE.Vector3(x, 200, z),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = raycaster.intersectObject(terrain, false)[0];
      expect(hit, `terrain hit at ${sample.angle}`).toBeDefined();
      expect(
        sampleCoastalTerrainHeight(sample.angle, sample.radius),
      ).toBeCloseTo(hit!.point.y, 4);
    }

    geometry.dispose();
    terrain.material.dispose();
  });

  it("keeps inland forest higher than the shoreline", () => {
    const angle = 1.37;
    const shorelineHeight = sampleCoastalTerrainHeight(angle, 1_800);
    const inlandHeight = sampleCoastalTerrainHeight(angle, 2_210);

    expect(shorelineHeight).toBeLessThan(10);
    expect(inlandHeight).toBeGreaterThan(shorelineHeight + 25);
  });
});
