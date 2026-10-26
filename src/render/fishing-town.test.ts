import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { lakeShoalFor, sampleLakeDepth } from "../game/bathymetry";
import { FAIR_WINDS_OBJECTS } from "../game/world-definition";
import { createTownGroundSampler, populateFishingTown } from "./fishing-town";

const townObject = FAIR_WINDS_OBJECTS.find(object => object.kind === "town")!;
const shoal = lakeShoalFor(townObject.landformId!)!;

function makeTown(): THREE.Group {
  const group = new THREE.Group();
  populateFishingTown(group, townObject, shoal, new THREE.MeshStandardMaterial());
  group.updateMatrixWorld(true);
  return group;
}

function meshes(group: THREE.Group, name?: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  group.traverse(object => {
    if (object instanceof THREE.Mesh && (!name || object.name === name)) found.push(object);
  });
  return found;
}

describe("Mediterranean harbor component", () => {
  it.each([
    ["authored shoal", shoal],
    ["rotated and stretched shoal", { ...shoal, rotation: 0.63, scaleX: 1.3, scaleZ: 0.67 }],
    ["optional shoal", undefined],
  ] as const)("matches the exhaustive land raycaster at interiors, vertices and edges: %s", (_label, landform) => {
    const group = new THREE.Group();
    populateFishingTown(group, townObject, landform, new THREE.MeshStandardMaterial());
    group.updateMatrixWorld(true);
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    const sample = createTownGroundSampler(land.geometry);
    const vertices = land.geometry.getAttribute("position");
    const indices = land.geometry.getIndex()!;
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const reference = new Map<string, number | undefined>();
    let hits = 0, misses = 0;
    const compare = (x: number, z: number) => {
      ray.ray.origin.set(x, 200, z);
      // Shared triangle edges repeat exact points; cache only the immutable reference ray.
      const key = `${x},${z}`;
      if (!reference.has(key)) reference.set(key, ray.intersectObject(land, false)[0]?.point.y);
      const oldHeight = reference.get(key);
      const height = sample(x, z);
      if (oldHeight === undefined) {
        expect(height, `no land at ${x},${z}`).toBeUndefined();
        misses++;
      } else {
        expect(height, `land at ${x},${z}`).toBeDefined();
        expect(Math.abs(height! - oldHeight), `exact contact at ${x},${z}`).toBeLessThan(1e-9);
        hits++;
      }
    };
    for (let i = 0; i < vertices.count; i++) compare(vertices.getX(i), vertices.getZ(i));
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      compare((vertices.getX(a) + vertices.getX(b) + vertices.getX(c)) / 3,
        (vertices.getZ(a) + vertices.getZ(b) + vertices.getZ(c)) / 3);
      // Every triangle edge, including radial seams, ring chords and cell diagonals.
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        compare((vertices.getX(u!) + vertices.getX(v!)) / 2, (vertices.getZ(u!) + vertices.getZ(v!)) / 2);
      }
    }
    const bounds = new THREE.Box3().setFromObject(land);
    for (let i = vertices.count - 121; i < vertices.count - 1; i++) {
      const x = (vertices.getX(i) + vertices.getX(i + 1)) / 2;
      const z = (vertices.getZ(i) + vertices.getZ(i + 1)) / 2;
      const dx = x - bounds.getCenter(new THREE.Vector3()).x;
      const dz = z - bounds.getCenter(new THREE.Vector3()).z;
      for (const delta of [-1e-8, 1e-8, -0.02, 0.02]) compare(x + dx * delta, z + dz * delta);
    }
    compare(bounds.max.x + 1, bounds.max.z + 1);
    expect(hits).toBeGreaterThan(30_000);
    expect(misses).toBeGreaterThan(100);
  }, 60_000);

  it("preserves exact land contact after caller translation, yaw and nonuniform scale", () => {
    const group = makeTown();
    group.position.set(townObject.x, 5, townObject.z);
    group.rotation.y = 0.17;
    group.scale.set(1.08, 1.25, 0.87);
    group.updateMatrixWorld(true);
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    const sample = createTownGroundSampler(land.geometry);
    const vertices = land.geometry.getAttribute("position");
    const indices = land.geometry.getIndex()!;
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    for (let i = 3; i < indices.count; i += 93) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      const x = (vertices.getX(a) + vertices.getX(b) + vertices.getX(c)) / 3;
      const z = (vertices.getZ(a) + vertices.getZ(b) + vertices.getZ(c)) / 3;
      const point = new THREE.Vector3(x, sample(x, z)!, z).applyMatrix4(land.matrixWorld);
      ray.ray.origin.set(point.x, 300, point.z);
      const hit = ray.intersectObject(land, false)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(point.y - hit!.point.y)).toBeLessThan(1e-9);
    }
  });

  it("preserves caller transform, world objects, shoal and docking contract", () => {
    const before = JSON.stringify({ objects: FAIR_WINDS_OBJECTS, shoal });
    const group = new THREE.Group();
    group.position.set(townObject.x, 0, townObject.z);
    group.rotation.y = 0.17;
    const existing = new THREE.Group();
    group.add(existing);
    populateFishingTown(group, townObject, shoal, new THREE.MeshStandardMaterial());
    expect(group.position.toArray()).toEqual([1100, 0, -500]);
    expect(group.rotation.y).toBe(0.17);
    expect(group.children).toContain(existing);
    expect(JSON.stringify({ objects: FAIR_WINDS_OBJECTS, shoal })).toBe(before);
  });

  it("keeps the visitor berth and its approach free of new scenery", () => {
    const group = makeTown();
    const dock = FAIR_WINDS_OBJECTS.find(object => object.id === "juniper-cove-dock")!;
    const centerX = dock.x - townObject.x;
    const centerZ = dock.z - townObject.z;
    const ray = new THREE.Raycaster();
    for (let x = centerX - 24; x <= centerX + 20; x += 4) {
      for (let z = centerZ - 30; z <= centerZ + 30; z += 5) {
        ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        for (const hit of ray.intersectObject(group, true)) {
          expect(hit.object.name, `no structure in approach at ${x},${z}`).toBe("Continuous harbor hillside");
          // The new shelf may enter the footprint, but cannot add an uncharted obstruction.
          expect(hit.point.y).toBeLessThan(0);
          expect(hit.point.y).toBeLessThanOrEqual(-sampleLakeDepth(x + townObject.x, z + townObject.z) + 0.15);
        }
      }
    }
    const bounds = new THREE.Box3();
    for (const mesh of meshes(group)) if (mesh.name !== "Continuous harbor hillside") bounds.union(new THREE.Box3().setFromObject(mesh));
    expect(bounds.min.x).toBeGreaterThanOrEqual(-34.01);
    const piers = new THREE.Box3().setFromObject(meshes(group, "Timber pier decks")[0]!);
    expect(piers.min.x).toBeCloseTo(-34);
    expect(piers.max.x).toBeCloseTo(-6);
    expect(piers.min.z).toBeCloseTo(-35.4, 4);
    expect(piers.max.z).toBeCloseTo(31.4, 4);
  });

  it("retains rising harbor terraces behind the fixed quay", () => {
    const group = makeTown();
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    const ray = new THREE.Raycaster();
    const heightAt = (x: number, z: number): number => {
      ray.set(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
      return ray.intersectObject(land, false)[0]!.point.y;
    };
    expect(heightAt(40, -35)).toBeGreaterThan(heightAt(0, -2) + 2);
    expect(heightAt(80, 35)).toBeGreaterThan(heightAt(0, -2) + 2);
  });

  it("grounds every house on a continuous foundation", () => {
    const group = makeTown();
    const supports = [...meshes(group, "Terrace foundations"), ...meshes(group, "Limestone promenade")];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const ray = new THREE.Raycaster();
    let count = 0;
    for (const mesh of meshes(group, "Stucco houses") as THREE.InstancedMesh[]) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        const base = position.y - scale.y / 2;
        ray.set(new THREE.Vector3(position.x, base + 0.1, position.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(supports)[0];
        expect(hit).toBeDefined();
        expect(Math.abs(hit!.point.y - base)).toBeLessThan(0.05);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(30);
  });

  it("breaks the repeated roofline with varied house widths and heights", () => {
    const group = makeTown();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const heights: number[] = [];
    const widths: number[] = [];
    const setbacks: number[] = [];
    const footprints: THREE.Box3[] = [];
    const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
    for (const mesh of meshes(group, "Stucco houses") as THREE.InstancedMesh[]) {
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        matrix.decompose(position, rotation, scale);
        heights.push(scale.y);
        widths.push(scale.x);
        setbacks.push(position.x);
        footprints.push(new THREE.Box3().setFromPoints(corners.map(([x, z]) =>
          new THREE.Vector3(x * scale.x / 2, 0, z * scale.z / 2).applyMatrix4(matrix),
        )));
      }
    }
    expect(heights).toHaveLength(30);
    expect(new Set(heights.map(height => height.toFixed(1))).size).toBeGreaterThan(6);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(8);
    expect(new Set(widths.map(width => width.toFixed(1))).size).toBeGreaterThan(4);
    expect(new Set(setbacks.map(x => Math.round(x))).size).toBeGreaterThan(20);
    expect(heights.filter(height => height <= 14).length).toBeGreaterThanOrEqual(24);
    let touchingPairs = 0;
    let detachedPairs = 0;
    for (let i = 0; i < footprints.length; i++) for (let j = i + 1; j < footprints.length; j++) {
      const a = footprints[i]!;
      const b = footprints[j]!;
      const xGap = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
      const zGap = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
      if (xGap < 1 && zGap < 1.25) touchingPairs++;
      if (xGap < 1 && zGap > 6) detachedPairs++;
    }
    expect(touchingPairs).toBeGreaterThan(0);
    expect(detachedPairs).toBeGreaterThan(2);
    const roofs = meshes(group, "Terracotta hip roofs").reduce((bounds, roof) => bounds.union(new THREE.Box3().setFromObject(roof)), new THREE.Box3());
    const finial = new THREE.Box3().setFromObject(meshes(group, "Campanile finial")[0]!);
    expect(finial.max.y).toBeGreaterThan(roofs.max.y + 3);
  });

  it("keeps varied waterfront openings and canopies within their authored facades", () => {
    const group = makeTown();
    const matrix = new THREE.Matrix4(), local = new THREE.Matrix4();
    const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    const houses = meshes(group, "Stucco houses") as THREE.InstancedMesh[];
    const windowCounts: number[] = [], canopyRatios: number[] = [], roofRises: number[] = [];
    for (const [x, z] of [[14, -37], [19, -24], [15, -9], [27, 4], [20, 20], [30, 36], [18, 48]]) {
      let inverse: THREE.Matrix4 | undefined;
      let width = 0, height = 0, depth = 0;
      for (const mesh of houses) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        if (Math.abs(position.x - x!) > 0.001 || Math.abs(position.z - z!) > 0.001) continue;
        [width, height, depth] = scale.toArray();
        position.y -= height / 2;
        inverse = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1)).invert();
      }
      expect(inverse, `waterfront house at ${x},${z}`).toBeDefined();
      let windows = 0;
      const canopy = new THREE.Box3();
      for (const name of ["Window stone surrounds", "Arched door recesses", "Balcony slabs", "Striped canvas awnings", "Terracotta hip roofs"]) {
        for (const mesh of meshes(group, name) as THREE.InstancedMesh[]) {
          mesh.geometry.computeBoundingBox();
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix);
            local.multiplyMatrices(inverse!, matrix);
            position.setFromMatrixPosition(local);
            if (name === "Terracotta hip roofs") {
              if (Math.abs(position.x) < 0.001 && Math.abs(position.z) < 0.001) {
                local.decompose(position, rotation, scale);
                roofRises.push(scale.y);
              }
              continue;
            }
            const projection = name === "Striped canvas awnings" ? 2.2 : name === "Balcony slabs" ? 0.71 : name === "Arched door recesses" ? 0.02 : 0.06;
            if (Math.abs(position.z + depth / 2 + projection) > 0.001 || Math.abs(position.x) > width / 2) continue;
            const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(local);
            expect(bounds.min.x, `${name} left edge`).toBeGreaterThanOrEqual(-width / 2 - 0.001);
            expect(bounds.max.x, `${name} right edge`).toBeLessThanOrEqual(width / 2 + 0.001);
            expect(bounds.min.y, `${name} above foundation`).toBeGreaterThan(0);
            expect(bounds.max.y, `${name} below cornice`).toBeLessThan(height - 0.35);
            if (name === "Window stone surrounds") windows++;
            if (name === "Striped canvas awnings") canopy.union(bounds);
          }
        }
      }
      expect(windows).toBeGreaterThan(0);
      windowCounts.push(windows);
      canopyRatios.push(canopy.isEmpty() ? 0 : (canopy.max.x - canopy.min.x) / width);
    }
    expect(new Set(windowCounts).size).toBeGreaterThanOrEqual(4);
    expect(canopyRatios.filter(ratio => ratio === 0)).toHaveLength(3);
    expect(canopyRatios.some(ratio => ratio > 0.35 && ratio < 0.55)).toBe(true);
    expect(canopyRatios.some(ratio => ratio > 0.75)).toBe(true);
    expect(roofRises).toHaveLength(7);
    expect(Math.max(...roofRises) - Math.min(...roofRises)).toBeGreaterThan(1.5);
  });

  it("embeds local foundations in the triangulated terraces and preserves the vertex palette", () => {
    const group = makeTown();
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    expect((land.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
    const ray = new THREE.Raycaster();
    const matrix = new THREE.Matrix4();
    for (const mesh of meshes(group, "Terrace foundations") as THREE.InstancedMesh[]) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        let supported = false;
        for (const x of [-0.5, 0, 0.5]) for (const z of [-0.5, 0, 0.5]) {
          const bottom = new THREE.Vector3(x, -0.5, z).applyMatrix4(matrix);
          const top = new THREE.Vector3(x, 0.5, z).applyMatrix4(matrix);
          ray.set(new THREE.Vector3(top.x, 200, top.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(land, false)[0];
          if (!hit) continue;
          expect(bottom.y, `foundation ${i} buried at ${x},${z}`).toBeLessThanOrEqual(hit.point.y + 0.02);
          expect(top.y, `foundation ${i} clears terrain at ${x},${z}`).toBeGreaterThanOrEqual(hit.point.y - 0.02);
          supported = true;
        }
        expect(supported, `foundation ${i} contacts rendered land`).toBe(true);
      }
    }
  });

  it("builds linked garden walls and beds against the rendered terrace surface", () => {
    const group = makeTown();
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    const walls = meshes(group, "Garden retaining walls")[0] as THREE.InstancedMesh;
    const caps = meshes(group, "Garden wall coping")[0] as THREE.InstancedMesh;
    const beds = meshes(group, "Terraced herb beds")[0] as THREE.InstancedMesh;
    expect(walls).toBeInstanceOf(THREE.InstancedMesh);
    expect(caps.count).toBe(walls.count);
    expect(walls.count).toBeGreaterThan(10);
    expect((walls.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xd6cbb0);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    for (let index = 0; index < walls.count; index++) {
      walls.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      ray.set(new THREE.Vector3(position.x, 200, position.z), new THREE.Vector3(0, -1, 0));
      const ground = ray.intersectObject(land, false)[0]!.point.y;
      expect(position.y - scale.y / 2).toBeLessThanOrEqual(ground + 0.1);
      expect(position.y + scale.y / 2).toBeGreaterThan(ground + 0.25);
    }
    beds.geometry.computeBoundingBox();
    for (let index = 0; index < beds.count; index++) {
      beds.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      const rootY = position.y + beds.geometry.boundingBox!.min.y * scale.y;
      ray.set(new THREE.Vector3(position.x, 200, position.z), new THREE.Vector3(0, -1, 0));
      const ground = ray.intersectObject(land, false)[0]!.point.y;
      expect(rootY - ground).toBeCloseTo(0, 1);
    }
  });

  it("models open belfry arches instead of painting windows onto a solid tower", () => {
    const group = makeTown();
    const structure = ["Open belfry arches", "Belfry corner piers", "Campanile cornices", "Belfry lintels", "Campanile shaft"]
      .flatMap(name => meshes(group, name));
    const shaft = meshes(group, "Campanile shaft")[0] as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    shaft.getMatrixAt(0, matrix);
    const center = new THREE.Vector3().setFromMatrixPosition(matrix);
    const base = center.y - 12.6;
    const ray = new THREE.Raycaster(new THREE.Vector3(center.x - 13, base + 28, center.z), new THREE.Vector3(1, 0, 0), 0, 25);
    expect(ray.intersectObjects(structure)).toHaveLength(0);
    ray.set(new THREE.Vector3(center.x - 13, base + 31.2, center.z), new THREE.Vector3(1, 0, 0));
    expect(ray.intersectObjects(structure).length).toBeGreaterThan(0);
    expect(meshes(group, "Bronze harbor bell")).toHaveLength(1);
  });

  it("plants harbor and hillside roots in rendered land under transforms", () => {
    const group = makeTown();
    group.position.set(townObject.x, 5, townObject.z);
    group.rotation.y = 0.17;
    group.scale.set(1.08, 1.25, 0.87);
    group.updateMatrixWorld(true);
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    expect(new Set(Array.from(land.geometry.getAttribute("color").array)).size).toBeGreaterThan(40);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const ray = new THREE.Raycaster();
    for (const name of ["Harbor cypresses", "Hillside cypresses", "Olive trunks"]) {
      for (const mesh of meshes(group, name) as THREE.InstancedMesh[]) {
        mesh.geometry.computeBoundingBox();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          matrix.premultiply(mesh.matrixWorld);
          matrix.decompose(position, rotation, scale);
          const rootY = position.y + mesh.geometry.boundingBox!.min.y * scale.y;
          ray.set(new THREE.Vector3(position.x, 300, position.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(land, false)[0];
          expect(hit, `${name} ${i} has land support`).toBeDefined();
          expect(hit!.point.y, `${name} ${i} remains above water`).toBeGreaterThan(0);
          expect(rootY - hit!.point.y, `${name} ${i} root burial`).toBeCloseTo(-0.3 * group.scale.y, 1);
        }
      }
    }
  });

  it("clusters hillside trees and olives into grounded groves", () => {
    const group = makeTown();
    const trees = [...meshes(group, "Hillside cypresses"), ...meshes(group, "Olive trunks")] as THREE.InstancedMesh[];
    expect(meshes(group, "Hillside scrub").reduce(
      (count, mesh) => count + (mesh as THREE.InstancedMesh).count,
      0,
    )).toBeGreaterThan(50);
    const matrix = new THREE.Matrix4();
    const positions: THREE.Vector3[] = [];
    for (const mesh of trees) {
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        positions.push(new THREE.Vector3().setFromMatrixPosition(matrix));
      }
    }
    const densestGrove = Math.max(...positions.map(center => positions.filter(position =>
      Math.hypot(position.x - center.x, position.z - center.z) < 60,
    ).length));
    expect(positions.length).toBeGreaterThan(100);
    expect(densestGrove).toBeGreaterThan(10);
  });

  it("roots the planted bank above water and keeps planting clear of house walls", () => {
    const group = makeTown();
    const land = meshes(group, "Continuous harbor hillside")[0]!;
    const planting = meshes(group, "Bank maquis")[0] as THREE.InstancedMesh;
    const houses = meshes(group, "Stucco houses");
    expect(planting.count).toBeGreaterThan(50);
    const ray = new THREE.Raycaster();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const point = new THREE.Vector3();
    const vertices = planting.geometry.getAttribute("position");
    const roots = Array.from({ length: vertices.count }, (_, i) => i)
      .filter(i => vertices.getY(i) === -1);
    expect(roots.length).toBeGreaterThan(0);
    const heights: number[] = [];
    let nearWaterfront = 0;
    for (let i = 0; i < planting.count; i++) {
      planting.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      ray.set(new THREE.Vector3(position.x, 200, position.z), new THREE.Vector3(0, -1, 0));
      const ground = ray.intersectObject(land, false)[0]!.point.y;
      expect(ground).toBeGreaterThan(2.4);
      for (const root of roots) {
        point.fromBufferAttribute(vertices, root).applyMatrix4(matrix);
        expect(point.y - ground, `bank plant ${i} root burial`).toBeCloseTo(-0.35, 3);
      }
      expect(ray.intersectObjects(houses), `bank plant ${i} outside houses`).toHaveLength(0);
      let top = -Infinity;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point.fromBufferAttribute(vertices, vertex).applyMatrix4(matrix);
        top = Math.max(top, point.y);
        ray.set(new THREE.Vector3(point.x, 200, point.z), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObjects(houses), `bank plant ${i} foliage clear of houses`).toHaveLength(0);
      }
      heights.push(top - ground);
      if (position.z > 110) nearWaterfront++;
    }
    expect(nearWaterfront).toBeGreaterThan(25);
    expect(Math.min(...heights)).toBeGreaterThan(1.3);
    expect(Math.max(...heights)).toBeLessThan(3.4);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1.8);
  });

  it("keeps cypress crowns continuously tapered from every horizontal view", () => {
    const mesh = meshes(makeTown(), "Harbor cypresses")[0]!;
    const vertices = mesh.geometry.getAttribute("position");
    const rings = new Map<number, THREE.Vector2[]>();
    for (let i = 0; i < vertices.count; i++) {
      const y = vertices.getY(i);
      const point = new THREE.Vector2(vertices.getX(i), vertices.getZ(i));
      if (!rings.has(y)) rings.set(y, []);
      rings.get(y)!.push(point);
      if (y === 0) expect(point.length()).toBe(0);
    }
    const profile = [...rings].sort((a, b) => a[0] - b[0]);
    expect(profile.at(-1)![0]).toBe(12);
    for (let view = 0; view < 32; view++) {
      const direction = new THREE.Vector2(Math.cos(view * Math.PI / 16), Math.sin(view * Math.PI / 16));
      const widths = profile.map(([, points]) => {
        const projected = points.map(point => point.dot(direction));
        return Math.max(...projected) - Math.min(...projected);
      });
      const widest = widths.indexOf(Math.max(...widths));
      expect(profile[widest]![0]).toBeGreaterThanOrEqual(2);
      expect(profile[widest]![0]).toBeLessThanOrEqual(4);
      expect(widths[widest]!).toBeGreaterThan(1.5);
      expect(widths[widest]!).toBeLessThan(2.5);
      for (let i = widest + 1; i < widths.length; i++) {
        expect(widths[i]!, `view ${view}, height ${profile[i]![0]} has no repeated bulge`).toBeLessThan(widths[i - 1]!);
      }
    }
  });

  it("breaks shrub crowns into uneven foliage lobes around a recessed centre", () => {
    const planting = meshes(makeTown(), "Bank maquis")[0]!;
    const vertices = planting.geometry.getAttribute("position");
    const tips = new Map<string, number>();
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      if (y > 0.85) tips.set(`${x.toFixed(3)},${z.toFixed(3)}`, y);
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 4, 0.075), new THREE.Vector3(0, -1, 0));
    const centre = ray.intersectObject(new THREE.Mesh(planting.geometry, planting.material))[0]!.point.y;
    expect(tips.size).toBeGreaterThanOrEqual(2);
    expect(Math.min(...tips.values()) - centre).toBeGreaterThan(0.15);
    expect(Math.max(...tips.values()) - Math.min(...tips.values())).toBeGreaterThan(0.09);
  });

  it("uses finite deterministic geometry within a bounded render budget", () => {
    const group = makeTown();
    const all = meshes(group);
    const geometries = new Set(all.map(mesh => mesh.geometry));
    const materials = new Set(all.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    let triangles = 0;
    for (const mesh of all) {
      const positions = mesh.geometry.getAttribute("position");
      expect(Array.from(positions.array).every(Number.isFinite), mesh.name).toBe(true);
      const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
      if (mesh instanceof THREE.InstancedMesh) expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite), mesh.name).toBe(true);
      triangles += (mesh.geometry.index?.count ?? positions.count) / 3 * count;
    }
    expect(all.length).toBeLessThan(140);
    expect(geometries.size).toBeLessThan(26);
    expect(materials.size).toBeLessThan(30);
    expect(triangles).toBeLessThan(250_000);
    const next = meshes(makeTown());
    expect(next.map(mesh => [mesh.name, mesh instanceof THREE.InstancedMesh ? Array.from(mesh.instanceMatrix.array) : Array.from(mesh.geometry.getAttribute("position").array)]))
      .toEqual(all.map(mesh => [mesh.name, mesh instanceof THREE.InstancedMesh ? Array.from(mesh.instanceMatrix.array) : Array.from(mesh.geometry.getAttribute("position").array)]));
  });

  it("still supports the optional-shoal API", () => {
    const group = new THREE.Group();
    populateFishingTown(group, townObject, undefined, new THREE.MeshStandardMaterial());
    expect(new THREE.Box3().setFromObject(group).isEmpty()).toBe(false);
    expect(meshes(group, "Continuous harbor hillside")).toHaveLength(1);
  });
});
