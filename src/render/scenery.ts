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
    this.root.name = "Fair Winds mountain basin";
    this.createDistantMountains();
    this.createShoreMasses();
    this.createForest();
    this.createShoreRocks();
    this.celestial = this.createCelestial();
    this.stars = this.createStars();
    this.root.add(this.celestial, this.stars);
  }

  update(
    weather: WeatherSnapshot,
    camera: THREE.PerspectiveCamera,
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
      lighting.sunDirection.y > 0 ? 1 : 0.78,
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
    const random = createRandom(5_713);
    const colors = [
      [0x7b91a0, 0x182e45],
      [0x879aa6, 0x1c334a],
      [0x93a4ab, 0x21384d],
    ] as const;
    for (let index = 0; index < 34; index += 1) {
      const angle =
        (index / 34) * Math.PI * 2 +
        (random() - 0.5) * 0.11;
      const radius = LAKE_RADIUS + 340 + random() * 480;
      const height = 145 + random() * 260;
      const width = 145 + random() * 185;
      const palette = colors[index % colors.length]!;
      const material = this.dynamicMaterial(
        palette[0],
        palette[1],
        0.98,
      );
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(
          width,
          height,
          7 + (index % 4),
          3,
        ),
        material,
      );
      mountain.position.set(
        Math.sin(angle) * radius,
        height * 0.34 - 68,
        Math.cos(angle) * radius,
      );
      mountain.rotation.y = random() * Math.PI;
      mountain.scale.z = 0.58 + random() * 0.6;
      this.root.add(mountain);
      for (const side of [-1, 1]) {
        const shoulderHeight =
          height * (0.42 + random() * 0.24);
        const shoulderWidth =
          width * (0.46 + random() * 0.2);
        const shoulder = new THREE.Mesh(
          new THREE.ConeGeometry(
            shoulderWidth,
            shoulderHeight,
            6 + (index % 3),
            2,
          ),
          material,
        );
        const tangentX = Math.cos(angle);
        const tangentZ = -Math.sin(angle);
        shoulder.position.set(
          mountain.position.x +
            tangentX * side * width * 0.42,
          shoulderHeight * 0.34 - 68,
          mountain.position.z +
            tangentZ * side * width * 0.42,
        );
        shoulder.rotation.y = random() * Math.PI;
        shoulder.scale.z = 0.72 + random() * 0.38;
        this.root.add(shoulder);
      }
    }
  }

  private createShoreMasses(): void {
    const terrain = new THREE.Mesh(
      createCoastalTerrainGeometry(),
      this.dynamicMaterial(0x7d8b73, 0x172d32, 0.96),
    );
    terrain.name = "Irregular coastal terrain";
    this.root.add(terrain);
  }

  private createForest(): void {
    const random = createRandom(1_947);
    const crownGeometry = new THREE.ConeGeometry(2.8, 10, 6, 2);
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
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const innerForest = coastalTerrainBand(angle, 1).radius + 18;
      const outerForest = coastalTerrainBand(angle, 4).radius - 22;
      const radius = innerForest + random() * (outerForest - innerForest);
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

      position.y = terrainHeight + 1.8 * height;
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
      matrix.compose(position, rotation, scale);
      rocks.setMatrixAt(index, matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.root.add(rocks);
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
    }
  }

  const bandCount = COASTAL_RADIAL_BANDS.length;
  for (let segment = 0; segment < segments; segment += 1) {
    for (let band = 0; band < bandCount - 1; band += 1) {
      const near = segment * bandCount + band;
      const far = near + bandCount;
      indices.push(near, far, near + 1, near + 1, far, far + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const COASTAL_RADIAL_BANDS = [0, 38, 125, 285, 520] as const;
const COASTAL_BASE_HEIGHTS = [-1.4, 1.1, 10, 34, 72] as const;
const COASTAL_TERRAIN_SEGMENTS = 128;

function coastalTerrainBand(
  angle: number,
  band: number,
): { radius: number; height: number } {
  const shoreline =
    LAKE_RADIUS - 24 +
    Math.sin(angle * 3 + 0.4) * 34 +
    Math.sin(angle * 7 - 1.1) * 17 +
    Math.sin(angle * 13 + 2.2) * 7;
  const headland =
    Math.sin(angle * 2.1 - 0.7) * 0.5 +
    Math.sin(angle * 5.3 + 1.8) * 0.28;
  const bandProgress = band / (COASTAL_RADIAL_BANDS.length - 1);
  return {
    radius:
      shoreline + COASTAL_RADIAL_BANDS[band]! +
      Math.sin(angle * (4 + band) + band * 1.7) * (5 + band * 6),
    height:
      COASTAL_BASE_HEIGHTS[band]! +
      (band === 0
        ? 0
        : headland * (4 + band * 7) +
          Math.sin(angle * 9 - band * 0.8) * bandProgress * 5),
  };
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
