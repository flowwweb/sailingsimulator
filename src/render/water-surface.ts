import * as THREE from "three";
import { LAKE_BASIN, LAKE_SHOALS } from "../game/bathymetry";
import type { WeatherSnapshot } from "../weather/types";
import { significantWaveHeight, waveShaderArrays } from "../weather/waves";

interface WaterSurfaceOptions {
  reflectionTexture: THREE.Texture;
  reflectionMatrix: THREE.Matrix4;
  compact: boolean;
}
export function createWaterSurface(options: WaterSurfaceOptions): THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  > {
    const geometry = createAdaptiveWaterGeometry(
      4_200,
      options.compact ? 168 : 220,
      1.85,
    );
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uWindVector: { value: new THREE.Vector2() },
        uTide: { value: 0 },
        uHullWorldToLocal: { value: new THREE.Matrix4() },
        uHullMask: { value: 0 },
        uImportedHullMask: { value: 0 },
        uHullSections: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
        uHullWidths: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
        uHullMaxWidth: { value: 0 },
        uWaveDirection: { value: new Float32Array(12) },
        uWaveAmplitude: { value: new Float32Array(6) },
        uWaveNumber: { value: new Float32Array(6) },
        uWaveFrequency: { value: new Float32Array(6) },
        uWavePhase: { value: new Float32Array(6) },
        uWaveSteepness: { value: new Float32Array(6) },
        uSignificantWaveHeight: { value: 0.5 },
        uShoalCenter: {
          value: new Float32Array(
            LAKE_SHOALS.flatMap((shoal) => [shoal.x, shoal.z]),
          ),
        },
        uShoalIslandRadius: {
          value: new Float32Array(
            LAKE_SHOALS.map((shoal) => shoal.islandRadius),
          ),
        },
        uShoalShelfRadius: {
          value: new Float32Array(
            LAKE_SHOALS.map((shoal) => shoal.shelfRadius),
          ),
        },
        uShoalScale: {
          value: new Float32Array(
            LAKE_SHOALS.flatMap((shoal) => [shoal.scaleX, shoal.scaleZ]),
          ),
        },
        uShoalRotation: {
          value: new Float32Array(
            LAKE_SHOALS.map((shoal) => shoal.rotation),
          ),
        },
        uShoalIrregularity: {
          value: new Float32Array(
            LAKE_SHOALS.map((shoal) => shoal.irregularity),
          ),
        },
        uShoalPhase: {
          value: new Float32Array(
            LAKE_SHOALS.map((shoal) => shoal.phase),
          ),
        },
        uSunDirection: { value: new THREE.Vector3(-0.45, 0.72, -0.3).normalize() },
        uSunColor: { value: new THREE.Color(0xffe7bd) },
        uSkyColor: { value: new THREE.Color(0x9bc4cb) },
        uWaterDeep: { value: new THREE.Color(0x0b3e50) },
        uWaterShallow: { value: new THREE.Color(0x4b9b9a) },
        uReflectionTexture: {
          value: options.reflectionTexture,
        },
        uReflectionMatrix: {
          value: options.reflectionMatrix,
        },
        uReflectionTexel: {
          value: new THREE.Vector2(1 / 640, 1 / 360),
        },
        uFogColor: { value: new THREE.Color(0x9bc4cb) },
        uFogNear: { value: 180 },
        uFogFar: { value: 1_900 },
        uCloud: { value: 0.2 },
        uTitle: { value: 0 },
      },
      vertexShader: `
        precision highp float;
        uniform float uTime;
        uniform vec2 uWaveDirection[6];
        uniform float uWaveAmplitude[6];
        uniform float uWaveNumber[6];
        uniform float uWaveFrequency[6];
        uniform float uWavePhase[6];
        uniform float uWaveSteepness[6];
        uniform mat4 uReflectionMatrix;
        varying vec3 vWorldPosition;
        varying vec4 vReflectionCoord;
        varying float vWaveHeight;
        varying float vWaveSlope;
        varying vec2 vWaveSlopeVector;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          float height = 0.0;
          vec2 slope = vec2(0.0);
          for (int i = 0; i < 6; i++) {
            float theta = uWaveNumber[i] * dot(uWaveDirection[i], world.xz)
              - uWaveFrequency[i] * uTime + uWavePhase[i];
            float secondOrderAmplitude =
              0.5 *
              uWaveSteepness[i] *
              uWaveNumber[i] *
              uWaveAmplitude[i] *
              uWaveAmplitude[i];
            height +=
              uWaveAmplitude[i] * sin(theta) +
              secondOrderAmplitude * sin(theta * 2.0);
            slope +=
              uWaveNumber[i] *
              uWaveDirection[i] *
              (
                uWaveAmplitude[i] * cos(theta) +
                2.0 *
                  secondOrderAmplitude *
                  cos(theta * 2.0)
              );
          }
          world.y += height;
          vWorldPosition = world.xyz;
          vWaveHeight = height;
          vWaveSlope = length(slope);
          vWaveSlopeVector = slope;
          vReflectionCoord = uReflectionMatrix * vec4(world.x, modelMatrix[3].y, world.z, 1.0);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uWaterDeep;
        uniform vec3 uWaterShallow;
        uniform sampler2D uReflectionTexture;
        uniform vec2 uReflectionTexel;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uCloud;
        uniform float uTitle;
        uniform vec2 uWindVector;
        uniform float uTide;
        uniform mat4 uHullWorldToLocal;
        uniform float uHullMask;
        uniform float uImportedHullMask;
        uniform vec4 uHullSections[8];
        uniform vec4 uHullWidths[8];
        uniform float uHullMaxWidth;
        uniform float uSignificantWaveHeight;
        uniform vec2 uShoalCenter[${LAKE_SHOALS.length}];
        uniform float uShoalIslandRadius[${LAKE_SHOALS.length}];
        uniform float uShoalShelfRadius[${LAKE_SHOALS.length}];
        uniform vec2 uShoalScale[${LAKE_SHOALS.length}];
        uniform float uShoalRotation[${LAKE_SHOALS.length}];
        uniform float uShoalIrregularity[${LAKE_SHOALS.length}];
        uniform float uShoalPhase[${LAKE_SHOALS.length}];
        varying vec3 vWorldPosition;
        varying vec4 vReflectionCoord;
        varying float vWaveHeight;
        varying float vWaveSlope;
        varying vec2 vWaveSlopeVector;
        float smootherstep(float edge0, float edge1, float value) {
          float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
          return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        }
        float hash21(vec2 point) {
          vec2 p = fract(point * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float valueNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 local = fract(point);
          local = local * local * (3.0 - 2.0 * local);
          return mix(
            mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
            mix(
              hash21(cell + vec2(0.0, 1.0)),
              hash21(cell + vec2(1.0, 1.0)),
              local.x
            ),
            local.y
          );
        }
        float organicRadius(float angle, float irregularity, float phase) {
          return 1.0 + irregularity * (
            0.6 * sin(angle * 3.0 + phase) +
            0.27 * sin(angle * 5.0 - phase * 0.7) +
            0.13 * sin(angle * 8.0 + phase * 1.9)
          );
        }
        float organicDistance(
          vec2 delta,
          vec2 scale,
          float rotation,
          float irregularity,
          float phase
        ) {
          float cosine = cos(rotation);
          float sine = sin(rotation);
          vec2 local = vec2(
            delta.x * cosine + delta.y * sine,
            -delta.x * sine + delta.y * cosine
          ) / scale;
          float angle = atan(local.y, local.x);
          return length(local) / organicRadius(angle, irregularity, phase);
        }
        float estimatedDepth(vec2 point) {
          float boundaryDistance = organicDistance(
            point,
            vec2(${LAKE_BASIN.radiusX.toFixed(1)}, ${LAKE_BASIN.radiusZ.toFixed(1)}),
            ${LAKE_BASIN.rotation.toFixed(4)},
            ${LAKE_BASIN.irregularity.toFixed(4)},
            ${LAKE_BASIN.phase.toFixed(4)}
          );
          float edgeProgress = 1.0 - boundaryDistance;
          float depth = 36.0 * smootherstep(0.0, 0.66, edgeProgress);
          float depthVariation = (
            2.4 * sin((point.x + 140.0) / 430.0) * cos((point.y - 80.0) / 520.0) +
            1.1 * sin((point.x - point.y) / 310.0)
          ) * smootherstep(0.08, 0.55, edgeProgress);
          depth = clamp(depth + depthVariation, 0.0, 38.0);
          for (int index = 0; index < ${LAKE_SHOALS.length}; index += 1) {
            float localShoalDistance = organicDistance(
              point - uShoalCenter[index],
              uShoalScale[index],
              uShoalRotation[index],
              uShoalIrregularity[index],
              uShoalPhase[index]
            );
            if (localShoalDistance < uShoalShelfRadius[index]) {
              float shelfDepth = 12.0 * smootherstep(
                uShoalIslandRadius[index],
                uShoalShelfRadius[index],
                localShoalDistance
              );
              float shelfBlend = 1.0 - smootherstep(
                uShoalShelfRadius[index] * 0.8,
                uShoalShelfRadius[index],
                localShoalDistance
              );
              depth = mix(depth, min(depth, shelfDepth), shelfBlend);
            }
          }
          return max(0.0, depth);
        }
        void main() {
          // Mask the actual tapered hull in its interpolated local frame.
          vec3 hull = (uHullWorldToLocal * vec4(vWorldPosition, 1.0)).xyz;
          float hullWidth;
          float hullTop;
          float hullBottom;
          if (hull.z > 2.12) {
            float t = clamp((hull.z - 2.12) / 1.03, 0.0, 1.0);
            hullWidth = mix(0.76, 0.035, t);
            hullTop = mix(0.44, 0.58, t);
            hullBottom = mix(-0.4, -0.04, t);
          } else if (hull.z > 0.35) {
            float t = (hull.z - 0.35) / 1.77;
            hullWidth = mix(1.08, 0.76, t);
            hullTop = mix(0.35, 0.44, t);
            hullBottom = mix(-0.64, -0.4, t);
          } else if (hull.z > -1.45) {
            float t = (hull.z + 1.45) / 1.8;
            hullWidth = mix(1.0, 1.08, t);
            hullTop = mix(0.4, 0.35, t);
            hullBottom = mix(-0.54, -0.64, t);
          } else {
            float t = clamp((hull.z + 2.62) / 1.17, 0.0, 1.0);
            hullWidth = mix(0.67, 1.0, t);
            hullTop = mix(0.5, 0.4, t);
            hullBottom = mix(-0.28, -0.54, t);
          }
          hullWidth *= mix(0.42, 1.0, clamp((hull.y - hullBottom) / (hullTop - hullBottom), 0.0, 1.0));
          bool insideLength = hull.z > -2.62 && hull.z < 3.15;
          if (uImportedHullMask > 0.5) {
            insideLength = hull.z > uHullSections[0].x && hull.z < uHullSections[7].x && abs(hull.x) < uHullMaxWidth;
            if (insideLength) for (int index = 0; index < 7; index++) {
              vec4 a = uHullSections[index], b = uHullSections[index + 1];
              if (hull.z >= a.x && hull.z <= b.x) {
                float t = (hull.z - a.x) / (b.x - a.x);
                hullBottom = mix(a.y, b.y, t); hullTop = mix(a.z, b.z, t);
                vec4 widths = mix(uHullWidths[index], uHullWidths[index + 1], t);
                float height = clamp((hull.y - hullBottom) / max(hullTop - hullBottom, 0.001), 0.0, 1.0) * 4.0;
                if (height < 1.0) hullWidth = widths.x * height;
                else if (height < 2.0) hullWidth = mix(widths.x, widths.y, height - 1.0);
                else if (height < 3.0) hullWidth = mix(widths.y, widths.z, height - 2.0);
                else hullWidth = mix(widths.z, widths.w, height - 3.0);
              }
            }
          }
          if (uHullMask > 0.5 && insideLength &&
              abs(hull.x) < hullWidth * 0.97 && hull.y > hullBottom && hull.y < hullTop) discard;

          vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
          if (faceNormal.y < 0.0) faceNormal = -faceNormal;
          float windSpeed = length(uWindVector);
          vec2 wind = windSpeed > 0.001 ? uWindVector / windSpeed : vec2(1.0, 0.0);
          vec2 across = vec2(-wind.y, wind.x);
          float alongWind = dot(vWorldPosition.xz, wind);
          float acrossWind = dot(vWorldPosition.xz, across);
          float distanceToSurface = length(cameraPosition - vWorldPosition);
          float detailFade = 1.0 - smoothstep(60.0, 340.0, distanceToSurface);
          // Capillary normals respond to wind; displacement remains the CPU wave model.
          float microScale = (0.07 + smoothstep(0.2, 10.0, windSpeed) * 0.17) * detailFade;
          float rippleA = alongWind * 3.6 + valueNoise(vec2(alongWind * 0.36, acrossWind * 0.7)) * 8.0 - uTime * 4.1;
          float rippleB = alongWind * 6.4 + acrossWind * 1.3 - uTime * 5.6;
          vec2 microSlope = microScale * (
            wind * cos(rippleA) + (wind * 0.42 + across * 0.24) * cos(rippleB) +
            (wind * 0.42 - across * 0.18) * cos(alongWind * 1.7 - acrossWind * 0.63 - uTime * 2.8)
          );
          vec2 composedSlope = vWaveSlopeVector + microSlope;
          vec3 smoothNormal = normalize(vec3(-composedSlope.x, 1.0, -composedSlope.y));
          vec3 normal = normalize(mix(smoothNormal, faceNormal, 0.08 + uTitle * 0.08));
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
          float fresnel = pow(1.0 - facing, 3.0);
          float diffuse = clamp(dot(normal, uSunDirection), 0.0, 1.0);
          float waterDepth = max(0.0, estimatedDepth(vWorldPosition.xz) + uTide);
          float depthMix = smoothstep(1.5, 22.0, waterDepth);
          vec3 color = mix(uWaterShallow, uWaterDeep, depthMix);
          float facet = dot(microSlope, wind) + dot(vWaveSlopeVector, wind) * 0.15;
          color *= 0.9 + diffuse * 0.16 + facet * 0.18;
          vec3 depthTint = mix(vec3(0.86, 0.92, 1.0), vec3(0.7, 0.82, 1.0), depthMix);
          color *= depthTint;
          color = mix(color, uSkyColor, 0.006 + fresnel * 0.03);

          // Project onto the mean tide plane. Wave normals break real reflected silhouettes.
          vec2 reflectionUv = vReflectionCoord.xy / max(vReflectionCoord.w, 0.0001);
          reflectionUv += normal.xz * (0.012 + fresnel * 0.02);
          float reflectionValid = step(0.0, vReflectionCoord.w) *
            smoothstep(0.0, 0.025, reflectionUv.x) * (1.0 - smoothstep(0.975, 1.0, reflectionUv.x)) *
            smoothstep(0.0, 0.025, reflectionUv.y) * (1.0 - smoothstep(0.975, 1.0, reflectionUv.y));
          reflectionUv = clamp(reflectionUv, vec2(0.002), vec2(0.998));
          vec3 sceneReflection = texture2D(uReflectionTexture, reflectionUv).rgb;
          float reflectionBreak = valueNoise(vec2(alongWind * 2.2 - uTime * 0.36, acrossWind * 1.45));
          float reflectingFacet = smoothstep(0.34, 0.66, reflectionBreak) *
            smoothstep(-0.42, 0.72, cos(rippleA) + cos(rippleB) * 0.35);
          reflectingFacet = mix(0.38, reflectingFacet, detailFade * smoothstep(0.2, 6.0, windSpeed));
          float reflectionStrength = (0.08 + fresnel * 0.3) *
            mix(0.2, 1.0, reflectingFacet) * reflectionValid;
          color = mix(color, sceneReflection, reflectionStrength);

          // Warm highlights come only from the actual light and surface normal.
          vec3 halfDirection = normalize(uSunDirection + viewDirection);
          float sunAlignment = max(dot(normal, halfDirection), 0.0);
          float sunLight = (1.0 - uCloud * 0.85) * smoothstep(-0.02, 0.15, uSunDirection.y);
          float broadGlint = pow(sunAlignment, 96.0) * 0.1;
          float fineGlint = pow(sunAlignment, 420.0) * 1.2;
          color += uSunColor * (broadGlint + fineGlint) * sunLight;
          float roughWater = smoothstep(
            0.75,
            2.2,
            uSignificantWaveHeight
          );
          float crest = smoothstep(
            uSignificantWaveHeight * 0.28,
            max(uSignificantWaveHeight * 0.62, 0.08),
            vWaveHeight
          );
          float crestFoam =
            roughWater *
            crest *
            smoothstep(0.12, 0.42, vWaveSlope) *
            smoothstep(
              0.38,
              0.78,
              valueNoise(vWorldPosition.xz * 0.19 + vec2(uTime * 0.04))
            );
          color = mix(
            color,
            vec3(0.82, 0.9, 0.88),
            crestFoam * 0.34
          );
          float shoreBand = 1.0 - smoothstep(0.38, 3.4, waterDepth);
          float shorePulse = 0.5 + 0.5 * sin(
            waterDepth * 4.8 -
            uTime * 1.7 +
            valueNoise(vWorldPosition.xz * 0.115) * 8.0
          );
          float shoreBreak = smoothstep(0.5, 0.86, shorePulse) *
            smoothstep(
              0.3,
              0.72,
              valueNoise(vWorldPosition.xz * 0.24 + vec2(uTime * 0.025))
            );
          float shoreFoam = shoreBand * (0.18 + shoreBreak * 0.82);
          color = mix(
            color,
            vec3(0.8, 0.9, 0.87),
            shoreFoam * 0.48
          );
          float subsurface = pow(max(dot(viewDirection, -uSunDirection), 0.0), 3.0) *
            (1.0 - fresnel) *
            (1.0 - depthMix);
          color += vec3(0.08, 0.24, 0.2) * subsurface * (1.0 - uCloud * 0.5);
          float distanceToCamera = length(cameraPosition - vWorldPosition);
          float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
          float shallowClarity = 1.0 - smoothstep(1.5, 14.0, waterDepth);
          float waterAlpha = mix(0.96, 0.88, shallowClarity);
          waterAlpha = mix(waterAlpha, 0.98, shoreFoam);
          waterAlpha = mix(waterAlpha, 0.98, fresnel);
          waterAlpha = mix(waterAlpha, 1.0, fog);
          gl_FragColor = vec4(mix(color, uFogColor, fog), waterAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Wind-rippled Mediterranean water";
    mesh.frustumCulled = false;
    return mesh;
  }


/** The hull matrix must include interpolated heel, pitch, scale and tide. */
export function updateWaterSurface(
  water: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
  weather: WeatherSnapshot,
  x: number,
  z: number,
  hullWorldMatrix: THREE.Matrix4,
): void {
  water.position.set(Math.round(x / 20) * 20, weather.tideLevel, Math.round(z / 20) * 20);
  const uniforms = water.material.uniforms;
  uniforms.uTime!.value = weather.time;
  uniforms.uCloud!.value = weather.cloud;
  uniforms.uTide!.value = weather.tideLevel;
  uniforms.uWindVector!.value.set(weather.trueWind.x, weather.trueWind.y);
  uniforms.uHullWorldToLocal!.value.copy(hullWorldMatrix).invert();
  uniforms.uHullMask!.value = 1;
  if (water.userData.waveReference !== weather.waves) {
    water.userData.waveReference = weather.waves;
    const arrays = waveShaderArrays(weather.waves);
    uniforms.uWaveDirection!.value = arrays.directions;
    uniforms.uWaveAmplitude!.value = arrays.amplitudes;
    uniforms.uWaveNumber!.value = arrays.waveNumbers;
    uniforms.uWaveFrequency!.value = arrays.angularFrequencies;
    uniforms.uWavePhase!.value = arrays.phases;
    uniforms.uWaveSteepness!.value = arrays.steepnesses;
    uniforms.uSignificantWaveHeight!.value = significantWaveHeight(weather.waves);
  }
}
function createAdaptiveWaterGeometry(
  size: number,
  segments: number,
  exponent: number,
): THREE.BufferGeometry {
  const positions = new Float32Array(
    (segments + 1) * (segments + 1) * 3,
  );
  const uvs = new Float32Array(
    (segments + 1) * (segments + 1) * 2,
  );
  const indices: number[] = [];
  const halfSize = size / 2;
  const mapAxis = (normalized: number) =>
    Math.sign(normalized) *
    Math.pow(Math.abs(normalized), exponent) *
    halfSize;

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const z = mapAxis(v * 2 - 1);
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const x = mapAxis(u * 2 - 1);
      const vertex = row * (segments + 1) + column;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = 0;
      positions[vertex * 3 + 2] = z;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      if ((row + column) % 2 === 0) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, c, d, a, d, b);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.BufferAttribute(uvs, 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

