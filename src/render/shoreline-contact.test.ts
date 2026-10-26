import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { lakeShoalFor, sampleLakeDepth, shoalDistance } from "../game/bathymetry";
import { FAIR_WINDS_OBJECTS } from "../game/world-definition";
import { BOAT_DEFINITIONS } from "../sim/boats";
import { createTownGroundSampler, populateFishingTown } from "./fishing-town";

const object = FAIR_WINDS_OBJECTS.find(object => object.kind === "town")!;
const shoal = lakeShoalFor(object.landformId!)!;
function makeTown(heading = 0) {
  const group = new THREE.Group();
  group.position.set(object.x, 0, object.z);
  group.rotation.y = heading;
  populateFishingTown(group, { ...object, heading }, shoal, new THREE.MeshStandardMaterial());
  group.updateMatrixWorld(true);
  const land = group.getObjectByName("Continuous harbor hillside") as THREE.Mesh;
  return { group, land };
}

describe("Juniper rendered shoreline and physical shoal", () => {
  it.each([0, 0.37])("keeps Float32 triangle interiors and edges out of physical water, with town yaw %s", heading => {
    const { land } = makeTown(heading);
    const vertices = land.geometry.getAttribute("position");
    const indices = land.geometry.getIndex()!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
    let wet = 0, dry = 0;
    for (let i = 0; i < indices.count; i += 3) {
      a.fromBufferAttribute(vertices, indices.getX(i)).applyMatrix4(land.matrixWorld);
      b.fromBufferAttribute(vertices, indices.getX(i + 1)).applyMatrix4(land.matrixWorld);
      c.fromBufferAttribute(vertices, indices.getX(i + 2)).applyMatrix4(land.matrixWorld);
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [0.5, 0], [0, 0.5], [0.5, 0.5], [1 / 3, 1 / 3], [0.1, 0.8]]) {
        p.copy(a).multiplyScalar(1 - u! - v!).addScaledVector(b, u!).addScaledVector(c, v!);
        expect(p.toArray().every(Number.isFinite)).toBe(true);
        const depth = sampleLakeDepth(p.x, p.z);
        if (shoalDistance(shoal, p.x, p.z) > shoal.islandRadius + 1e-4) {
          wet++;
          expect(p.y, `dry triangle over water at ${p.x},${p.z}`).toBeLessThanOrEqual(1e-5);
          for (const tide of [-1.5, -0.6, 0.5951928773138566, 0.6, 1.5]) {
            for (const boat of Object.values(BOAT_DEFINITIONS)) {
              if (depth + tide > boat.hull.draft + 0.08) {
                expect(p.y, `navigable ${boat.id} at tide ${tide}`).toBeLessThan(tide);
              }
            }
          }
        } else if (p.y > 0.01) dry++;
      }
    }
    expect(wet).toBeGreaterThan(4000);
    expect(dry).toBeGreaterThan(30000);
    for (let i = vertices.count - 121; i < vertices.count; i++) {
      expect(vertices.getY(i), "outer edge stays below lowest UI tide").toBeLessThan(-1.5);
    }
  }, 60_000);

  it("puts the retained bow, center and stern on the submerged physical shelf", () => {
    const { group, land } = makeTown();
    const sample = createTownGroundSampler(land.geometry);
    const heading = 1.4778576650933701;
    const x = 1172.509308809497, z = -370.8096146831715;
    const tide = 0.5951928773138566;
    for (const offset of [1.804, 0, -1.672]) {
      const px = x + Math.sin(heading) * offset, pz = z + Math.cos(heading) * offset;
      const y = sample(px - object.x, pz - object.z)!;
      expect(y).toBeLessThan(0);
      expect(Math.abs(y + sampleLakeDepth(px, pz))).toBeLessThan(0.12);
      expect(y).toBeLessThan(tide - 0.82 + 0.08);
    }
    const ray = new THREE.Raycaster();
    // Original chase direction and settled incident direction, across the real hull/sail.
    for (const camera of [new THREE.Vector3(1158.55632801815, 6.2, -377.3527581965222), new THREE.Vector3(1142.1747548735952, 16, -368.6153408830592)]) {
      for (const height of [tide, 1.2, 4.5]) {
        const target = new THREE.Vector3(x, height, z);
        ray.set(camera, target.clone().sub(camera).normalize());
        ray.far = camera.distanceTo(target);
        expect(ray.intersectObject(group, true), "boat sightline remains clear of actual town geometry").toHaveLength(0);
      }
    }
  });

  it("supports the marginal waterfront house at all foundation corners without changing its design", () => {
    const { group, land } = makeTown();
    const sample = createTownGroundSampler(land.geometry);
    const matrix = new THREE.Matrix4(), p = new THREE.Vector3();
    let houseFound = false, foundationFound = false;
    group.traverse(mesh => {
      if (!(mesh instanceof THREE.InstancedMesh) || !["Stucco houses", "Terrace foundations"].includes(mesh.name)) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        p.setFromMatrixPosition(matrix);
        if (Math.abs(p.x - 18) > 0.001 || Math.abs(p.z - 48) > 0.001) continue;
        if (mesh.name === "Stucco houses") {
          const scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
          matrix.decompose(p, rotation, scale);
          expect(scale.x).toBeCloseTo(10); expect(scale.y).toBeCloseTo(13.8); expect(scale.z).toBeCloseTo(8);
          houseFound = true;
        } else {
          for (const x of [-0.5, 0, 0.5]) for (const z of [-0.5, 0, 0.5]) {
            const bottom = new THREE.Vector3(x, -0.5, z).applyMatrix4(matrix);
            const top = new THREE.Vector3(x, 0.5, z).applyMatrix4(matrix);
            const y = sample(bottom.x, bottom.z)!;
            expect(y).toBeDefined(); expect(bottom.y).toBeLessThan(y); expect(top.y).toBeGreaterThan(y);
          }
          foundationFound = true;
        }
      }
    });
    expect(houseFound && foundationFound).toBe(true);
  });
});
