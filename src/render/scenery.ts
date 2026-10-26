import * as THREE from "three";
import { LAKE_RADIUS } from "../game/bathymetry";
import { createRandom } from "../weather/prng";
import type { WeatherSnapshot } from "../weather/types";

export interface LightingState {
  daylight: number;
  sky: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  hemisphereSky: THREE.Color;
  hemisphereGround: THREE.Color;
  hemisphereIntensity: number;
  exposure: number;
  waterDeep: THREE.Color;
  waterShallow: THREE.Color;
  starOpacity: number;
  celestialOpacity: number;
  celestialColor: THREE.Color;
}

interface DynamicMaterial {
  material: THREE.MeshStandardMaterial;
  day: THREE.Color;
  night: THREE.Color;
}

export class LakeScenery {
  readonly root = new THREE.Group();
  private readonly celestial: THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly stars: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private readonly dynamicMaterials: DynamicMaterial[] = [];
  private readonly lighting = createLightingState();

  constructor() {
    this.root.name = "Fair Winds Mediterranean basin";
    this.createDistantMountains();
    this.createShoreMasses();
    this.createTopographicRidges();
    this.createForest();
    this.createHillsideScrub();
    this.createShoreRocks();
    this.createShorelineDrift();
    this.celestial = this.createCelestial();
    this.stars = this.createStars();
    this.root.add(this.celestial, this.stars);
  }

  update(
    weather: WeatherSnapshot,
    camera: THREE.PerspectiveCamera,
    titleScreen = false,
  ): LightingState {
    const lighting = updateLightingState(
      this.lighting,
      weather.timeOfDay,
      weather.cloud,
      weather.visibility,
    );
    const daylight = lighting.daylight;
    for (const entry of this.dynamicMaterials) {
      entry.material.color
        .copy(entry.night)
        .lerp(entry.day, daylight);
      entry.material.emissive
        .copy(entry.material.color)
        .multiplyScalar(0.045 + daylight * 0.025);
    }

    const celestialDistance = 1_650;
    this.celestial.position
      .copy(camera.position)
      .addScaledVector(
        lighting.sunDirection,
        celestialDistance,
      );
    this.celestial.lookAt(camera.position);
    this.celestial.material.color.copy(lighting.celestialColor);
    this.celestial.material.opacity = lighting.celestialOpacity;
    this.celestial.scale.setScalar(
      (lighting.sunDirection.y > 0 ? 1 : 0.78) * (titleScreen ? 0.55 : 1),
    );
    this.stars.position.copy(camera.position);
    this.stars.material.opacity = lighting.starOpacity;
    return lighting;
  }

  setReflectionPass(active: boolean): void {
    this.celestial.visible = !active;
    this.stars.visible = !active;
  }

  private createDistantMountains(): void {
    // Broad, seed-stable massifs keep the horizon continuous while breaking the
    // repeated radial wave pattern into distinct Mediterranean ridges.
    const colors = [[0x87a6bc, 0x21384d], [0x6385a1, 0x1c334a], [0x4b6e8d, 0x182e45]] as const;
    colors.forEach(([day, night], layer) => {
      const positions: number[] = [];
      const indices: number[] = [];
      const segments = 1024;
      const random = createRandom(5_827 + layer * 197);
      const peakCount = 9 + layer * 2;
      const peaks = Array.from({ length: peakCount }, (_, index) => ({
        angle: ((index + random() * 0.55) / peakCount) * Math.PI * 2,
        height: 135 + random() * 150,
        width: 0.032 + random() * 0.04,
      }));
      // Authored shoulders and hanging valleys remain visible at menu distance.
      const harborProfile = [
        [1.7, 80], [1.79, 190], [1.87, 135], [1.94, 218],
        [1.965, 242], [1.99, 221], [2.02, 280], [2.05, 223],
        [2.105, 251], [2.145, 170], [2.19, 151], [2.225, 182],
        [2.29, 92], [2.35, 230], [2.41, 178], [2.445, 208],
        [2.49, 146], [2.55, 244], [2.565, 256], [2.592, 247],
        [2.614, 270], [2.635, 248], [2.66, 254], [2.684, 272],
        [2.705, 264], [2.725, 235], [2.77, 221], [2.83, 132],
        [2.9, 94], [3.01, 237], [3.08, 190], [3.14, 180], [3.23, 160],
      ] as const;
      const phase = random() * Math.PI * 2;
      for (let ring = 0; ring < 3; ring++) {
        for (let segment = 0; segment <= segments; segment++) {
          const angle = segment / segments * Math.PI * 2;
          const broadMass = 28 - layer * 5 + 12 * Math.sin(angle * 2 + phase)
            + 5 * Math.sin(angle * 5 - phase * 0.7);
          const harborSector = THREE.MathUtils.smoothstep(angle, 1.7, 1.95)
            * (1 - THREE.MathUtils.smoothstep(angle, 2.95, 3.2));
          const surroundingRidge = peaks.reduce((height, peak) => {
            const distance = Math.atan2(Math.sin(angle - peak.angle), Math.cos(angle - peak.angle));
            return height + peak.height * Math.exp(-0.5 * (distance / peak.width) ** 2);
          }, 0);
          const bearing = angle - layer * 0.055;
          const next = harborProfile.findIndex(([center]) => center >= bearing);
          const left = harborProfile[Math.max(0, next - 1)]!;
          const right = harborProfile[Math.max(0, next)]!;
          const harborRidge = THREE.MathUtils.lerp(left[1], right[1],
            left === right ? 0 : (bearing - left[0]) / (right[0] - left[0])) * (1 - layer * 0.28);
          const folds = (Math.sin(angle * 41 + layer * 1.8) * 5 + Math.sin(angle * 73 - layer) * 2)
            * harborSector;
          const ridge = broadMass + THREE.MathUtils.lerp(surroundingRidge, harborRidge, harborSector) + folds;
          const radius = LAKE_RADIUS + 1530 - layer * 230 + (ring - 1) * 210
            + Math.sin(angle * 4 + layer) * 42 + Math.sin(angle * 9 - layer) * 18;
          positions.push(Math.sin(angle) * radius, ring === 1 ? ridge - layer * 16 : -28, Math.cos(angle) * radius);
          if (ring < 2 && segment < segments) {
            const i = ring * (segments + 1) + segment;
            indices.push(i, i + segments + 1, i + 1, i + 1, i + segments + 1, i + segments + 2);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const normals = geometry.getAttribute("normal");
      for (let ring = 0; ring < 3; ring++) {
        const first = ring * (segments + 1);
        const last = first + segments;
        normals.setXYZ(last, normals.getX(first), normals.getY(first), normals.getZ(first));
      }
      geometry.computeBoundingSphere();
      const material = this.dynamicMaterial(day, night, 1);
      material.flatShading = false;
      const mountain = new THREE.Mesh(geometry, material);
      mountain.name = `Distant Mediterranean ridge ${layer + 1}`;
      this.root.add(mountain);
    });
  }
  private createShoreMasses(): void {
    const material = this.dynamicMaterial(0xf0ead9, 0x28373a, 1);
    material.vertexColors = true;
    material.flatShading = false;
    material.map = createGroundTexture();
    material.bumpMap = material.map;
    material.bumpScale = 0.22;
    const terrain = new THREE.Mesh(
      createCoastalTerrainGeometry(),
      material,
    );
    terrain.name = "Irregular coastal terrain";
    this.root.add(terrain);
  }

  private createTopographicRidges(): void {
    const random = createRandom(8_211);
    const material = this.dynamicMaterial(0xb7ad91, 0x303b3c, 1);
    const geometry = new THREE.DodecahedronGeometry(9, 0);
    const count = 92;
    const ridges = new THREE.InstancedMesh(geometry, material, count);
    ridges.name = "Embedded inland limestone";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const inner = coastalTerrainBand(angle, 4).radius;
      const outer = coastalTerrainBand(angle, 6).radius;
      const radius = inner + random() * (outer - inner);
      const height = sampleCoastalTerrainHeight(angle, radius);
      position.set(
        Math.sin(angle) * radius,
        height + 2.2,
        Math.cos(angle) * radius,
      );
      euler.set(
        -0.06 + random() * 0.18,
        -angle + (random() - 0.5) * 0.38,
        (random() - 0.5) * 0.12,
      );
      rotation.setFromEuler(euler);
      scale.set(
        1.2 + random() * 2.7,
        0.28 + random() * 0.52,
        0.38 + random() * 0.78,
      );
      // Inland rocks are outcrops embedded in the slope, not perched slabs.
      position.y = height - 9 * scale.y * 0.48;
      matrix.compose(position, rotation, scale);
      ridges.setMatrixAt(index, matrix);
    }
    ridges.instanceMatrix.needsUpdate = true;
    this.root.add(ridges);
  }

  private createForest(): void {
    const random = createRandom(1_947);
    const groves = Array.from({ length: 10 }, (_, index) => {
      const angle = index / 10 * Math.PI * 2 + (random() - 0.5) * 0.34;
      const inner = coastalTerrainBand(angle, 1).radius + 28;
      const outer = coastalTerrainBand(angle, 4).radius - 32;
      return {
        angle,
        radius: inner + (0.25 + random() * 0.5) * (outer - inner),
        angleSpread: 0.05 + random() * 0.09,
        radiusSpread: 60 + random() * 55,
      };
    });
    const crownGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0, -5), new THREE.Vector2(0.8, -4),
      new THREE.Vector2(1.45, -2.5), new THREE.Vector2(1.2, 0.5),
      new THREE.Vector2(0.65, 3.5), new THREE.Vector2(0, 5),
    ], 9);
    const trunkGeometry = new THREE.CylinderGeometry(
      0.25,
      0.38,
      4.2,
      6,
    );
    const crownMaterial = this.dynamicMaterial(
      0x2f5546,
      0x10272a,
      0.96,
    );
    const trunkMaterial = this.dynamicMaterial(
      0x5b4936,
      0x211e1c,
      0.98,
    );
    const count = 380;
    const crowns = new THREE.InstancedMesh(
      crownGeometry,
      crownMaterial,
      count,
    );
    const trunks = new THREE.InstancedMesh(
      trunkGeometry,
      trunkMaterial,
      count,
    );
    trunks.name = "Mediterranean tree trunks";
    crowns.name = "Mediterranean cypress crowns";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const grove = groves[index % groves.length]!;
      let angle = 0;
      let radius = 0;
      let slope = Infinity;
      for (let attempt = 0; attempt < 24 && slope > 0.85; attempt += 1) {
        angle = grove.angle + (random() - 0.5) * grove.angleSpread;
        const innerForest = coastalTerrainBand(angle, 1).radius + 18;
        const outerForest = coastalTerrainBand(angle, 4).radius - 22;
        radius = THREE.MathUtils.clamp(
          grove.radius + (random() - 0.5) * grove.radiusSpread * 2,
          innerForest,
          outerForest,
        );
        slope = coastalTerrainSlope(angle, radius);
      }
      const height = 0.62 + random() * 1.45;
      const terrainHeight = sampleCoastalTerrainHeight(angle, radius);
      position.set(
        Math.sin(angle) * radius,
        terrainHeight + 5 * height,
        Math.cos(angle) * radius,
      );
      euler.set(0, random() * Math.PI * 2, 0);
      rotation.setFromEuler(euler);
      scale.set(
        height * (0.84 + random() * 0.22),
        height,
        height * (0.84 + random() * 0.22),
      );
      matrix.compose(position, rotation, scale);
      crowns.setMatrixAt(index, matrix);

      position.y = terrainHeight + 2.1 * height - 0.3;
      scale.set(height, height, height);
      matrix.compose(position, rotation, scale);
      trunks.setMatrixAt(index, matrix);
    }
    crowns.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    this.root.add(trunks, crowns);
  }

  private createShoreRocks(): void {
    const random = createRandom(4_431);
    const material = this.dynamicMaterial(
      0x777b75,
      0x202f36,
      1,
    );
    const geometry = new THREE.DodecahedronGeometry(5.5, 0);
    const count = 120;
    const rocks = new THREE.InstancedMesh(
      geometry,
      material,
      count,
    );
    rocks.name = "Grounded shoreline rocks";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = LAKE_RADIUS - 190 + random() * 280;
      position.set(
        Math.sin(angle) * radius,
        -0.4 + random() * 7,
        Math.cos(angle) * radius,
      );
      euler.set(
        random() * 0.25,
        random() * Math.PI * 2,
        random() * 0.2,
      );
      rotation.setFromEuler(euler);
      scale.set(
        0.45 + random() * 1.5,
        0.3 + random() * 0.9,
        0.55 + random() * 1.9,
      );
      position.y = sampleCoastalTerrainHeight(angle, radius) + 5.5 * scale.y * 0.3;
      matrix.compose(position, rotation, scale);
      rocks.setMatrixAt(index, matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.root.add(rocks);
  }

  private createShorelineDrift(): void {
    const random = createRandom(6_903);
    const material = this.dynamicMaterial(0x9a9788, 0x26343a, 1);
    const geometry = new THREE.DodecahedronGeometry(1.7, 0);
    const count = 210;
    const stones = new THREE.InstancedMesh(geometry, material, count);
    stones.name = "Embedded shoreline stones";
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const shore = coastalTerrainBand(angle, 1).radius;
      const radius = shore + 4 + random() * 42;
      const height = sampleCoastalTerrainHeight(angle, radius);
      position.set(
        Math.sin(angle) * radius,
        height,
        Math.cos(angle) * radius,
      );
      euler.set(random() * 0.4, random() * Math.PI, random() * 0.3);
      rotation.setFromEuler(euler);
      const size = 0.45 + random() * 1.55;
      scale.set(size * (1.4 + random()), size * 0.42, size);
      matrix.compose(position, rotation, scale);
      stones.setMatrixAt(index, matrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    this.root.add(stones);
  }

  private createHillsideScrub(): void {
    const random = createRandom(6_124);
    const groves = Array.from({ length: 8 }, (_, index) => {
      const angle = index / 8 * Math.PI * 2 + (random() - 0.5) * 0.38;
      const inner = coastalTerrainBand(angle, 2).radius;
      const outer = coastalTerrainBand(angle, 6).radius - 40;
      return {
        angle,
        radius: inner + (0.2 + random() * 0.6) * (outer - inner),
        angleSpread: 0.06 + random() * 0.12,
        radiusSpread: 75 + random() * 70,
      };
    });
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = this.dynamicMaterial(0x7a8659, 0x202f2c, 1);
    const scrub = new THREE.InstancedMesh(geometry, material, 280);
    scrub.name = "Grounded Mediterranean hillside scrub";
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < scrub.count; i++) {
      const grove = groves[Math.floor(i / (scrub.count / groves.length))]!;
      const angle = grove.angle + (random() - 0.5) * grove.angleSpread;
      const inner = coastalTerrainBand(angle, 2).radius;
      const outer = coastalTerrainBand(angle, 6).radius - 20;
      const radius = THREE.MathUtils.clamp(
        grove.radius + (random() - 0.5) * grove.radiusSpread * 2,
        inner,
        outer,
      );
      transform.position.set(Math.sin(angle) * radius, sampleCoastalTerrainHeight(angle, radius) - 0.5, Math.cos(angle) * radius);
      transform.scale.set(6 + random() * 8, 1.8 + random() * 3.2, 4 + random() * 7);
      transform.rotation.y = random() * Math.PI;
      transform.updateMatrix();
      scrub.setMatrixAt(i, transform.matrix);
      color.setRGB(0.76 + random() * 0.24, 0.85 + random() * 0.15, 0.7 + random() * 0.2);
      scrub.setColorAt(i, color);
    }
    scrub.instanceMatrix.needsUpdate = true;
    scrub.instanceColor!.needsUpdate = true;
    this.root.add(scrub);
  }

  private createCelestial(): THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  > {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffe7b2,
      transparent: true,
      opacity: 1,
      fog: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    const celestial = new THREE.Mesh(
      new THREE.CircleGeometry(48, 40),
      material,
    );
    celestial.renderOrder = -1;
    return celestial;
  }

  private createStars(): THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > {
    const random = createRandom(2_846);
    const positions = new Float32Array(620 * 3);
    for (let index = 0; index < 620; index += 1) {
      const azimuth = random() * Math.PI * 2;
      const elevation = 0.08 + random() * Math.PI * 0.42;
      const radius = 1_800;
      positions[index * 3] =
        Math.cos(elevation) * Math.sin(azimuth) * radius;
      positions[index * 3 + 1] = Math.sin(elevation) * radius;
      positions[index * 3 + 2] =
        Math.cos(elevation) * Math.cos(azimuth) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const material = new THREE.PointsMaterial({
      color: 0xdce8ee,
      size: 1.6,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    });
    return new THREE.Points(geometry, material);
  }

  private dynamicMaterial(
    day: THREE.ColorRepresentation,
    night: THREE.ColorRepresentation,
    roughness: number,
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: day,
      roughness,
      metalness: 0,
      flatShading: true,
    });
    this.dynamicMaterials.push({
      material,
      day: new THREE.Color(day),
      night: new THREE.Color(night),
    });
    return material;
  }
}

export function createCoastalTerrainGeometry(
  segments = COASTAL_TERRAIN_SEGMENTS,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    for (let band = 0; band < COASTAL_RADIAL_BANDS.length; band += 1) {
      const { radius, height } = coastalTerrainBand(angle, band);
      positions.push(
        Math.sin(angle) * radius,
        height,
        Math.cos(angle) * radius,
      );
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      uvs.push(x / 64, z / 64);
    }
  }

  const bandCount = COASTAL_RADIAL_BANDS.length;
  for (let segment = 0; segment < segments; segment += 1) {
    for (let band = 0; band < bandCount - 1; band += 1) {
      const near = segment * bandCount + band;
      const far = near + bandCount;
      indices.push(near, near + 1, far, near + 1, far + 1, far);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const offset = vertex * 3;
    setMediterraneanGroundColor(
      color,
      positions[offset]!,
      positions[offset + 2]!,
      positions[offset + 1]!,
      1 - Math.max(0, normals.getY(vertex)),
    );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const GROUND_SHORE = new THREE.Color(0xcbb688);
const GROUND_OLIVE = new THREE.Color(0x7f9154);
const GROUND_FOREST_FLOOR = new THREE.Color(0x586d43);
const GROUND_LIMESTONE = new THREE.Color(0xd3c5a7);
const GROUND_GRASS = new THREE.Color(0x718d49);

// World-space masks keep the soil palette coherent across the basin and town.
export function setMediterraneanGroundColor(
  target: THREE.Color,
  x: number,
  z: number,
  height: number,
  slope: number,
): void {
  const macro = terrainNoise2d(x * 0.006, z * 0.006);
  const patch = terrainNoise2d(x * 0.022, z * 0.022);
  const grassPatch = terrainNoise2d(x * 0.009 + 37, z * 0.009 - 19);
  const scrubPatch = terrainNoise2d(x * 0.031 - 23, z * 0.031 + 17);
  const grain = terrainNoise2d(x * 0.12, z * 0.12);
  target.copy(GROUND_SHORE).lerp(
    GROUND_OLIVE,
    THREE.MathUtils.smoothstep(height, -0.2, 10) * (0.34 + macro * 0.42),
  );
  target.lerp(
    GROUND_FOREST_FLOOR,
    THREE.MathUtils.smoothstep(height, 12, 46) * (0.2 + patch * 0.46),
  );
  const grassCover = THREE.MathUtils.smoothstep(grassPatch, 0.36, 0.74)
    * THREE.MathUtils.smoothstep(height, 1, 34)
    * (1 - THREE.MathUtils.smoothstep(slope, 0.22, 0.58));
  const scrubCover = THREE.MathUtils.smoothstep(scrubPatch, 0.42, 0.78)
    * THREE.MathUtils.smoothstep(height, 5, 40)
    * (1 - THREE.MathUtils.smoothstep(slope, 0.28, 0.62));
  target.lerp(GROUND_GRASS, Math.min(0.72, grassCover * 0.62 + scrubCover * 0.24));
  const exposedStone = THREE.MathUtils.smoothstep(slope, 0.28, 0.58)
    * THREE.MathUtils.smoothstep(height, 1, 18);
  target.lerp(GROUND_LIMESTONE, exposedStone * (0.38 + macro * 0.32));
  target.multiplyScalar(0.82 + macro * 0.24 + patch * 0.1 + grain * 0.045);
}

function terrainNoise2d(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const smoothX = fx * fx * (3 - 2 * fx);
  const smoothZ = fz * fz * (3 - 2 * fz);
  const top = THREE.MathUtils.lerp(terrainNoiseCell(x0, z0), terrainNoiseCell(x0 + 1, z0), smoothX);
  const bottom = THREE.MathUtils.lerp(terrainNoiseCell(x0, z0 + 1), terrainNoiseCell(x0 + 1, z0 + 1), smoothX);
  return THREE.MathUtils.lerp(top, bottom, smoothZ);
}

function terrainNoiseCell(x: number, z: number): number {
  let hash = Math.imul(x, 374761393) + Math.imul(z, 668265263) + 0x5f356495;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

// A small repeatable surface map adds scale to both coastal and town ground.
// World-space UVs keep its grain consistent across different terrain triangles.
export function createGroundTexture(): THREE.DataTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 861;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const ax = x / size * Math.PI * 2;
    const ay = y / size * Math.PI * 2;
    const macro = Math.sin(ax * 2 + Math.sin(ay) * 0.7) * Math.cos(ay * 3 - ax * 0.4);
    const grain = Math.sin(ax * 9 + ay * 5) * Math.cos(ay * 11 - ax * 7);
    const shade = Math.max(0, Math.min(255, Math.round(208 + macro * 20 + grain * 9 + ((seed >>> 24) / 255 - 0.5) * 12)));
    pixels.set([shade, shade, shade, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const COASTAL_RADIAL_BANDS = [0, 28, 74, 148, 266, 418, 610] as const;
const COASTAL_BASE_HEIGHTS = [-1.8, 0.45, 5.8, 16, 36, 66, 106] as const;
const COASTAL_TERRAIN_SEGMENTS = 192;

export const COASTAL_TERRAIN_BAND_COUNT = COASTAL_RADIAL_BANDS.length;

function angularDistance(angle: number, center: number): number {
  return Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
}

function angularFeature(
  angle: number,
  center: number,
  width: number,
): number {
  const distance = angularDistance(angle, center) / width;
  return Math.exp(-distance * distance);
}

function coastalTerrainBand(
  angle: number,
  band: number,
): { radius: number; height: number } {
  const shoreline =
    LAKE_RADIUS - 25 +
    Math.sin(angle * 2 + 0.4) * 42 +
    Math.sin(angle * 5 - 1.1) * 21 +
    Math.sin(angle * 11 + 2.2) * 8 +
    Math.sin(angle * 23 - 0.3) * 3.5 -
    angularFeature(angle, 0.52, 0.16) * 96 -
    angularFeature(angle, 3.92, 0.22) * 72 +
    angularFeature(angle, 1.55, 0.19) * 92 +
    angularFeature(angle, 5.3, 0.17) * 68;
  const headland =
    Math.sin(angle * 2.1 - 0.7) * 0.5 +
    Math.sin(angle * 5.3 + 1.8) * 0.28 +
    angularFeature(angle, 1.55, 0.24) * 0.7 +
    angularFeature(angle, 5.3, 0.2) * 0.52 -
    angularFeature(angle, 0.52, 0.21) * 0.58;
  const riverValley = angularFeature(angle, 3.92, 0.14);
  const bandProgress = band / (COASTAL_RADIAL_BANDS.length - 1);
  return {
    radius:
      shoreline + COASTAL_RADIAL_BANDS[band]! +
      Math.sin(angle * (4 + band) + band * 1.7) * (4 + band * 4.5) +
      Math.sin(angle * (13 + band * 2) - band) * bandProgress * 6,
    height:
      COASTAL_BASE_HEIGHTS[band]! +
      (band === 0
        ? 0
        : headland * (4 + band * 7) +
          Math.sin(angle * 9 - band * 0.8) * bandProgress * 5 -
          riverValley * bandProgress * (13 + band * 5) +
          angularFeature(angle, 1.55, 0.28) * bandProgress * band * 3.5),
  };
}

function coastalTerrainSlope(angle: number, radius: number, step = 5): number {
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  const sample = (sampleX: number, sampleZ: number) => sampleCoastalTerrainHeight(
    Math.atan2(sampleX, sampleZ),
    Math.hypot(sampleX, sampleZ),
  );
  const dx = (sample(x + step, z) - sample(x - step, z)) / (2 * step);
  const dz = (sample(x, z + step) - sample(x, z - step)) / (2 * step);
  return Math.hypot(dx, dz);
}

export function sampleCoastalTerrainHeight(
  angle: number,
  radius: number,
  segments = COASTAL_TERRAIN_SEGMENTS,
): number {
  const normalizedAngle = THREE.MathUtils.euclideanModulo(
    angle,
    Math.PI * 2,
  );
  const segment = Math.min(
    Math.floor((normalizedAngle / (Math.PI * 2)) * segments),
    segments - 1,
  );
  const startAngle = (segment / segments) * Math.PI * 2;
  const endAngle = ((segment + 1) / segments) * Math.PI * 2;
  const point = {
    x: Math.sin(normalizedAngle) * radius,
    z: Math.cos(normalizedAngle) * radius,
  };

  for (let band = 0; band < COASTAL_RADIAL_BANDS.length - 1; band += 1) {
    const innerStart = coastalTerrainVertex(startAngle, band);
    const innerEnd = coastalTerrainVertex(endAngle, band);
    const outerStart = coastalTerrainVertex(startAngle, band + 1);
    const outerEnd = coastalTerrainVertex(endAngle, band + 1);
    const firstTriangleHeight = heightOnTerrainTriangle(
      point,
      innerStart,
      innerEnd,
      outerStart,
    );
    if (firstTriangleHeight !== undefined) return firstTriangleHeight;
    const secondTriangleHeight = heightOnTerrainTriangle(
      point,
      outerStart,
      innerEnd,
      outerEnd,
    );
    if (secondTriangleHeight !== undefined) return secondTriangleHeight;
  }

  // Preserve a useful result outside the rendered ring. Forest placement stays
  // inside it and therefore always takes the exact triangle path above.
  const bands = COASTAL_RADIAL_BANDS.map((_, band) =>
    coastalTerrainBand(normalizedAngle, band),
  );
  if (radius <= bands[0]!.radius) return bands[0]!.height;
  for (let band = 1; band < bands.length; band += 1) {
    const inner = bands[band - 1]!;
    const outer = bands[band]!;
    if (radius > outer.radius) continue;
    const progress = (radius - inner.radius) / (outer.radius - inner.radius);
    return THREE.MathUtils.lerp(inner.height, outer.height, progress);
  }
  return bands.at(-1)!.height;
}

interface TerrainVertex {
  x: number;
  y: number;
  z: number;
}

function coastalTerrainVertex(angle: number, band: number): TerrainVertex {
  const terrainBand = coastalTerrainBand(angle, band);
  return {
    x: Math.sin(angle) * terrainBand.radius,
    y: terrainBand.height,
    z: Math.cos(angle) * terrainBand.radius,
  };
}

function heightOnTerrainTriangle(
  point: { x: number; z: number },
  a: TerrainVertex,
  b: TerrainVertex,
  c: TerrainVertex,
): number | undefined {
  const denominator =
    (b.z - c.z) * (a.x - c.x) +
    (c.x - b.x) * (a.z - c.z);
  if (Math.abs(denominator) < 1e-8) return undefined;
  const aWeight =
    ((b.z - c.z) * (point.x - c.x) +
      (c.x - b.x) * (point.z - c.z)) /
    denominator;
  const bWeight =
    ((c.z - a.z) * (point.x - c.x) +
      (a.x - c.x) * (point.z - c.z)) /
    denominator;
  const cWeight = 1 - aWeight - bWeight;
  const epsilon = 1e-6;
  if (
    aWeight < -epsilon ||
    bWeight < -epsilon ||
    cWeight < -epsilon
  ) {
    return undefined;
  }
  return a.y * aWeight + b.y * bWeight + c.y * cWeight;
}

const NIGHT_SKY = new THREE.Color(0x102844);
const DAY_SKY = new THREE.Color(0x88b9cc);
const SUNSET_SKY = new THREE.Color(0xf5aa72);
const OVERCAST_SKY = new THREE.Color(0x788d98);
const VISIBILITY_FOG = new THREE.Color(0xc8c8ba);
const WARM_SUN = new THREE.Color(0xffecc5);
const SUNSET_SUN = new THREE.Color(0xffaa68);
const OVERCAST_SUN = new THREE.Color(0xd8e2e8);
const HEMISPHERE_SKY = new THREE.Color(0xdce8e8);
const HEMISPHERE_GROUND_DAY = new THREE.Color(0x31463f);
const HEMISPHERE_GROUND_NIGHT = new THREE.Color(0x182b36);
const WATER_DEEP_NIGHT = new THREE.Color(0x082f4c);
const WATER_DEEP_DAY = new THREE.Color(0x0f739b);
const WATER_DEEP_OVERCAST = new THREE.Color(0x234f68);
const WATER_SHALLOW_NIGHT = new THREE.Color(0x245f78);
const WATER_SHALLOW_DAY = new THREE.Color(0x4aaabd);
const WATER_SHALLOW_OVERCAST = new THREE.Color(0x568497);
const MOON_COLOR = new THREE.Color(0xd9e2e7);

function createLightingState(): LightingState {
  return {
    daylight: 0,
    sky: new THREE.Color(),
    fog: new THREE.Color(),
    sunColor: new THREE.Color(),
    sunDirection: new THREE.Vector3(),
    sunIntensity: 0,
    hemisphereSky: new THREE.Color(),
    hemisphereGround: new THREE.Color(),
    hemisphereIntensity: 0,
    exposure: 1,
    waterDeep: new THREE.Color(),
    waterShallow: new THREE.Color(),
    starOpacity: 0,
    celestialOpacity: 0,
    celestialColor: new THREE.Color(),
  };
}

function updateLightingState(
  target: LightingState,
  timeOfDay: number,
  cloud: number,
  visibility: number,
): LightingState {
  const wrappedTime = ((timeOfDay % 24) + 24) % 24;
  const sunPhase = ((wrappedTime - 6) / 12) * Math.PI;
  const rawSunHeight = Math.sin(sunPhase);
  const daylight = THREE.MathUtils.smoothstep(
    rawSunHeight,
    -0.12,
    0.32,
  );
  const golden =
    Math.exp(-Math.pow((wrappedTime - 6.6) / 1.55, 2)) +
    Math.exp(-Math.pow((wrappedTime - 17.6) / 1.65, 2));
  const overcast = THREE.MathUtils.clamp(cloud, 0, 1);
  const azimuth = ((wrappedTime - 6) / 24) * Math.PI * 2 + 2.85;
  const isSun = rawSunHeight >= -0.04;
  const celestialHeight = isSun
    ? Math.max(rawSunHeight, 0.035)
    : Math.max(-rawSunHeight, 0.12);
  target.sunDirection.set(
    Math.sin(azimuth),
    celestialHeight,
    Math.cos(azimuth),
  ).normalize();
  if (!isSun) {
    target.sunDirection
      .multiplyScalar(-1)
      .setY(celestialHeight)
      .normalize();
  }
  const sunsetBlend = THREE.MathUtils.clamp(
    golden * 0.9 * daylight,
    0,
    0.84,
  );
  target.daylight = daylight;
  target.sky
    .copy(NIGHT_SKY)
    .lerp(DAY_SKY, daylight)
    .lerp(SUNSET_SKY, sunsetBlend)
    .lerp(OVERCAST_SKY, overcast * 0.32);
  target.fog
    .copy(target.sky)
    .lerp(VISIBILITY_FOG, (1 - visibility) * 0.52);
  target.sunColor
    .copy(WARM_SUN)
    .lerp(SUNSET_SUN, THREE.MathUtils.clamp(golden, 0, 1))
    .lerp(OVERCAST_SUN, overcast * 0.45);
  target.sunIntensity =
      (isSun ? 0.55 + daylight * 2.65 : 0.12) *
      (1 - overcast * 0.58);
  target.hemisphereSky.copy(target.sky).lerp(HEMISPHERE_SKY, 0.35);
  target.hemisphereGround
    .copy(HEMISPHERE_GROUND_DAY)
    .lerp(HEMISPHERE_GROUND_NIGHT, 1 - daylight);
  target.hemisphereIntensity = 0.55 + daylight * 1.55;
  target.exposure =
      0.72 +
      daylight * 0.34 +
      THREE.MathUtils.clamp(golden, 0, 1) * 0.08 -
      overcast * 0.08;
  target.waterDeep
    .copy(WATER_DEEP_NIGHT)
    .lerp(WATER_DEEP_DAY, daylight)
    .lerp(WATER_DEEP_OVERCAST, overcast * 0.3);
  target.waterShallow
    .copy(WATER_SHALLOW_NIGHT)
    .lerp(WATER_SHALLOW_DAY, daylight)
    .lerp(WATER_SHALLOW_OVERCAST, overcast * 0.32);
  target.starOpacity = THREE.MathUtils.clamp(
    1 - daylight * 1.45,
    0,
    0.82,
  );
  target.celestialOpacity = 0.82 - overcast * 0.54;
  target.celestialColor.copy(isSun ? target.sunColor : MOON_COLOR);
  return target;
}

export function lightingForTime(
  timeOfDay: number,
  cloud: number,
  visibility: number,
): LightingState {
  return updateLightingState(
    createLightingState(),
    timeOfDay,
    cloud,
    visibility,
  );
}

