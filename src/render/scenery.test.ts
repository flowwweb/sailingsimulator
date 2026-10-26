import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  COASTAL_TERRAIN_BAND_COUNT,
  createCoastalTerrainGeometry,
  setMediterraneanGroundColor,
  sampleCoastalTerrainHeight,
  LakeScenery,
} from "./scenery";

describe("coastal terrain geometry", () => {
  it("embeds every transformed rock footprint into the rendered terrain", () => {
    const scenery = new LakeScenery();
    const rocks = scenery.root.children.filter(object => object instanceof THREE.InstancedMesh
      && object.geometry instanceof THREE.DodecahedronGeometry) as THREE.InstancedMesh<THREE.DodecahedronGeometry>[];
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const probe = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    probe.matrixAutoUpdate = false;
    const ray = new THREE.Raycaster();
    const unsupported: { radius: number; instance: number; gap: number; x: number; z: number }[] = [];
    for (const mesh of rocks) {
      const vertices = mesh.geometry.getAttribute("position");
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        let closest = Infinity;
        for (let v = 0; v < vertices.count; v++) {
          point.fromBufferAttribute(vertices, v).applyMatrix4(matrix);
          closest = Math.min(closest, point.y - sampleCoastalTerrainHeight(Math.atan2(point.x, point.z), Math.hypot(point.x, point.z)));
        }
        probe.geometry = mesh.geometry;
        probe.matrix.copy(matrix);
        probe.updateMatrixWorld(true);
        const x = matrix.elements[12]!;
        const z = matrix.elements[14]!;
        const ground = sampleCoastalTerrainHeight(Math.atan2(x, z), Math.hypot(x, z));
        ray.set(new THREE.Vector3(x, ground - 100, z), new THREE.Vector3(0, 1, 0));
        const bottom = ray.intersectObject(probe, false)[0];
        const centerGap = bottom ? bottom.point.y - ground : Infinity;
        if (closest > 0.02 || centerGap > 0.02) unsupported.push({ radius: mesh.geometry.parameters.radius, instance: i, gap: Math.max(closest, centerGap), x, z });
      }
    }
    expect(unsupported, JSON.stringify(unsupported)).toEqual([]);
  });
  it("uses three continuous blue mountain ridges with finite geometry", () => {
    const scenery = new LakeScenery();
    const ridges = scenery.root.children.filter(object => object.name.startsWith("Distant Mediterranean ridge")) as THREE.Mesh[];
    expect(ridges).toHaveLength(3);
    const middleRidgeRadii: number[] = [];
    const harborHeights: number[] = [];
    const ridgeColors: THREE.Color[] = [];
    for (const ridge of ridges) {
      const positions = ridge.geometry.getAttribute("position");
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      ridge.geometry.computeBoundingBox();
      expect(ridge.geometry.boundingBox!.max.y).toBeGreaterThan(200);
      expect(ridge.geometry.boundingBox!.min.y).toBeLessThan(0);
      expect(ridge.geometry.index!.count).toBe(1024 * 2 * 6);
      const profile = Array.from({ length: 1025 }, (_, segment) => positions.getY(1025 + segment));
      expect(Math.max(...profile) - Math.min(...profile)).toBeGreaterThan(70);
      const harbor = profile.slice(Math.ceil(1.95 / (Math.PI * 2) * 1024), Math.floor(2.95 / (Math.PI * 2) * 1024));
      const peaks = harbor.filter((height, i) => i > 0 && i < harbor.length - 1 && height > harbor[i - 1]! && height > harbor[i + 1]!);
      expect(peaks.length).toBeGreaterThanOrEqual(4);
      const largestHarborStep = Math.max(...harbor.slice(1).map((height, i) => Math.abs(height - harbor[i]!)));
      expect(largestHarborStep).toBeLessThan(20);
      harborHeights.push(harbor.reduce((sum, height) => sum + height, 0) / harbor.length);
      ridgeColors.push((ridge.material as THREE.MeshStandardMaterial).color);
      middleRidgeRadii.push(Array.from({ length: 1025 }, (_, segment) => {
        const vertex = 1025 + segment;
        return Math.hypot(positions.getX(vertex), positions.getZ(vertex));
      }).reduce((sum, radius) => sum + radius, 0) / 1025);
      const normals = ridge.geometry.getAttribute("normal");
      for (let ring = 0; ring < 3; ring++) {
        const first = ring * 1025;
        const last = first + 1024;
        expect(new THREE.Vector3().fromBufferAttribute(normals, first)
          .distanceTo(new THREE.Vector3().fromBufferAttribute(normals, last))).toBeLessThan(1e-5);
      }
    }
    expect(middleRidgeRadii[0]! - middleRidgeRadii[1]!).toBeGreaterThan(200);
    expect(middleRidgeRadii[1]! - middleRidgeRadii[2]!).toBeGreaterThan(200);
    expect(harborHeights[0]! - harborHeights[1]!).toBeGreaterThan(50);
    expect(harborHeights[1]! - harborHeights[2]!).toBeGreaterThan(50);
    expect(ridgeColors.every(color => color.b > color.r)).toBe(true);
    expect(Math.hypot(ridgeColors[0]!.r - ridgeColors[1]!.r, ridgeColors[0]!.g - ridgeColors[1]!.g, ridgeColors[0]!.b - ridgeColors[1]!.b)).toBeGreaterThan(0.04);
    expect(Math.hypot(ridgeColors[1]!.r - ridgeColors[2]!.r, ridgeColors[1]!.g - ridgeColors[2]!.g, ridgeColors[1]!.b - ridgeColors[2]!.b)).toBeGreaterThan(0.04);
  });
  it("retains a substantial saddle and secondary shoulder in the Return massif", () => {
    const scenery = new LakeScenery();
    for (let layer = 0; layer < 3; layer++) {
      const ridge = scenery.root.getObjectByName(`Distant Mediterranean ridge ${layer + 1}`) as THREE.Mesh;
      const positions = ridge.geometry.getAttribute("position");
      const height = (angle: number) => positions.getY(1025 + Math.round((angle + layer * 0.055) / (Math.PI * 2) * 1024));
      expect(height(2.614) - height(2.635)).toBeGreaterThan(6);
      expect(height(2.684) - height(2.635)).toBeGreaterThan(6);
    }
  });
  it("roots forest trunks into the rendered terrain after translation, rotation, and scale", () => {
    const scenery = new LakeScenery();
    scenery.root.position.set(170, -4, -230);
    scenery.root.rotation.y = 0.31;
    scenery.root.scale.set(1.18, 1.3, 0.84);
    scenery.root.updateMatrixWorld(true);
    const terrain = scenery.root.getObjectByName("Irregular coastal terrain") as THREE.Mesh;
    const trunks = scenery.root.getObjectByName("Mediterranean tree trunks") as THREE.InstancedMesh;
    trunks.geometry.computeBoundingBox();
    const bounds = trunks.geometry.boundingBox!;
    const instance = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    let maxSlope = 0;
    for (let index = 0; index < trunks.count; index++) {
      trunks.getMatrixAt(index, instance);
      instance.premultiply(trunks.matrixWorld);
      instance.decompose(position, rotation, scale);
      const rootY = position.y + bounds.min.y * scale.y;
      ray.set(new THREE.Vector3(position.x, 500, position.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(terrain, false)[0];
      expect(hit, `tree ${index} has terrain support`).toBeDefined();
      expect(rootY - hit!.point.y, `tree ${index} root burial`).toBeCloseTo(-0.3 * scenery.root.scale.y, 1);
      const normal = hit!.face!.normal.clone()
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(terrain.matrixWorld))
        .normalize();
      maxSlope = Math.max(maxSlope, Math.hypot(normal.x, normal.z) / Math.max(0.001, Math.abs(normal.y)));
    }
    expect(maxSlope).toBeLessThan(1.3);
  });
  it("groups forest trunks into planted groves rather than evenly spaced rows", () => {
    const scenery = new LakeScenery();
    const trunks = scenery.root.getObjectByName("Mediterranean tree trunks") as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const positions: THREE.Vector3[] = [];
    for (let index = 0; index < trunks.count; index++) {
      trunks.getMatrixAt(index, matrix);
      positions.push(new THREE.Vector3().setFromMatrixPosition(matrix));
    }
    const densestGrove = Math.max(...positions.map(center => positions.filter(position =>
      Math.hypot(position.x - center.x, position.z - center.z) < 100,
    ).length));
    expect(densestGrove).toBeGreaterThan(20);
  });
  it("grounds shoreline rocks in the actual terrain instead of suspending them above it", () => {
    const scenery = new LakeScenery();
    const rocks = scenery.root.getObjectByName("Grounded shoreline rocks") as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < rocks.count; index++) {
      rocks.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      const ground = sampleCoastalTerrainHeight(Math.atan2(position.x, position.z), Math.hypot(position.x, position.z));
      expect(position.y - 5.5 * scale.y).toBeLessThan(ground);
      expect(position.y + 5.5 * scale.y).toBeGreaterThan(ground);
    }
  });
  it("builds one varied shoreline rising from a submerged shelf", () => {
    const geometry = createCoastalTerrainGeometry(64);
    const positions = geometry.getAttribute("position");
    const shorelineRadii: number[] = [];
    const heights: number[] = [];

    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex);
      const z = positions.getZ(vertex);
      heights.push(positions.getY(vertex));
      if (vertex % COASTAL_TERRAIN_BAND_COUNT === 0) {
        shorelineRadii.push(Math.hypot(x, z));
      }
    }

    expect(Math.max(...shorelineRadii) - Math.min(...shorelineRadii)).toBeGreaterThan(140);
    expect(Math.min(...heights)).toBeLessThan(0);
    expect(Math.max(...heights)).toBeGreaterThan(90);
    expect(geometry.index?.count).toBe(
      64 * (COASTAL_TERRAIN_BAND_COUNT - 1) * 6,
    );
    for (const name of ["color", "uv"]) {
      const attribute = geometry.getAttribute(name);
      expect(attribute.count).toBe(positions.count);
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    expect(new Set(Array.from(geometry.getAttribute("color").array)).size).toBeGreaterThan(40);
  });

  it("separates grass, olive soil, and exposed limestone with the ground masks", () => {
    const shore = new THREE.Color();
    const grass = new THREE.Color();
    const cliff = new THREE.Color();
    setMediterraneanGroundColor(shore, 820, -415, 0, 0.03);
    setMediterraneanGroundColor(grass, 820, -415, 26, 0.03);
    setMediterraneanGroundColor(cliff, 820, -415, 26, 0.52);
    expect(Math.hypot(shore.r - grass.r, shore.g - grass.g, shore.b - grass.b)).toBeGreaterThan(0.1);
    expect(Math.hypot(grass.r - cliff.r, grass.g - cliff.g, grass.b - cliff.b)).toBeGreaterThan(0.1);
    const patches = Array.from({ length: 16 }, (_, index) => {
      const color = new THREE.Color();
      setMediterraneanGroundColor(color, 820 + index % 4 * 50, -415 + Math.floor(index / 4) * 50, 26, 0.25);
      return color;
    });
    const variation = Math.max(...patches.flatMap(a => patches.map(b =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b),
    )));
    expect(variation).toBeGreaterThan(0.06);
  });

  it("samples the rendered triangles used to ground distant trees", () => {
    const geometry = createCoastalTerrainGeometry();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial(),
    );
    const raycaster = new THREE.Raycaster();
    const samples = [
      { angle: 0.17, radius: 1_850 },
      { angle: 1.37, radius: 2_020 },
      { angle: 3.82, radius: 2_060 },
      { angle: 5.91, radius: 2_240 },
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

  it("authors coves, headlands, and a river-cut valley instead of a radial ring", () => {
    const cove = sampleCoastalTerrainHeight(0.52, 1_900);
    const headland = sampleCoastalTerrainHeight(1.55, 2_150);
    const valley = sampleCoastalTerrainHeight(3.92, 2_260);
    const neighboringSlope = sampleCoastalTerrainHeight(4.22, 2_260);

    expect(headland).toBeGreaterThan(cove + 20);
    expect(neighboringSlope).toBeGreaterThan(valley + 15);
  });
});
