import * as THREE from "three";
import type { BoatState, Vec2 } from "../sim/model";
import { depthAtTide, sampleLakeDepth } from "../game/bathymetry";
import type { WeatherSnapshot } from "../weather/types";
import { sampleWaves } from "../weather/waves";
import { createRandom } from "../weather/prng";

const CUE_COUNT = 18;
const SEGMENTS = 6;
const FIELD_SIZE = 110;

export function createWindPennant(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let i = 0; i < 8; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geometry.setIndex(indices);
  const pennant = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xf2ad42, side: THREE.DoubleSide }));
  pennant.name = "Apparent-wind mast pennant";
  pennant.frustumCulled = false;
  pennant.userData.inverse = new THREE.Matrix4();
  pennant.userData.flow = new THREE.Vector3();
  pennant.userData.up = new THREE.Vector3();
  pennant.userData.cross = new THREE.Vector3();
  return pennant;
}

/** The wind vector comes directly from the sail diagnostics (true wind minus boat velocity). */
export function updateWindPennant(
  pennant: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
  apparentWind: Vec2,
  time: number,
): void {
  pennant.parent?.updateWorldMatrix(true, false);
  const inverse = pennant.userData.inverse as THREE.Matrix4;
  inverse.copy(pennant.parent?.matrixWorld ?? new THREE.Matrix4()).invert();
  const speed = Math.hypot(apparentWind.x, apparentWind.y);
  const flow = pennant.userData.flow as THREE.Vector3;
  const up = pennant.userData.up as THREE.Vector3;
  const cross = pennant.userData.cross as THREE.Vector3;
  flow.set(apparentWind.x, 0, apparentWind.y).transformDirection(inverse);
  up.set(0, 1, 0).transformDirection(inverse);
  cross.set(-apparentWind.y, 0, apparentWind.x).transformDirection(inverse);
  const extension = THREE.MathUtils.smoothstep(speed, 0, 3);
  const flutter = THREE.MathUtils.smoothstep(speed, 0.1, 12);
  const positions = pennant.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const length = t * 0.68 * extension;
    const droop = -t * t * 0.56 * (1 - extension);
    const ripple = Math.sin(time * 9 - t * 9) * t * t * 0.055 * flutter;
    for (let side = 0; side < 2; side++) {
      const height = droop + (side - 0.5) * 0.22 * (1 - t);
      positions.setXYZ(i * 2 + side,
        flow.x * length + up.x * height + cross.x * ripple,
        flow.y * length + up.y * height + cross.y * ripple,
        flow.z * length + up.z * height + cross.z * ripple);
    }
  }
  positions.needsUpdate = true;
}

/** Sparse surface flow; the boat's sail and telltales remain the apparent-wind cues. */
export function createWindCues(): [THREE.LineSegments, Float32Array] {
  const random = createRandom(8143);
  const seeds = new Float32Array(CUE_COUNT * 3);
  for (let index = 0; index < seeds.length; index += 1) seeds[index] = random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CUE_COUNT * SEGMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aOpacity", new THREE.BufferAttribute(new Float32Array(CUE_COUNT * SEGMENTS * 2), 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xc3e1dc) } },
    vertexShader: `
      attribute float aOpacity;
      varying float vOpacity;
      void main() {
        vOpacity = aOpacity;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vOpacity;
      void main() {
        gl_FragColor = vec4(uColor, vOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const cues = new THREE.LineSegments(geometry, material);
  cues.name = "True-wind surface flow";
  cues.frustumCulled = false;
  cues.userData.advection = new THREE.Vector2();
  return [cues, seeds];
}

export function updateWindCues(
  cues: THREE.LineSegments,
  seeds: Float32Array,
  weather: WeatherSnapshot,
  state: BoatState,
  x: number,
  z: number,
): void {
  const speed = Math.hypot(weather.trueWind.x, weather.trueWind.y);
  cues.visible = speed > 0.25;
  const previousTime = cues.userData.time as number | undefined;
  const advection = cues.userData.advection as THREE.Vector2;
  const dt = previousTime === undefined ? 0 : Math.max(0, weather.time - previousTime);
  if (previousTime !== undefined && weather.time < previousTime) advection.set(0, 0);
  cues.userData.time = weather.time;
  // Integrate speed so a gust cannot jump or reverse the flow's time * speed phase.
  advection.x = THREE.MathUtils.euclideanModulo(advection.x + weather.trueWind.x * dt, FIELD_SIZE);
  advection.y = THREE.MathUtils.euclideanModulo(advection.y + weather.trueWind.y * dt, FIELD_SIZE);
  if (!cues.visible) return;

  const directionX = weather.trueWind.x / speed;
  const directionZ = weather.trueWind.y / speed;
  const positions = cues.geometry.getAttribute("position") as THREE.BufferAttribute;
  const opacity = cues.geometry.getAttribute("aOpacity") as THREE.BufferAttribute;
  const intensity = THREE.MathUtils.smoothstep(speed, 0.25, 8) *
    (0.07 + THREE.MathUtils.clamp(weather.gust, 0, 0.6) * 0.16);
  const length = 1.8 + Math.min(speed, 16) * 0.22;

  for (let index = 0; index < seeds.length / 3; index += 1) {
    const baseX = x + THREE.MathUtils.euclideanModulo(seeds[index * 3]! * FIELD_SIZE + advection.x - x + FIELD_SIZE / 2, FIELD_SIZE) - FIELD_SIZE / 2;
    const baseZ = z + THREE.MathUtils.euclideanModulo(seeds[index * 3 + 1]! * FIELD_SIZE + advection.y - z + FIELD_SIZE / 2, FIELD_SIZE) - FIELD_SIZE / 2;
    const distance = Math.hypot(baseX - x, baseZ - z);
    const edgeFade = 1 - THREE.MathUtils.smoothstep(distance, 35, 50);
    const boatFade = THREE.MathUtils.smoothstep(Math.hypot(baseX - state.position.x, baseZ - state.position.y), 5, 11);
    const landFade = THREE.MathUtils.smoothstep(depthAtTide(sampleLakeDepth(baseX, baseZ), weather.tideLevel), 0.1, 1.5);
    const envelope = 0.35 + 0.65 * Math.sin(seeds[index * 3 + 2]! * Math.PI + weather.time * 0.35) ** 2;
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      for (let end = 0; end < 2; end += 1) {
        const fraction = (segment + end) / SEGMENTS;
        const px = baseX + directionX * length * fraction;
        const pz = baseZ + directionZ * length * fraction;
        const vertex = (index * SEGMENTS + segment) * 2 + end;
        positions.setXYZ(vertex, px, weather.tideLevel + sampleWaves(weather.waves, px, pz, weather.time).height + 0.045, pz);
        opacity.setX(vertex, Math.sin(Math.PI * fraction) * intensity * edgeFade * boatFade * landFade * envelope);
      }
    }
  }
  positions.needsUpdate = true;
  opacity.needsUpdate = true;
}
