import * as THREE from "three";

export function sailCamberDirection(target: THREE.Vector3, head: THREE.Vector3, tack: THREE.Vector3, clew: THREE.Vector3, wind: THREE.Vector3): THREE.Vector3 {
  const hx = head.x - tack.x, hy = head.y - tack.y, hz = head.z - tack.z;
  const cx = clew.x - tack.x, cy = clew.y - tack.y, cz = clew.z - tack.z;
  target.set(hy * cz - hz * cy, hz * cx - hx * cz, hx * cy - hy * cx).normalize();
  // Let the belly pass through flat as wind crosses the cloth, rather than snapping sides.
  return target.multiplyScalar(THREE.MathUtils.clamp(target.dot(wind) / Math.max(.5, wind.length() * .15), -1, 1));
}

export function deformSailPoint(target: THREE.Vector3, u: number, v: number, time: number, luff: number, stall: number, direction: THREE.Vector3): THREE.Vector3 {
  const edge = 4 * u * (1 - u) * (1 - v);
  const flutter = Math.sin(time * 18 + v * 17 + u * 9) + Math.sin(time * 11 - v * 25) * .45;
  const belly = u > 0 && u < 1 ? Math.sin(u * 3.14159) * (1 - v) * .1 * (1 - stall * .55) : 0;
  target.addScaledVector(direction, belly + flutter * luff * edge * .19);
  target.y -= stall * edge * .08;
  return target;
}

export function sampleHullWaterMask(mesh: THREE.Mesh): { sections: THREE.Vector4[]; widths: THREE.Vector4[]; maxWidth: number } {
  const positions = mesh.geometry.getAttribute("position"), indices = mesh.geometry.index;
  if (!indices) throw new Error("Boat shell must have indexed triangles");
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox!;
  const sections: THREE.Vector4[] = [], widths: THREE.Vector4[] = [];
  for (let section = 0; section < 8; section++) {
    const z = THREE.MathUtils.lerp(bounds.min.z + .001, bounds.max.z - .001, section / 7);
    const segments: number[][] = [];
    for (let i = 0; i < indices.count; i += 3) {
      const hits: number[] = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = indices.getX(i + edge), b = indices.getX(i + (edge + 1) % 3);
        const az = positions.getZ(a), bz = positions.getZ(b);
        if ((az - z) * (bz - z) > 0 || Math.abs(bz - az) < 1e-8) continue;
        const t = (z - az) / (bz - az);
        hits.push(THREE.MathUtils.lerp(positions.getX(a), positions.getX(b), t), THREE.MathUtils.lerp(positions.getY(a), positions.getY(b), t));
      }
      if (hits.length >= 4) segments.push(hits.slice(0, 4));
    }
    if (!segments.length) throw new Error("Boat shell has an empty water-mask section");
    const low = Math.min(...segments.flatMap(s => [s[1]!, s[3]!]));
    const high = Math.max(...segments.flatMap(s => [s[1]!, s[3]!]));
    const row: number[] = [];
    for (let level = 1; level <= 4; level++) {
      const y = THREE.MathUtils.lerp(low, high, level / 4);
      let width = 0;
      for (const s of segments) {
        if (y < Math.min(s[1]!, s[3]!) - 1e-6 || y > Math.max(s[1]!, s[3]!) + 1e-6) continue;
        const t = Math.abs(s[3]! - s[1]!) < 1e-8 ? 0 : (y - s[1]!) / (s[3]! - s[1]!);
        width = Math.max(width, Math.abs(THREE.MathUtils.lerp(s[0]!, s[2]!, t)));
      }
      row.push(width);
    }
    sections.push(new THREE.Vector4(z, low, high, 0));
    widths.push(new THREE.Vector4(...row as [number, number, number, number]));
  }
  return { sections, widths, maxWidth: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) };
}

export function sailPoint(
  target: THREE.Vector3, head: THREE.Vector3, tack: THREE.Vector3,
  clew: THREE.Vector3, u: number, v: number, height: number, chord: number,
): THREE.Vector3 {
  const up = v * height, across = u * (1 - v) * chord;
  return target.set(tack.x + (head.x - tack.x) * up + (clew.x - tack.x) * across,
    tack.y + (head.y - tack.y) * up + (clew.y - tack.y) * across,
    tack.z + (head.z - tack.z) * up + (clew.z - tack.z) * across);
}

export class MeshyBoat {
  readonly root: THREE.Group;
  readonly hull: THREE.Object3D;
  readonly rig: THREE.Object3D;
  readonly boom: THREE.Object3D;
  readonly rudder: THREE.Object3D;
  readonly mastTop: THREE.Vector3;
  readonly camberDirection = new THREE.Vector3();
  private readonly sail: THREE.Mesh;
  private readonly head: THREE.Vector3;
  private readonly tack: THREE.Vector3;
  private readonly clew: THREE.Vector3;
  private readonly movingClew = new THREE.Vector3();
  private readonly vertex = new THREE.Vector3();
  private readonly inverseBoom = new THREE.Quaternion();
  private readonly surfaceVertex = new THREE.Vector3();
  private readonly telltaleAttachments: { indices: number[]; weights: number[] }[] = [];
  readonly waterMask: ReturnType<typeof sampleHullWaterMask>;

  constructor(root: THREE.Group, material: THREE.ShaderMaterial) {
    this.root = root;
    root.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    const node = (name: string): THREE.Object3D => {
      const result = root.getObjectByName(name);
      if (!result) throw new Error(`Boat asset is missing ${name}`);
      return result;
    };
    this.hull = node("HullPose");
    this.rig = node("RigPose");
    this.boom = node("BoomPivot");
    this.rudder = node("RudderPivot");
    this.waterMask = sampleHullWaterMask(node("HullExterior") as THREE.Mesh);
    this.sail = node("Mainsail") as THREE.Mesh;
    if (!this.sail.isMesh || !this.sail.geometry.getAttribute("uv")) throw new Error("Boat cloth has no deformation coordinates");
    this.head = node("SailHead").position.clone();
    this.tack = node("SailTack").position.clone();
    this.clew = node("SailClewRest").position.clone();
    this.mastTop = new THREE.Box3().setFromObject(node("Mast")).getCenter(new THREE.Vector3());
    this.mastTop.y = new THREE.Box3().setFromObject(node("Mast")).max.y;
    this.hull.add(this.rig);
    node("Pennant").visible = false;
    this.sail.material = material;
    this.sail.frustumCulled = false;
    const positions = this.sail.geometry.getAttribute("position");
    if (positions instanceof THREE.BufferAttribute) positions.setUsage(THREE.DynamicDrawUsage);
    else positions.data.setUsage(THREE.DynamicDrawUsage);
    const uv = this.sail.geometry.getAttribute("uv"), indices = this.sail.geometry.index;
    if (!indices) throw new Error("Boat cloth must have indexed triangles");
    for (let root = 0; root < 3; root++) {
      const u = .28, v = .22 + root * .23;
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
        const ax = uv.getX(a), ay = uv.getY(a), bx = uv.getX(b), by = uv.getY(b), cx = uv.getX(c), cy = uv.getY(c);
        const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(denominator) < 1e-8) continue;
        const wa = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / denominator;
        const wb = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / denominator;
        const wc = 1 - wa - wb;
        if (Math.min(wa, wb, wc) >= -1e-6) {
          this.telltaleAttachments.push({ indices: [a, b, c], weights: [wa, wb, wc] });
          break;
        }
      }
    }
    if (this.telltaleAttachments.length !== 3) throw new Error("Boat cloth does not cover its telltale anchors");
  }

  placeTelltale(line: THREE.Line, index: number, time: number, luff: number, stall: number): void {
    const attachment = this.telltaleAttachments[index]!;
    const cloth = this.sail.geometry.getAttribute("position"), uv = this.sail.geometry.getAttribute("uv");
    this.vertex.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner++) {
      const vertex = attachment.indices[corner]!;
      this.surfaceVertex.set(cloth.getX(vertex), cloth.getY(vertex), cloth.getZ(vertex));
      deformSailPoint(this.surfaceVertex, uv.getX(vertex), uv.getY(vertex), time, luff, stall, this.camberDirection);
      this.vertex.addScaledVector(this.surfaceVertex, attachment.weights[corner]!);
    }
    this.inverseBoom.copy(this.boom.quaternion).invert();
    this.vertex.sub(this.boom.position).applyQuaternion(this.inverseBoom);
    const positions = line.geometry.getAttribute("position");
    line.position.set(this.vertex.x - positions.getX(0), this.vertex.y - positions.getY(0), this.vertex.z - positions.getZ(0));
  }

  waterMaskWorldMatrix(): THREE.Matrix4 {
    this.hull.updateWorldMatrix(true, false);
    return this.hull.matrixWorld;
  }

  sync(hull: THREE.Object3D, rig: THREE.Object3D, boom: THREE.Object3D,
    rudder: THREE.Object3D, height: number, chord: number, worldWind: THREE.Vector3): void {
    this.hull.rotation.copy(hull.rotation);
    this.hull.scale.copy(hull.scale);
    this.rig.rotation.copy(rig.rotation);
    this.boom.rotation.copy(boom.rotation);
    this.rudder.rotation.copy(rudder.rotation);
    this.movingClew.copy(this.clew).sub(this.boom.position).applyEuler(this.boom.rotation).add(this.boom.position);
    this.rig.getWorldQuaternion(this.inverseBoom).invert();
    this.surfaceVertex.copy(worldWind).applyQuaternion(this.inverseBoom);
    sailCamberDirection(this.camberDirection, this.head, this.tack, this.movingClew, this.surfaceVertex);
    const positions = this.sail.geometry.getAttribute("position");
    const uv = this.sail.geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      sailPoint(this.vertex, this.head, this.tack, this.movingClew, uv.getX(i), uv.getY(i), height, chord);
      positions.setXYZ(i, this.vertex.x, this.vertex.y, this.vertex.z);
    }
    positions.needsUpdate = true;
  }
}
