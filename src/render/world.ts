import * as THREE from "three";
import { incidentBoatPose } from "./incident-pose";
import type { IncidentResult } from "../game/hazards";
import {
  FAIR_WINDS_WORLD,
  navigationObjects,
  type WorldObject,
} from "../game/world-definition";
import {
  LAKE_BASIN,
  LAKE_SHOALS,
  lakeShoalFor,
} from "../game/bathymetry";
import { landmarkGroundHeight } from "./landmark-grounding";
import type { BoatState, SailDiagnostics } from "../sim/model";
import {
  HARBOR_20,
  getSailDefinition,
  type BoatDefinition,
} from "../sim/boats";
import {
  sampleWaves,
  significantWaveHeight,
  waveShaderArrays,
} from "../weather/waves";
import type { WeatherSnapshot } from "../weather/types";
import { LakeScenery } from "./scenery";
import { AmbientLife } from "./ambient-life";
import {
  HULL_CONTACT_BOW_Z,
  HULL_CONTACT_STERN_Z,
  INTERIOR_FLOOR_BOW_Z,
  hullContactWidthAt,
} from "./hull-water-mask";
import { buoyVisualSpec } from "./buoy-visual";
import { wakeSurfacePoints } from "./wake-surface";

export interface Landmark {
  name: string;
  x: number;
  z: number;
  description: string;
}

export const LANDMARKS: readonly Landmark[] = [
  ...navigationObjects(FAIR_WINDS_WORLD).map((object) => ({
    name: object.name,
    x: object.x,
    z: object.z,
    description: object.navigation!.description,
  })),
];

export interface IncidentPresentation {
  result: IncidentResult;
  elapsed: number;
}

interface SailMaterial extends THREE.ShaderMaterial {
  uniforms: {
    uTime: { value: number };
    uLuff: { value: number };
    uStall: { value: number };
    uAttached: { value: number };
    uClothColor: { value: THREE.Color };
  };
}

export class SailingWorld {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 3_500);
  private readonly scenery = new LakeScenery();
  private readonly ambientLife = new AmbientLife();
  private readonly hemisphere = new THREE.HemisphereLight(
    0xd9edf0,
    0x5e715f,
    2.15,
  );
  private readonly sun = new THREE.DirectionalLight(0xfff1cf, 2.5);
  private readonly titleFill = new THREE.DirectionalLight(0xffcfad, 0);
  private readonly reflectionCamera =
    new THREE.PerspectiveCamera();
  private readonly reflectionTarget = new THREE.WebGLRenderTarget(
    640,
    360,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    },
  );
  private readonly reflectionMatrix = new THREE.Matrix4();
  private readonly reflectionClipPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -0.02,
  );
  private readonly reflectionClippingPlanes = [this.reflectionClipPlane];
  private readonly reflectionViewDirection = new THREE.Vector3();
  private readonly reflectedCameraPosition = new THREE.Vector3();
  private readonly reflectedCameraTarget = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly cameraLookAt = new THREE.Vector3();
  private readonly water: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  private readonly boatRoot = new THREE.Group();
  private readonly hullPose = new THREE.Group();
  private readonly rigPose = new THREE.Group();
  private readonly boomPivot = new THREE.Group();
  private readonly headsailPivot = new THREE.Group();
  private readonly rudderPivot = new THREE.Group();
  private readonly starterDinghyDetails = new THREE.Group();
  private readonly cruiserDetails = new THREE.Group();
  private readonly sailMaterial: SailMaterial;
  private hullMaterial!: THREE.MeshStandardMaterial;
  private mainsail!: THREE.Mesh;
  private headsail!: THREE.Mesh;
  private headsailMaterial!: SailMaterial;
  private readonly telltales: THREE.Line[] = [];
  private readonly wakeLines: [THREE.Line, THREE.Line];
  private readonly wakeFoam: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly hullContactFoam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly wakeTracks: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  private readonly windLines: THREE.LineSegments;
  private readonly windSeeds: Float32Array;
  private readonly rain: THREE.Points;
  private readonly rainSeeds: Float32Array;
  private readonly clouds = new THREE.Group();
  private waveReference?: WeatherSnapshot["waves"];
  private readonly wakeCenter = new THREE.Vector3();
  private readonly lastWakeCenter = new THREE.Vector3();
  private hasLastWakeCenter = false;
  private cameraInitialized = false;
  private activeBoat: BoatDefinition = HARBOR_20;
  private renderClock = 0;
  private lastReflectionAt = Number.NEGATIVE_INFINITY;
  private lastAtmosphereAt = Number.NEGATIVE_INFINITY;
  private reflectionInterval = 1 / 30;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.localClippingEnabled = true;
    this.reflectionTarget.texture.generateMipmaps = false;
    this.scene.background = new THREE.Color(0x9bc4cb);
    this.scene.fog = new THREE.Fog(0x9bc4cb, 180, 1_050);

    this.scene.add(this.hemisphere);
    this.sun.position.set(-80, 110, -40);
    this.scene.add(this.sun);
    this.scene.add(this.titleFill);
    this.titleFill.target = this.boatRoot;
    this.scene.add(this.scenery.root);
    this.scene.add(this.ambientLife.root);

    this.water = this.createWater();
    this.scene.add(this.water);
    this.sailMaterial = this.createBoat();
    this.scene.add(this.boatRoot);
    this.wakeLines = [this.createWakeLine(), this.createWakeLine()];
    this.wakeFoam = this.createWakeFoam();
    this.hullContactFoam = this.createHullContactFoam();
    this.scene.add(...this.wakeLines, this.wakeFoam, this.hullContactFoam);
    [this.windLines, this.windSeeds] = this.createWindLines();
    this.scene.add(this.windLines);
    [this.rain, this.rainSeeds] = this.createRain();
    this.scene.add(this.rain);
    this.createLandmarks();
    this.createClouds();
    this.scene.add(this.clouds);

    this.camera.position.set(0, 8.5, -14);
    this.camera.lookAt(0, 1.5, 5);
  }

  resize(width = window.innerWidth, height = window.innerHeight): void {
    const compact = width <= 760;
    const lowCoreDevice =
      navigator.hardwareConcurrency > 0 &&
      navigator.hardwareConcurrency <= 4;
    const pixelRatioCap = compact ? 1.4 : lowCoreDevice ? 1.5 : 1.65;
    const pixelRatio = Math.min(window.devicePixelRatio, pixelRatioCap);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = Math.max(width / Math.max(height, 1), 0.2);
    this.camera.updateProjectionMatrix();
    const reflectionScale = compact ? 0.34 : 0.4;
    const reflectionWidth = Math.min(
        Math.max(
          Math.round(width * pixelRatio * reflectionScale),
          320,
        ),
        compact ? 576 : 768,
      );
    const reflectionHeight = Math.min(
        Math.max(
          Math.round(height * pixelRatio * reflectionScale),
          180,
        ),
        compact ? 324 : 432,
      );
    this.reflectionTarget.setSize(
      reflectionWidth,
      reflectionHeight,
    );
    this.water.material.uniforms.uReflectionTexel!.value.set(
      1 / reflectionWidth,
      1 / reflectionHeight,
    );
    this.reflectionInterval = 1 / (compact ? 18 : 24);
    this.lastReflectionAt = Number.NEGATIVE_INFINITY;
  }

  resetCamera(): void {
    this.cameraInitialized = false;
    this.lastReflectionAt = Number.NEGATIVE_INFINITY;
  }

  resetWake(): void {
    this.wakeTracks[0].length = 0;
    this.wakeTracks[1].length = 0;
    this.hasLastWakeCenter = false;
    for (const line of this.wakeLines) {
      line.geometry.setDrawRange(0, 0);
    }
    this.wakeFoam.visible = false;
  }

  setBoat(boat: BoatDefinition): void {
    this.activeBoat = boat;
    this.hullMaterial.color.setHex(boat.visual.playerHullColor);
    this.sailMaterial.uniforms.uClothColor.value.setHex(boat.visual.playerSailColor);
    this.headsailMaterial.uniforms.uClothColor.value.setHex(boat.visual.playerSailColor);
    const scale = boat.hull.length / HARBOR_20.hull.length;
    this.boatRoot.scale.setScalar(scale);
    const isStarterDinghy = boat.id === HARBOR_20.id;
    this.rigPose.position.z = boat.visual.rigForwardOffset;
    this.starterDinghyDetails.visible = isStarterDinghy;
    this.cruiserDetails.visible = !isStarterDinghy;
    this.headsailPivot.visible = Boolean(
      getSailDefinition(boat, "headsail"),
    );
    this.resetWake();
  }

  render(
    previous: BoatState,
    current: BoatState,
    sail: SailDiagnostics,
    headsail: SailDiagnostics | undefined,
    weather: WeatherSnapshot,
    alpha: number,
    frameDt: number,
    incident?: IncidentPresentation,
    titleScreen = false,
    presentationTime = 0,
  ): void {
    this.renderClock += frameDt;
    const x = lerp(previous.position.x, current.position.x, alpha);
    const z = lerp(previous.position.y, current.position.y, alpha);
    const heading = lerpAngle(previous.heading, current.heading, alpha);
    const heave = lerp(previous.heave, current.heave, alpha);
    const heel = lerp(previous.heel + previous.waveRoll, current.heel + current.waveRoll, alpha);
    const pitch = lerp(previous.wavePitch, current.wavePitch, alpha);
    const boomAngle = lerpAngle(previous.boomAngle, current.boomAngle, alpha);
    const rudderAngle = lerp(previous.rudderAngle, current.rudderAngle, alpha);
    const sailDeployment = lerp(
      previous.sailDeployment,
      current.sailDeployment,
      alpha,
    );

    this.boatRoot.position.set(x, heave + weather.tideLevel, z);
    this.boatRoot.rotation.y = heading;
    this.hullPose.rotation.x = pitch;
    const incidentProgress = incident
      ? THREE.MathUtils.smoothstep(incident.elapsed, 0.15, 2.2)
      : 0;
    const impactDirection = incident
      ? Math.sign(
          (incident.result.point.x - x) * Math.cos(heading) -
            (incident.result.point.z - z) * Math.sin(heading),
        ) || current.sailSide
      : current.sailSide;
    const incidentPose = incidentBoatPose(
      incident?.result.severity ?? "none",
      impactDirection,
      incidentProgress,
      heel,
    );
    this.hullPose.rotation.z = incidentPose.hullRoll;
    this.rigPose.rotation.z = incidentPose.rigRoll;
    this.rigPose.rotation.x = incidentPose.rigPitch;
    this.boomPivot.rotation.y = -boomAngle;
    this.rudderPivot.rotation.y = -rudderAngle;
    this.sailMaterial.uniforms.uTime.value = weather.time;
    this.sailMaterial.uniforms.uLuff.value = sail.luff;
    this.sailMaterial.uniforms.uStall.value = sail.stall;
    this.sailMaterial.uniforms.uAttached.value = sail.attached;
    const sailHeightScale = sailDeployment <= 0.015
      ? 0.025
      : 0.025 + Math.sqrt(sailDeployment) * 0.975;
    const sailChordScale = sailDeployment <= 0.015
      ? 1
      : THREE.MathUtils.clamp(sailDeployment / sailHeightScale, 0.65, 1);
    this.mainsail.scale.set(1, sailHeightScale, sailChordScale);
    this.headsail.scale.set(1, sailHeightScale, sailChordScale);
    this.headsailPivot.rotation.y = -current.headsailAngle;
    this.headsailPivot.visible = Boolean(headsail) && sailDeployment > 0.025;
    if (headsail) {
      this.headsailMaterial.uniforms.uTime.value = weather.time;
      this.headsailMaterial.uniforms.uLuff.value = headsail.luff;
      this.headsailMaterial.uniforms.uStall.value = headsail.stall;
      this.headsailMaterial.uniforms.uAttached.value =
        headsail.attached;
    }
    this.updateTelltales(
      sail,
      weather.time,
      sailDeployment,
      sailHeightScale,
      sailChordScale,
    );
    this.updateWater(weather, x, z, heading);
    this.updateHullContactFoam(current, weather, x, z, heading);
    this.updateWake(current, weather);
    this.ambientLife.update(weather.time, current, weather.trueWind);
    this.updateWind(weather, current, x, z);
    this.updateRain(weather, x, z);
    this.updateCamera(
      x,
      z,
      heading,
      heave,
      frameDt,
      incident,
      titleScreen,
      presentationTime,
    );
    const sunHeight = Math.sin(((weather.timeOfDay - 6) / 12) * Math.PI);
    const nightFill = 1 - THREE.MathUtils.smoothstep(sunHeight, -0.08, 0.2);
    this.titleFill.visible = titleScreen || nightFill > 0.02;
    this.titleFill.color.set(titleScreen ? 0xffcfad : 0xb9d7ee);
    this.titleFill.intensity = titleScreen
      ? 1.2
      : nightFill * (0.68 - weather.cloud * 0.14);
    this.titleFill.position.set(
      this.camera.position.x,
      this.camera.position.y + 38,
      this.camera.position.z,
    );
    if (this.renderClock - this.lastAtmosphereAt >= 1 / 15) {
      this.updateAtmosphere(weather);
      this.lastAtmosphereAt = this.renderClock;
    }
    if (this.renderClock - this.lastReflectionAt >= this.reflectionInterval) {
      this.updateReflection();
      this.lastReflectionAt = this.renderClock;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private createWater(): THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  > {
    const geometry = createAdaptiveWaterGeometry(
      4_200,
      window.innerWidth <= 760 ? 168 : 220,
      1.55,
    );
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
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
          value: this.reflectionTarget.texture,
        },
        uReflectionMatrix: {
          value: this.reflectionMatrix,
        },
        uReflectionTexel: {
          value: new THREE.Vector2(1 / 640, 1 / 360),
        },
        uFogColor: { value: new THREE.Color(0x9bc4cb) },
        uFogNear: { value: 180 },
        uFogFar: { value: 1_900 },
        uCloud: { value: 0.2 },
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
          vReflectionCoord = uReflectionMatrix * world;
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
              depth = min(depth, shelfDepth);
            }
          }
          return max(0.0, depth);
        }
        void main() {
          vec3 dx = dFdx(vWorldPosition);
          vec3 dy = dFdy(vWorldPosition);
          vec3 faceNormal = normalize(cross(dx, dy));
          if (faceNormal.y < 0.0) faceNormal = -faceNormal;
          float microScale =
            0.006 + min(uSignificantWaveHeight, 1.5) * 0.005;
          vec2 microSlope =
            vec2(0.94, 0.31) *
              cos(dot(vWorldPosition.xz, vec2(0.94, 0.31)) - uTime * 2.4) *
              microScale +
            vec2(-0.37, 1.17) *
              cos(dot(vWorldPosition.xz, vec2(-0.37, 1.17)) + uTime * 1.7) *
              microScale * 0.68 +
            vec2(0.23, 2.05) *
              cos(dot(vWorldPosition.xz, vec2(0.23, 2.05)) - uTime * 2.9) *
              microScale * 0.34;
          vec2 composedSlope = vWaveSlopeVector + microSlope;
          vec3 smoothNormal = normalize(
            vec3(
              -composedSlope.x,
              1.0,
              -composedSlope.y
            )
          );
          vec3 normal = normalize(
            mix(smoothNormal, faceNormal, 0.045)
          );
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
          float fresnel = pow(1.0 - facing, 3.05);
          float diffuse = clamp(dot(normal, uSunDirection), 0.0, 1.0);
          vec3 reflected = reflect(-uSunDirection, normal);
          float sparkle = pow(max(dot(reflected, viewDirection), 0.0), 118.0)
            * (1.0 - uCloud * 0.72);
          float waterDepth = estimatedDepth(vWorldPosition.xz);
          float depthMix = smoothstep(2.0, 23.0, waterDepth);
          vec3 color = mix(uWaterShallow, uWaterDeep, depthMix);
          float faceVariation = dot(normal.xz, normalize(vec2(0.66, 0.34)));
          color *= 0.97 + diffuse * 0.18 + faceVariation * 0.012;
          color = mix(
            color,
            uSkyColor,
            0.055 + fresnel * (0.48 - uCloud * 0.12)
          );
          float ribbonA = 0.5 + 0.5 * sin(
            dot(vWorldPosition.xz, vec2(0.16, 1.08)) - uTime * 1.1
          );
          float ribbonB = 0.5 + 0.5 * sin(
            dot(vWorldPosition.xz, vec2(-0.23, 1.72)) + uTime * 0.82
          );
          float ribbonBreak = valueNoise(
            vWorldPosition.xz * vec2(0.075, 0.19) + vec2(uTime * 0.025, 0.0)
          );
          float rippleRibbon = smoothstep(
            0.72,
            0.96,
            ribbonA * 0.48 + ribbonB * 0.26 + ribbonBreak * 0.26
          );
          vec3 rippleColor = mix(uSkyColor, uSunColor, 0.28);
          color += rippleColor * rippleRibbon * (0.025 + diffuse * 0.055);
          vec2 reflectionUv =
            vReflectionCoord.xy / max(vReflectionCoord.w, 0.0001);
          reflectionUv += normal.xz *
            (0.018 + fresnel * 0.045);
          reflectionUv = clamp(
            reflectionUv,
            vec2(0.006),
            vec2(0.994)
          );
          vec2 reflectionBlur =
            uReflectionTexel * (1.4 + fresnel * 2.6);
          vec3 sceneReflection = texture2D(
            uReflectionTexture,
            reflectionUv
          ).rgb * 0.36;
          sceneReflection += texture2D(
            uReflectionTexture,
            reflectionUv + vec2(reflectionBlur.x, 0.0)
          ).rgb * 0.16;
          sceneReflection += texture2D(
            uReflectionTexture,
            reflectionUv - vec2(reflectionBlur.x, 0.0)
          ).rgb * 0.16;
          sceneReflection += texture2D(
            uReflectionTexture,
            reflectionUv + vec2(0.0, reflectionBlur.y)
          ).rgb * 0.16;
          sceneReflection += texture2D(
            uReflectionTexture,
            reflectionUv - vec2(0.0, reflectionBlur.y)
          ).rgb * 0.16;
          float reflectionStrength =
            (0.035 + fresnel * 0.42) *
            (1.0 - uCloud * 0.12);
          color = mix(
            color,
            sceneReflection,
            clamp(reflectionStrength, 0.0, 0.48)
          );
          vec2 surfaceOffset = vWorldPosition.xz - cameraPosition.xz;
          vec2 sunAcrossWater = normalize(uSunDirection.xz);
          vec2 sunTangent = vec2(-sunAcrossWater.y, sunAcrossWater.x);
          float distanceAlongSun = dot(surfaceOffset, sunAcrossWater);
          float distanceAcrossSun = abs(dot(surfaceOffset, sunTangent));
          float bridgeWidth =
            3.0 + 22.0 / (1.0 + max(distanceAlongSun, 0.0) * 0.025);
          float sunPath =
            (1.0 - smoothstep(0.0, bridgeWidth, distanceAcrossSun)) *
            smoothstep(2.0, 18.0, distanceAlongSun);
          float lowSun =
            1.0 - smoothstep(0.22, 0.58, uSunDirection.y);
          sunPath *= lowSun;
          float bridgeWarp = valueNoise(
            vec2(distanceAcrossSun * 0.16, distanceAlongSun * 0.07) +
            vec2(uTime * 0.03, -uTime * 0.02)
          );
          float rippleBand = 0.5 + 0.5 * sin(
            distanceAlongSun * 1.12 +
            bridgeWarp * 7.2 +
            sin(
              distanceAcrossSun * 0.68 -
              distanceAlongSun * 0.17 +
              uTime * 1.35
            ) * 1.45 -
            uTime * 2.1
          );
          float crossBreak = valueNoise(
            vec2(
              distanceAcrossSun * 0.48 + uTime * 0.09,
              distanceAlongSun * 0.21 - uTime * 0.13
            )
          );
          float shimmer = smoothstep(
            0.58,
            0.88,
            rippleBand * 0.58 + crossBreak * 0.42
          );
          float slopeGlint = smoothstep(
            0.006,
            0.11,
            vWaveSlope + length(microSlope) * 1.8
          );
          sunPath *=
            (0.08 + shimmer * 0.92) *
            (0.36 + slopeGlint * 0.64);
          color += uSunColor * sparkle * 1.35;
          color += uSunColor * sunPath * (1.0 - uCloud * 0.72) * 0.72;
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
            smoothstep(0.12, 0.42, vWaveSlope);
          color = mix(
            color,
            vec3(0.82, 0.9, 0.88),
            crestFoam * 0.34
          );
          float distanceToCamera = length(cameraPosition - vWorldPosition);
          float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
          float shallowClarity = 1.0 - smoothstep(1.5, 14.0, waterDepth);
          float waterAlpha = mix(0.94, 0.76, shallowClarity);
          waterAlpha = mix(waterAlpha, 0.98, fresnel);
          waterAlpha = mix(waterAlpha, 1.0, fog);
          gl_FragColor = vec4(mix(color, uFogColor, fog), waterAlpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private createBoat(): SailMaterial {
    this.boatRoot.add(this.hullPose);
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0eee8,
      roughness: 0.7,
      metalness: 0,
      flatShading: true,
    });
    this.hullMaterial = hullMaterial;
    const hull = new THREE.Mesh(createHullGeometry(), hullMaterial);
    this.hullPose.add(hull);

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x9b5f32,
      emissive: 0x241208,
      emissiveIntensity: 0.08,
      roughness: 0.72,
      flatShading: true,
    });
    const darkWoodMaterial = new THREE.MeshStandardMaterial({
      color: 0x704326,
      emissive: 0x1a0d06,
      emissiveIntensity: 0.08,
      roughness: 0.8,
      flatShading: true,
    });
    const lapMaterial = new THREE.MeshStandardMaterial({
      color: 0xc7c5be,
      roughness: 0.82,
      flatShading: true,
    });
    for (const side of [-1, 1]) {
      const gunwale = new THREE.Mesh(
        new THREE.TubeGeometry(createHullRailCurve(side, 0), 38, 0.055, 6, false),
        woodMaterial,
      );
      this.hullPose.add(gunwale);
      for (const level of [0.3, 0.52, 0.73]) {
        const strake = new THREE.Mesh(
          new THREE.TubeGeometry(
            createHullRailCurve(side, level),
            34,
            0.018,
            5,
            false,
          ),
          lapMaterial,
        );
        this.hullPose.add(strake);
      }
    }

    this.hullPose.add(this.starterDinghyDetails, this.cruiserDetails);

    const dinghyFloor = new THREE.Mesh(
      createInteriorFloorGeometry(),
      darkWoodMaterial,
    );
    dinghyFloor.position.y = 0.11;
    this.starterDinghyDetails.add(dinghyFloor);
    for (const x of [-0.38, 0, 0.38]) {
      const floorboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.055, 3.65),
        woodMaterial,
      );
      floorboard.position.set(x, 0.18, -0.28);
      this.starterDinghyDetails.add(floorboard);
    }
    const benchPlans = [
      { z: 1.42, width: 1.48 },
      { z: 0.18, width: 1.86 },
      { z: -1.18, width: 1.72 },
    ];
    for (const benchPlan of benchPlans) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(benchPlan.width, 0.13, 0.42),
        woodMaterial,
      );
      bench.position.set(0, 0.46, benchPlan.z);
      this.starterDinghyDetails.add(bench);
    }
    const transomCap = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.09, 0.12),
      woodMaterial,
    );
    transomCap.position.set(0, 0.54, -2.57);
    this.starterDinghyDetails.add(transomCap);
    const centerboardCase = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.3, 1.55),
      darkWoodMaterial,
    );
    centerboardCase.position.set(0, 0.34, -0.35);
    this.starterDinghyDetails.add(centerboardCase);
    const centerboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.12, 1.08),
      darkWoodMaterial,
    );
    centerboard.position.set(0, -0.68, -0.28);
    this.starterDinghyDetails.add(centerboard);
    for (const side of [-1, 1]) {
      const innerRail = new THREE.Mesh(
        new THREE.TubeGeometry(
          createHullRailCurve(side, 0.09, 0.86),
          34,
          0.035,
          6,
          false,
        ),
        darkWoodMaterial,
      );
      this.starterDinghyDetails.add(innerRail);
    }

    const deck = new THREE.Mesh(
      createDeckGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.8, flatShading: true }),
    );
    deck.position.y = 0.02;
    this.cruiserDetails.add(deck);
    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.1, 1.62),
      new THREE.MeshStandardMaterial({ color: 0x292e2d, roughness: 0.88 }),
    );
    cockpit.position.set(0, 0.42, -1.08);
    this.cruiserDetails.add(cockpit);
    for (const x of [-0.63, 0.63]) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 1.9),
        woodMaterial,
      );
      bench.position.set(x, 0.52, -0.98);
      this.cruiserDetails.add(bench);
    }
    const cabinTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.3, 1.05),
      new THREE.MeshStandardMaterial({
        color: 0xe0d4bb,
        roughness: 0.74,
        flatShading: true,
      }),
    );
    cabinTop.position.set(0, 0.55, 0.54);
    this.cruiserDetails.add(cabinTop);

    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x263d42, roughness: 0.72 });
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.45, 1.95), darkMaterial);
    keel.position.set(0, -1.08, -0.15);
    this.cruiserDetails.add(keel);
    this.rudderPivot.position.set(0, -0.1, -2.55);
    const rudderStock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.075, 1.08, 8),
      darkMaterial,
    );
    rudderStock.position.set(0, 0.15, 0);
    this.rudderPivot.add(rudderStock);
    const rudder = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.18, 0.72),
      darkWoodMaterial,
    );
    rudder.position.set(0, -0.55, -0.26);
    this.rudderPivot.add(rudder);
    const tiller = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.64, -0.02),
          new THREE.Vector3(0, 0.76, 0.42),
          new THREE.Vector3(0, 0.82, 1.2),
          new THREE.Vector3(0, 0.78, 1.72),
        ], false, "centripetal"),
        18,
        0.055,
        7,
        false,
      ),
      woodMaterial,
    );
    this.rudderPivot.add(tiller);
    this.hullPose.add(this.rudderPivot);

    const mastMaterial = new THREE.MeshStandardMaterial({
      color: 0x965a2e,
      emissive: 0x241207,
      emissiveIntensity: 0.08,
      roughness: 0.58,
      flatShading: true,
    });
    const mastTop = 6.975;
    const mastStep = -0.62;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.082, mastTop - mastStep, 8),
      mastMaterial,
    );
    mast.position.set(0, (mastTop + mastStep) * 0.5, 0.72);
    this.rigPose.add(mast);
    this.boomPivot.position.set(0, 1.03, 0.72);
    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.078, 3.55, 8),
      mastMaterial,
    );
    boom.rotation.x = Math.PI / 2;
    boom.position.z = -1.72;
    this.boomPivot.add(boom);
    this.rigPose.add(this.boomPivot);

    const sailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLuff: { value: 0 },
        uStall: { value: 0 },
        uAttached: { value: 1 },
        uClothColor: { value: new THREE.Color(0xf5f2e9) },
      },
      side: THREE.DoubleSide,
      transparent: true,
      vertexShader: `
        precision highp float;
        uniform float uTime;
        uniform float uLuff;
        uniform float uStall;
        varying vec2 vUv;
        varying float vShade;
        void main() {
          vUv = uv;
          vec3 displaced = position;
          float edge = uv.x * (1.0 - uv.y * 0.72);
          float flutter = sin(uTime * 18.0 + uv.y * 17.0 + uv.x * 9.0)
            + sin(uTime * 11.0 - uv.y * 25.0) * 0.45;
          displaced.x += sin(uv.x * 3.14159) * 0.10 * (1.0 - uStall * 0.55);
          displaced.x += flutter * uLuff * edge * 0.19;
          displaced.y -= uStall * uv.x * 0.08;
          vShade = displaced.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uLuff;
        uniform float uStall;
          uniform float uAttached;
          uniform vec3 uClothColor;
        varying vec2 vUv;
        varying float vShade;
        void main() {
          vec3 cloth = uClothColor;
          cloth = mix(cloth, vec3(0.86, 0.63, 0.39), uStall * 0.22);
          cloth += vShade * 0.34;
          float seam = smoothstep(0.965, 0.99, fract(vUv.y * 5.0));
          cloth -= seam * 0.035;
          gl_FragColor = vec4(cloth, 0.93 + uAttached * 0.05 - uLuff * 0.04);
        }
      `,
    }) as SailMaterial;
    this.mainsail = new THREE.Mesh(createSailGeometry(), sailMaterial);
    this.mainsail.position.y = 0.06;
    this.boomPivot.add(this.mainsail);
    this.createTelltales();

    this.headsailMaterial = sailMaterial.clone() as SailMaterial;
    this.headsailPivot.position.set(0, 0.7, 0.55);
    this.headsail = new THREE.Mesh(
      createHeadsailGeometry(),
      this.headsailMaterial,
    );
    this.headsailPivot.add(this.headsail);
    this.headsailPivot.visible = false;
    this.rigPose.add(this.headsailPivot);

    const pennant = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.52, 3),
      new THREE.MeshBasicMaterial({ color: 0xd79a4a }),
    );
    pennant.rotation.z = -Math.PI / 2;
    pennant.position.set(-0.25, 7.46, 0.72);
    this.rigPose.add(pennant);
    this.hullPose.add(this.rigPose);
    return sailMaterial;
  }

  private createTelltales(): void {
    const colors = [0xd94f3d, 0x5caa8b, 0xd94f3d];
    const placements = [
      { y: 2.15, z: -1.45 },
      { y: 3.45, z: -1.05 },
      { y: 4.72, z: -0.66 },
    ];
    placements.forEach((placement, index) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, placement.y, placement.z),
        new THREE.Vector3(0.03, placement.y, placement.z - 0.2),
        new THREE.Vector3(0.05, placement.y, placement.z - 0.42),
        new THREE.Vector3(0.04, placement.y, placement.z - 0.64),
      ]);
      const material = new THREE.LineBasicMaterial({ color: colors[index], linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      line.userData.anchor = placement;
      this.boomPivot.add(line);
      this.telltales.push(line);
    });
  }

  private updateTelltales(
    sail: SailDiagnostics,
    time: number,
    sailDeployment: number,
    sailHeightScale: number,
    sailChordScale: number,
  ): void {
    this.telltales.forEach((line, index) => {
      line.visible = sailDeployment > 0.2;
      const anchor = line.userData.anchor as { y: number; z: number };
      const anchorY = anchor.y * sailHeightScale;
      const anchorZ = anchor.z * sailChordScale;
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const stallDroop = sail.stall * 0.28;
      const tailLength = (0.62 + sail.attached * 0.06) * sailChordScale;
      const basePhase = time * (10 + sail.luff * 13) + index * 2.3;
      positions.setXYZ(0, 0, anchorY, anchorZ);
      for (let point = 1; point < positions.count; point += 1) {
        const tailFraction = point / (positions.count - 1);
        const phase = basePhase - tailFraction * 3.4;
        const ripple =
          Math.sin(phase) * (0.018 + sail.attached * 0.016) +
          Math.sin(phase * 1.83 + index) * sail.luff * 0.085;
        const flutter = ripple * tailFraction * (1 + sail.luff * 1.7);
        const verticalFlutter =
          Math.cos(phase * 1.27 + 0.8) * sail.luff * 0.045 * tailFraction;
        positions.setXYZ(
          point,
          flutter,
          anchorY - stallDroop * tailFraction ** 1.5 + verticalFlutter,
          anchorZ - tailLength * tailFraction,
        );
      }
      positions.needsUpdate = true;
    });
  }

  private createWakeLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(72 * 3), 3));
    geometry.setDrawRange(0, 0);
    return new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xf1faf7,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
    );
  }

  private createWakeFoam(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
      const fade = context.createLinearGradient(0, 0, 0, canvas.height);
      fade.addColorStop(0, "rgba(241,250,247,0.8)");
      fade.addColorStop(0.38, "rgba(225,245,241,0.38)");
      fade.addColorStop(1, "rgba(225,245,241,0)");
      context.strokeStyle = fade;
      context.lineCap = "round";
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(48 + side * 7, 4);
        context.quadraticCurveTo(
          48 + side * 24,
          92,
          48 + side * 42,
          248,
        );
        context.lineWidth = 8;
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const wake = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 10.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xf1faf7,
        alphaMap: texture,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    wake.visible = false;
    wake.renderOrder = 2;
    return wake;
  }

  private createHullContactFoam(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const sampleCount = 24;
    const verticesPerSide = sampleCount * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(verticesPerSide * 2 * 3), 3),
    );
    const indices: number[] = [];
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const offset = sideIndex * verticesPerSide;
      for (let index = 0; index < sampleCount - 1; index += 1) {
        const inner = offset + index * 2;
        const nextInner = inner + 2;
        indices.push(inner, inner + 1, nextInner, nextInner, inner + 1, nextInner + 1);
      }
    }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, indices.length);
    const foam = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xe9faf7,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    foam.frustumCulled = false;
    foam.renderOrder = 3;
    return foam;
  }

  private updateHullContactFoam(
    state: BoatState,
    weather: WeatherSnapshot,
    x: number,
    z: number,
    heading: number,
  ): void {
    const positions = this.hullContactFoam.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sampleCount = 24;
    const boatScale = this.activeBoat.hull.length / HARBOR_20.hull.length;
    const speed = Math.hypot(state.velocity.x, state.velocity.y);
    const foamReach = (0.08 + THREE.MathUtils.clamp(speed * 0.025, 0, 0.16)) * boatScale;
    const cosine = Math.cos(heading);
    const sine = Math.sin(heading);
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const side = sideIndex === 0 ? -1 : 1;
      for (let index = 0; index < sampleCount; index += 1) {
        const progress = index / (sampleCount - 1);
        const localZ = THREE.MathUtils.lerp(HULL_CONTACT_BOW_Z, HULL_CONTACT_STERN_Z, progress) * boatScale;
        const localX = side * hullContactWidthAt(localZ / boatScale) * boatScale;
        const bowBurst = Math.pow(1 - progress, 3) * THREE.MathUtils.clamp(speed * 0.055, 0, 0.32) * boatScale;
        for (let band = 0; band < 2; band += 1) {
          const bandX = localX + side * (band * foamReach + bowBurst);
          const worldX = x + bandX * cosine + localZ * sine;
          const worldZ = z - bandX * sine + localZ * cosine;
          const wave = sampleWaves(weather.waves, worldX, worldZ, weather.time);
          const vertex = sideIndex * sampleCount * 2 + index * 2 + band;
          positions.setXYZ(vertex, worldX, weather.tideLevel + wave.height + 0.028, worldZ);
        }
      }
    }
    positions.needsUpdate = true;
    this.hullContactFoam.material.opacity = THREE.MathUtils.clamp(
      0.25 + speed * 0.045 + Math.abs(state.heaveVelocity) * 0.16,
      0.25,
      0.68,
    );
  }

  private updateWake(state: BoatState, weather: WeatherSnapshot): void {
    this.wakeCenter.set(
      state.position.x,
      weather.tideLevel,
      state.position.y,
    );
    const speed = Math.hypot(state.velocity.x, state.velocity.y);
    const wakeLength = THREE.MathUtils.clamp(3.4 + speed * 1.65, 3.8, 10.5);
    const sternOffset = this.activeBoat.hull.length * 0.5 + wakeLength * 0.42;
    this.wakeFoam.visible = speed >= 0.28;
    this.wakeFoam.position.set(
      state.position.x - Math.sin(state.heading) * sternOffset,
      weather.tideLevel + 0.035,
      state.position.y - Math.cos(state.heading) * sternOffset,
    );
    this.wakeFoam.rotation.y = state.heading;
    this.wakeFoam.scale.set(
      THREE.MathUtils.clamp(this.activeBoat.hull.beam / 2.15, 0.72, 1.7),
      wakeLength / 10.5,
      1,
    );
    this.wakeFoam.material.opacity = THREE.MathUtils.clamp(
      0.16 + speed * 0.075,
      0.18,
      0.52,
    );
    if (speed < 0.18) return;
    if (
      this.hasLastWakeCenter &&
      this.wakeCenter.distanceToSquared(this.lastWakeCenter) < 0.09
    ) return;
    this.lastWakeCenter.copy(this.wakeCenter);
    this.hasLastWakeCenter = true;
    const points = wakeSurfacePoints(state, this.activeBoat, weather);
    this.wakeTracks[0].push(new THREE.Vector3(points[0].x, points[0].y, points[0].z));
    this.wakeTracks[1].push(new THREE.Vector3(points[1].x, points[1].y, points[1].z));
    for (let index = 0; index < 2; index += 1) {
      const track = this.wakeTracks[index]!;
      const line = this.wakeLines[index]!;
      if (track.length > 72) track.shift();
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      track.forEach((point, pointIndex) => positions.setXYZ(pointIndex, point.x, point.y, point.z));
      positions.needsUpdate = true;
      line.geometry.setDrawRange(0, track.length);
      (line.material as THREE.LineBasicMaterial).opacity = Math.min(
        0.15 + speed * 0.055,
        0.38,
      );
    }
  }

  private createWindLines(): [THREE.LineSegments, Float32Array] {
    const count = 54;
    const seeds = new Float32Array(count * 3);
    const positions = new Float32Array(count * 6);
    for (let index = 0; index < count * 3; index += 1) seeds[index] = Math.random();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xd9eee7, transparent: true, opacity: 0.19 });
    return [new THREE.LineSegments(geometry, material), seeds];
  }

  private updateWind(weather: WeatherSnapshot, state: BoatState, x: number, z: number): void {
    const positions = this.windLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const windLength = Math.max(Math.hypot(weather.trueWind.x, weather.trueWind.y), 0.01);
    const directionX = weather.trueWind.x / windLength;
    const directionZ = weather.trueWind.y / windLength;
    const count = this.windSeeds.length / 3;
    for (let index = 0; index < count; index += 1) {
      const phase = (this.windSeeds[index * 3]! + weather.time * weather.windSpeed * 0.006) % 1;
      const across = this.windSeeds[index * 3 + 1]! - 0.5;
      const height = 0.65 + this.windSeeds[index * 3 + 2]! * 4.2;
      const along = (phase - 0.5) * 115;
      const baseX = x + directionX * along - directionZ * across * 75;
      const baseZ = z + directionZ * along + directionX * across * 75;
      const length = 1.8 + weather.windSpeed * 0.16;
      positions.setXYZ(index * 2, baseX, height, baseZ);
      positions.setXYZ(index * 2 + 1, baseX + directionX * length, height, baseZ + directionZ * length);
    }
    positions.needsUpdate = true;
    this.windLines.position.y = state.heave * 0.1;
  }

  private createRain(): [THREE.Points, Float32Array] {
    const count = 520;
    const seeds = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < seeds.length; index += 1) seeds[index] = Math.random();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xcfe0df,
      size: 0.075,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return [new THREE.Points(geometry, material), seeds];
  }

  private updateRain(weather: WeatherSnapshot, x: number, z: number): void {
    const material = this.rain.material as THREE.PointsMaterial;
    material.opacity = weather.rain * 0.46;
    this.rain.visible = weather.rain > 0.015;
    if (!this.rain.visible) return;
    const positions = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const count = this.rainSeeds.length / 3;
    for (let index = 0; index < count; index += 1) {
      const fall = (this.rainSeeds[index * 3 + 2]! - weather.time * 0.72) % 1;
      positions.setXYZ(
        index,
        x + (this.rainSeeds[index * 3]! - 0.5) * 48,
        ((fall + 1) % 1) * 18,
        z + (this.rainSeeds[index * 3 + 1]! - 0.5) * 48,
      );
    }
    positions.needsUpdate = true;
  }

  private updateWater(
    weather: WeatherSnapshot,
    x: number,
    z: number,
    heading: number,
  ): void {
    this.water.position.set(
      Math.round(x / 20) * 20,
      weather.tideLevel,
      Math.round(z / 20) * 20,
    );
    this.water.material.uniforms.uTime!.value = weather.time;
    this.water.material.uniforms.uCloud!.value = weather.cloud;
    if (this.waveReference !== weather.waves) {
      this.waveReference = weather.waves;
      const arrays = waveShaderArrays(weather.waves);
      this.water.material.uniforms.uWaveDirection!.value = arrays.directions;
      this.water.material.uniforms.uWaveAmplitude!.value = arrays.amplitudes;
      this.water.material.uniforms.uWaveNumber!.value = arrays.waveNumbers;
      this.water.material.uniforms.uWaveFrequency!.value = arrays.angularFrequencies;
      this.water.material.uniforms.uWavePhase!.value = arrays.phases;
      this.water.material.uniforms.uWaveSteepness!.value =
        arrays.steepnesses;
      this.water.material.uniforms.uSignificantWaveHeight!.value =
        significantWaveHeight(weather.waves);
    }
  }

  private createLandmarks(): void {
    const islandMaterial = new THREE.MeshStandardMaterial({
      color: 0x71805b,
      emissive: 0x202a1c,
      emissiveIntensity: 0.16,
      flatShading: true,
      roughness: 0.95,
    });
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x817b73,
      emissive: 0x211f1d,
      emissiveIntensity: 0.1,
      flatShading: true,
      roughness: 1,
    });
    const pineMaterial = new THREE.MeshStandardMaterial({
      color: 0x355642,
      emissive: 0x102319,
      emissiveIntensity: 0.22,
      flatShading: true,
      roughness: 1,
    });
    for (const object of FAIR_WINDS_WORLD.objects) {
      const group = new THREE.Group();
      group.position.set(object.x, 0, object.z);
      group.rotation.y = object.heading ?? 0;
      this.populateWorldObject(
        group,
        object,
        islandMaterial,
        rockMaterial,
        pineMaterial,
      );
      this.scene.add(group);
    }
  }

  private populateWorldObject(
    group: THREE.Group,
    object: WorldObject,
    islandMaterial: THREE.Material,
    rockMaterial: THREE.Material,
    pineMaterial: THREE.Material,
  ): void {
    const shoal = lakeShoalFor(object.landformId ?? object.id);
    if (object.kind === "buoy") {
      const spec = buoyVisualSpec(object.buoyMark);
      const markerMaterial = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.08,
        roughness: 0.72,
        flatShading: true,
      });
      const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x263a3d, roughness: 0.82 });
      const float = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 7), markerMaterial);
      float.scale.y = 0.72;
      float.position.y = 0.18;
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.22, 10), darkMaterial);
      collar.position.y = 0.55;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.35, 8), darkMaterial);
      mast.position.y = 1.28;
      const topmark = new THREE.Mesh(
        spec.topmark === "cone"
          ? new THREE.ConeGeometry(0.28, 0.58, 8)
          : spec.topmark === "can"
            ? new THREE.CylinderGeometry(0.24, 0.24, 0.48, 8)
            : new THREE.SphereGeometry(0.25, 8, 6),
        markerMaterial,
      );
      topmark.position.y = 2.12;
      const waterline = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.035, 5, 16), darkMaterial);
      waterline.rotation.x = Math.PI / 2;
      waterline.position.y = 0.06;
      group.add(float, collar, mast, topmark, waterline);
      return;
    }

    if (object.kind === "rock") {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(object.collision?.radius ?? 4, 0),
        rockMaterial,
      );
      rock.scale.y = 0.58;
      rock.position.y = 1.2;
      group.add(rock);
      return;
    }

    if (object.kind === "dock") {
      const deckMaterial = new THREE.MeshStandardMaterial({
        color: 0x704d35,
        roughness: 0.94,
        flatShading: true,
      });
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(22, 0.42, 2.6),
        deckMaterial,
      );
      deck.position.y = 0.56;
      group.add(deck);
      const landing = new THREE.Mesh(
        new THREE.BoxGeometry(5.5, 0.46, 6.4),
        deckMaterial,
      );
      landing.position.set(-8.2, 0.58, -3.2);
      group.add(landing);
      for (const x of [-7.2, 7.2]) {
        const finger = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.32, 9.5),
          deckMaterial,
        );
        finger.position.set(x, 0.5, 4.8);
        group.add(finger);
      }
      for (const x of [-10.5, -7.2, -3.5, 0, 3.5, 7.2, 10.5]) {
        for (const z of [-1, 1]) {
          const piling = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.22, 2.8, 7),
            deckMaterial,
          );
          piling.position.set(x, -0.2, z);
          group.add(piling);
        }
      }
      const harborLightMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4d794,
        emissive: 0xffc56a,
        emissiveIntensity: 1.8,
        roughness: 0.6,
      });
      for (const x of [-10, 10]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.11, 2.8, 7),
          deckMaterial,
        );
        post.position.set(x, 2, 0);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 6),
          harborLightMaterial,
        );
        lamp.position.set(x, 3.35, 0);
        group.add(post, lamp);
      }
      const markerColors = [0xb94f3e, 0x3e8764];
      for (let index = 0; index < 2; index += 1) {
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.5, 1.8, 8),
          new THREE.MeshStandardMaterial({
            color: markerColors[index],
            emissive: markerColors[index],
            emissiveIntensity: 0.12,
            roughness: 0.82,
          }),
        );
        marker.position.set(index === 0 ? -8.8 : 8.8, 0.75, 10.2);
        group.add(marker);
      }
      return;
    }

    if (object.kind === "cabin") {
      const landCenterX = (shoal?.x ?? object.x + 50) - object.x;
      const landCenterZ = (shoal?.z ?? object.z - 30) - object.z;
      const landRadius = shoal?.islandRadius ?? 105;
      const landScaleX = shoal?.scaleX ?? 1;
      const landScaleZ = shoal?.scaleZ ?? 1;
      const landRotation = shoal?.rotation ?? 0;
      const coveLand = new THREE.Mesh(
        new THREE.CylinderGeometry(
          landRadius * 0.88,
          landRadius,
          10,
          19,
        ),
        new THREE.MeshStandardMaterial({
          color: 0x7f8f70,
          roughness: 0.96,
          flatShading: true,
        }),
      );
      coveLand.position.set(landCenterX, 0, landCenterZ);
      coveLand.scale.set(landScaleX, 1, landScaleZ);
      coveLand.rotation.y = landRotation;
      group.add(coveLand);
      const timber = new THREE.MeshStandardMaterial({
        color: 0x745742,
        roughness: 0.95,
        flatShading: true,
      });
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(7, 4, 5.2),
        timber,
      );
      walls.position.y = 7;
      group.add(walls);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(5.2, 2.4, 4),
        new THREE.MeshStandardMaterial({
          color: 0x34434a,
          roughness: 0.94,
          flatShading: true,
        }),
      );
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.78;
      roof.position.y = 10.15;
      group.add(roof);
      for (const [index, x] of [-18, 18].entries()) {
        const shed = new THREE.Mesh(
          new THREE.BoxGeometry(10, 3.6, 7),
          timber,
        );
        shed.position.set(x, 6.8, 8 + index * 12);
        const shedRoof = new THREE.Mesh(
          new THREE.ConeGeometry(7, 2.6, 4),
          new THREE.MeshStandardMaterial({
            color: index === 0 ? 0x8d4e3d : 0x40585c,
            roughness: 0.92,
            flatShading: true,
          }),
        );
        shedRoof.rotation.y = Math.PI / 4;
        shedRoof.scale.z = 0.72;
        shedRoof.position.set(x, 9.8, 8 + index * 12);
        group.add(shed, shedRoof);
      }
      for (let index = 0; index < 12; index += 1) {
        const tree = new THREE.Mesh(
          new THREE.ConeGeometry(
            2.4 + (index % 3) * 0.45,
            10 + (index % 4) * 1.6,
            6,
            2,
          ),
          pineMaterial,
        );
        const phase = index * 2.3;
        const localX = Math.sin(phase) * landRadius * landScaleX * 0.58;
        const localZ = Math.cos(phase) * landRadius * landScaleZ * 0.54;
        tree.position.set(
          landCenterX + localX * Math.cos(landRotation) + localZ * Math.sin(landRotation),
          10,
          landCenterZ - localX * Math.sin(landRotation) + localZ * Math.cos(landRotation),
        );
        group.add(tree);
      }
      return;
    }

    const isBeaconHeadland = object.id === "beacon-west-headland";
    const islandRadius =
      shoal?.islandRadius ??
      (object.kind === "lighthouse" ? 50 : isBeaconHeadland ? 62 : 55);
    const islandScaleX = shoal?.scaleX ?? 1;
    const islandScaleZ = shoal?.scaleZ ?? 1;
    const landRotation = shoal?.rotation ?? 0;
    const islandHeight =
      isBeaconHeadland ? 32 : object.kind === "lighthouse" ? 26 : 7.5;
    const cinematicLandmark = isBeaconHeadland || object.kind === "lighthouse";
    let summitY = islandHeight;
    if (cinematicLandmark) {
      const shoreShelf = new THREE.Mesh(
        new THREE.CylinderGeometry(
          islandRadius * 0.88,
          islandRadius * 1.03,
          3.2,
          15,
        ),
        rockMaterial,
      );
      shoreShelf.position.y = 0.35;
      shoreShelf.scale.set(islandScaleX, 1, islandScaleZ);
      shoreShelf.rotation.y = landRotation + 0.18;
      group.add(shoreShelf);

      const cliff = new THREE.Mesh(
        new THREE.CylinderGeometry(
          islandRadius * 0.62,
          islandRadius * 0.94,
          islandHeight,
          21,
          3,
          false,
        ),
        rockMaterial,
      );
      cliff.scale.set(
        islandScaleX,
        1,
        islandScaleZ * (isBeaconHeadland ? 0.78 : 0.86),
      );
      cliff.position.y = islandHeight * 0.5;
      cliff.rotation.y = landRotation + (isBeaconHeadland ? -0.22 : 0.12);
      group.add(cliff);

      const capHeight = isBeaconHeadland ? 3.6 : 3;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          islandRadius * 0.52,
          islandRadius * 0.61,
          capHeight,
          15,
        ),
        islandMaterial,
      );
      summitY = islandHeight * 1.03 + capHeight * 0.5;
      cap.position.y = summitY - capHeight * 0.5;
      cap.scale.set(islandScaleX, 1, islandScaleZ);
      cap.rotation.y = landRotation - 0.15;
      group.add(cap);
      this.addRockFringe(
        group,
        isBeaconHeadland ? 64 : 48,
        islandRadius,
        rockMaterial,
        isBeaconHeadland ? 3.4 : 5.7,
        islandScaleX,
        islandScaleZ,
        landRotation,
      );
    } else {
      const island = new THREE.Mesh(
        new THREE.CylinderGeometry(
          islandRadius * 0.72,
          islandRadius,
          islandHeight,
          11,
        ),
        islandMaterial,
      );
      island.position.y = 0.2;
      island.scale.set(islandScaleX, 1, islandScaleZ);
      island.rotation.y = landRotation;
      group.add(island);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(11, 0),
        rockMaterial,
      );
      rock.scale.y = 0.5;
      rock.position.set(-14, 5.2, 5);
      group.add(rock);
    }

    this.addPineGrove(
      group,
      isBeaconHeadland ? 72 : object.kind === "lighthouse" ? 38 : 18,
      islandRadius * (cinematicLandmark ? 0.62 : 0.74) * islandScaleX,
      islandRadius * (isBeaconHeadland ? 0.48 : 0.62) * islandScaleZ,
      cinematicLandmark ? summitY : islandHeight * 0.5 + 0.2,
      pineMaterial,
      isBeaconHeadland ? 1.9 : object.kind === "lighthouse" ? 4.6 : 7.2,
      landRotation,
      cinematicLandmark && shoal
        ? (localX, localZ) =>
            landmarkGroundHeight(
              shoal,
              object.x + localX,
              object.z + localZ,
              islandHeight,
              summitY,
            )
        : undefined,
    );
    if (object.kind === "lighthouse") {
      const towerX = object.landmarkOffset?.x ?? 12;
      const towerZ = object.landmarkOffset?.z ?? -4;
      const towerHeight = 25;
      const towerBaseY = shoal
        ? landmarkGroundHeight(
            shoal,
            object.x + towerX,
            object.z + towerZ,
            islandHeight,
            summitY,
          )
        : summitY;
      const footing = new THREE.Mesh(
        new THREE.CylinderGeometry(3.35, 4.15, 1.3, 11),
        rockMaterial,
      );
      footing.position.set(towerX, towerBaseY + 0.4, towerZ);
      group.add(footing);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(1.55, 2.75, towerHeight, 10),
        new THREE.MeshStandardMaterial({
          color: 0xeee7d8,
          emissive: 0x3a3027,
          emissiveIntensity: 0.08,
          roughness: 0.78,
          flatShading: true,
        }),
      );
      const towerCenterY = towerBaseY + towerHeight * 0.5 - 0.2;
      beacon.position.set(towerX, towerCenterY, towerZ);
      group.add(beacon);
      const stripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xb64e3b,
        emissive: 0x35140f,
        emissiveIntensity: 0.08,
        roughness: 0.8,
        flatShading: true,
      });
      for (const offset of [8.2, 17.2]) {
        const stripe = new THREE.Mesh(
          new THREE.CylinderGeometry(1.82, 2.08, 3.2, 10),
          stripeMaterial,
        );
        stripe.position.set(towerX, towerBaseY + offset, towerZ);
        group.add(stripe);
      }
      const gallery = new THREE.Mesh(
        new THREE.CylinderGeometry(2.65, 2.65, 0.45, 12),
        new THREE.MeshStandardMaterial({
          color: 0x273841,
          roughness: 0.76,
          flatShading: true,
        }),
      );
      gallery.position.set(towerX, towerBaseY + towerHeight + 0.2, towerZ);
      group.add(gallery);
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(2, 2, 2.4, 10),
        new THREE.MeshStandardMaterial({
          color: 0x2a3a40,
          emissive: 0xffc56c,
          emissiveIntensity: 0.3,
          roughness: 0.52,
          flatShading: true,
        }),
      );
      lantern.position.set(towerX, towerBaseY + towerHeight + 1.6, towerZ);
      group.add(lantern);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, 2.2, 10),
        new THREE.MeshStandardMaterial({
          color: 0x263943,
          roughness: 0.82,
          flatShading: true,
        }),
      );
      roof.position.set(towerX, towerBaseY + towerHeight + 3.85, towerZ);
      group.add(roof);
      const lamp = new THREE.PointLight(0xffd884, 16, 80);
      lamp.position.set(towerX, towerBaseY + towerHeight + 1.6, towerZ);
      group.add(lamp);
    }
  }

  private addRockFringe(
    group: THREE.Group,
    count: number,
    radius: number,
    material: THREE.Material,
    seed: number,
    scaleX = 1,
    scaleZ = 1,
    shapeRotation = 0,
  ): void {
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(5.4, 0),
      material,
      count,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const phase = seed + index * 2.399963;
      const spread = 0.88 + ((index * 17) % 11) / 42;
      const localX = Math.sin(phase) * radius * spread * scaleX;
      const localZ = Math.cos(phase) * radius * spread * 0.82 * scaleZ;
      position.set(
        localX * Math.cos(shapeRotation) + localZ * Math.sin(shapeRotation),
        1.2 + (index % 4) * 0.52,
        -localX * Math.sin(shapeRotation) + localZ * Math.cos(shapeRotation),
      );
      euler.set(
        (index % 3) * 0.08,
        phase * 0.73,
        ((index + 1) % 3) * 0.06,
      );
      rotation.setFromEuler(euler);
      const size = 0.48 + ((index * 7) % 9) * 0.1;
      scale.set(
        size * (0.82 + (index % 4) * 0.13),
        size * (0.42 + ((index * 5) % 4) * 0.09),
        size * (0.72 + ((index * 3) % 5) * 0.11),
      );
      matrix.compose(position, rotation, scale);
      rocks.setMatrixAt(index, matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    group.add(rocks);
  }

  private addPineGrove(
    group: THREE.Group,
    count: number,
    radiusX: number,
    radiusZ: number,
    baseY: number,
    crownMaterial: THREE.Material,
    seed: number,
    shapeRotation = 0,
    groundHeightAt?: (localX: number, localZ: number) => number,
  ): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x594330,
      emissive: 0x17110d,
      emissiveIntensity: 0.18,
      roughness: 1,
      flatShading: true,
    });
    const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.4, 5.2, 7);
    const crownGeometries = [
      new THREE.ConeGeometry(3.8, 5.8, 7, 2),
      new THREE.ConeGeometry(3.15, 5, 7, 2),
      new THREE.ConeGeometry(2.55, 4.2, 7, 2),
      new THREE.ConeGeometry(1.9, 3.3, 7, 2),
    ];
    const crownMaterials = crownGeometries.map((_, layer) => {
      if (layer < 2) return crownMaterial;
      const material = crownMaterial.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.offsetHSL(0.005, -0.015, 0.035 + layer * 0.012);
        material.emissive.copy(material.color).multiplyScalar(0.12);
      }
      return material;
    });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
    const crowns = crownGeometries.map(
      (geometry, layer) =>
        new THREE.InstancedMesh(geometry, crownMaterials[layer]!, count),
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const phase = seed + index * 2.399963;
      const radial = 0.24 + (((index * 29) % count) / Math.max(count - 1, 1)) * 0.72;
      const height = 0.72 + (index % 7) * 0.085;
      const localX = Math.sin(phase) * radiusX * radial;
      const localZ = Math.cos(phase) * radiusZ * radial;
      const x = localX * Math.cos(shapeRotation) + localZ * Math.sin(shapeRotation);
      const z = -localX * Math.sin(shapeRotation) + localZ * Math.cos(shapeRotation);
      const treeBase = groundHeightAt?.(x, z) ?? baseY + (1 - radial) * 1.2;
      euler.set(0, phase * 0.37, 0);
      rotation.setFromEuler(euler);

      const widthVariation = 0.88 + (index % 5) * 0.045;
      position.set(x, treeBase + 2.55 * height, z);
      scale.set(
        height * widthVariation,
        height,
        height * (1.04 - (index % 3) * 0.035),
      );
      matrix.compose(position, rotation, scale);
      trunks.setMatrixAt(index, matrix);

      for (let layer = 0; layer < crowns.length; layer += 1) {
        const layerScale = height * (1 - layer * 0.035);
        position.set(x, treeBase + (4.2 + layer * 2.05) * height, z);
        scale.set(
          layerScale * widthVariation,
          layerScale,
          layerScale * (1.04 - (index % 3) * 0.035),
        );
        matrix.compose(position, rotation, scale);
        crowns[layer]!.setMatrixAt(index, matrix);
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    for (const crown of crowns) crown.instanceMatrix.needsUpdate = true;
    group.add(trunks, ...crowns);
  }

  private createClouds(): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xdce6df, transparent: true, opacity: 0.34, depthWrite: false });
    for (let index = 0; index < 14; index += 1) {
      const cloud = new THREE.Mesh(new THREE.DodecahedronGeometry(15 + (index % 3) * 5, 0), material.clone());
      const angle = (index / 14) * Math.PI * 2;
      cloud.scale.set(2.8, 0.42, 1.15);
      cloud.position.set(Math.sin(angle) * 380, 55 + (index % 4) * 10, Math.cos(angle) * 380);
      this.clouds.add(cloud);
    }
  }

  private updateAtmosphere(weather: WeatherSnapshot): void {
    const lighting = this.scenery.update(weather, this.camera);
    this.scene.background = lighting.sky;
    this.hemisphere.color.copy(lighting.hemisphereSky);
    this.hemisphere.groundColor.copy(lighting.hemisphereGround);
    this.hemisphere.intensity = lighting.hemisphereIntensity;
    this.sun.color.copy(lighting.sunColor);
    this.sun.intensity = lighting.sunIntensity;
    this.sun.position
      .copy(lighting.sunDirection)
      .multiplyScalar(240);
    this.renderer.toneMappingExposure = lighting.exposure;
    const fogNear = Math.max(120, 260 * weather.visibility);
    const fogFar = Math.max(1_080, 2_000 * weather.visibility);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(lighting.fog);
      this.scene.fog.near = fogNear;
      this.scene.fog.far = fogFar;
    }
    this.water.material.uniforms.uSunDirection!.value.copy(
      lighting.sunDirection,
    );
    this.water.material.uniforms.uSunColor!.value.copy(
      lighting.sunColor,
    );
    this.water.material.uniforms.uSkyColor!.value.copy(lighting.sky);
    this.water.material.uniforms.uWaterDeep!.value.copy(
      lighting.waterDeep,
    );
    this.water.material.uniforms.uWaterShallow!.value.copy(
      lighting.waterShallow,
    );
    this.water.material.uniforms.uFogColor!.value.copy(lighting.fog);
    this.water.material.uniforms.uFogNear!.value = fogNear;
    this.water.material.uniforms.uFogFar!.value = fogFar;
    this.clouds.position.set(
      this.camera.position.x * 0.82,
      0,
      this.camera.position.z * 0.82,
    );
    this.clouds.rotation.y = weather.time * 0.0025;
    this.clouds.children.forEach((cloud) => {
      const material = (cloud as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + weather.cloud * 0.46;
      material.color
        .copy(lighting.sky)
        .lerp(
          lighting.sunColor,
          weather.cloud > 0.6 ? 0.12 : 0.36,
        );
    });
  }

  private updateReflection(): void {
    this.camera.getWorldDirection(this.reflectionViewDirection);
    this.reflectedCameraPosition.copy(this.camera.position);
    this.reflectedCameraPosition.y *= -1;
    this.reflectedCameraTarget
      .copy(this.camera.position)
      .add(this.reflectionViewDirection);
    this.reflectedCameraTarget.y *= -1;

    this.reflectionCamera.position.copy(this.reflectedCameraPosition);
    this.reflectionCamera.up.set(0, -1, 0);
    this.reflectionCamera.lookAt(this.reflectedCameraTarget);
    this.reflectionCamera.near = this.camera.near;
    this.reflectionCamera.far = this.camera.far;
    this.reflectionCamera.aspect = this.camera.aspect;
    this.reflectionCamera.projectionMatrix.copy(
      this.camera.projectionMatrix,
    );
    this.reflectionCamera.projectionMatrixInverse.copy(
      this.camera.projectionMatrixInverse,
    );
    this.reflectionCamera.updateMatrixWorld(true);

    this.reflectionMatrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.reflectionMatrix.multiply(
      this.reflectionCamera.projectionMatrix,
    );
    this.reflectionMatrix.multiply(
      this.reflectionCamera.matrixWorldInverse,
    );

    const previousTarget = this.renderer.getRenderTarget();
    const previousXr = this.renderer.xr.enabled;
    const previousClippingPlanes = this.renderer.clippingPlanes;
    const boatWasVisible = this.boatRoot.visible;
    const wakeFoamWasVisible = this.wakeFoam.visible;
    this.renderer.xr.enabled = false;
    this.renderer.clippingPlanes = this.reflectionClippingPlanes;
    this.water.visible = false;
    this.boatRoot.visible = false;
    this.wakeFoam.visible = false;
    const windWasVisible = this.windLines.visible;
    const rainWasVisible = this.rain.visible;
    const portWakeWasVisible = this.wakeLines[0].visible;
    const starboardWakeWasVisible = this.wakeLines[1].visible;
    this.windLines.visible = false;
    this.rain.visible = false;
    this.wakeLines[0].visible = false;
    this.wakeLines[1].visible = false;
    this.scenery.setReflectionPass(true);
    this.renderer.setRenderTarget(this.reflectionTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.reflectionCamera);
    this.renderer.setRenderTarget(previousTarget);
    this.water.visible = true;
    this.boatRoot.visible = boatWasVisible;
    this.wakeFoam.visible = wakeFoamWasVisible;
    this.windLines.visible = windWasVisible;
    this.rain.visible = rainWasVisible;
    this.wakeLines[0].visible = portWakeWasVisible;
    this.wakeLines[1].visible = starboardWakeWasVisible;
    this.scenery.setReflectionPass(false);
    this.renderer.clippingPlanes = previousClippingPlanes;
    this.renderer.xr.enabled = previousXr;
  }

  private updateCamera(
    x: number,
    z: number,
    heading: number,
    heave: number,
    frameDt: number,
    incident?: IncidentPresentation,
    titleScreen = false,
    presentationTime = 0,
  ): void {
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const portraitFraming = THREE.MathUtils.clamp(0.95 / this.camera.aspect, 1, 1.9);
    const portraitTitle = titleScreen && this.camera.aspect < 0.72;
    const targetFov = portraitTitle ? 66 : 52;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    const incidentProgress = incident
      ? THREE.MathUtils.smoothstep(incident.elapsed, 0.05, 2.8)
      : 0;
    const boatScale = Math.sqrt(
      this.activeBoat.hull.length / HARBOR_20.hull.length,
    );
    const titleDrift = titleScreen
      ? Math.sin(presentationTime * 0.16) * 1.35
      : 0;
    const chaseDistance =
      THREE.MathUtils.lerp(
        titleScreen
          ? 30 * boatScale
          : this.activeBoat.camera.distance * boatScale,
        32 * boatScale,
        incidentProgress,
      ) *
      portraitFraming;
    const compositionSide = titleScreen
      ? (portraitTitle ? 14 : 28) * boatScale + titleDrift
      : THREE.MathUtils.lerp(
          this.activeBoat.camera.distance * boatScale * 0.36,
          6 * boatScale,
          incidentProgress,
        ) * Math.min(portraitFraming, 1.25);
    const incidentReveal = incident
      ? THREE.MathUtils.clamp(incident.result.point.x - x, -8, 8) *
        incidentProgress *
        0.32
      : 0;
    const sideReveal = compositionSide + incidentReveal;
    this.desiredCameraPosition.set(
      x -
        forwardX * chaseDistance +
        Math.cos(heading) * sideReveal,
      heave +
        THREE.MathUtils.lerp(
          titleScreen
            ? 12.8 * boatScale
            : this.activeBoat.camera.height * boatScale,
          16 * boatScale,
          incidentProgress,
        ) +
        (portraitFraming - 1) * 1.4 +
        (titleScreen ? Math.sin(presentationTime * 0.12) * 0.42 : 0),
      z -
        forwardZ * chaseDistance -
        Math.sin(heading) * sideReveal,
    );
    if (incident) {
      let openWaterX = x - incident.result.point.x;
      let openWaterZ = z - incident.result.point.z;
      if (Math.hypot(openWaterX, openWaterZ) < 0.6) {
        openWaterX = -x;
        openWaterZ = -z;
      }
      const openWaterLength = Math.max(Math.hypot(openWaterX, openWaterZ), 1);
      openWaterX /= openWaterLength;
      openWaterZ /= openWaterLength;
      const incidentCameraX =
        x + openWaterX * 30 * boatScale + openWaterZ * 5 * boatScale;
      const incidentCameraZ =
        z + openWaterZ * 30 * boatScale - openWaterX * 5 * boatScale;
      this.desiredCameraPosition.x = THREE.MathUtils.lerp(
        this.desiredCameraPosition.x,
        incidentCameraX,
        incidentProgress,
      );
      this.desiredCameraPosition.z = THREE.MathUtils.lerp(
        this.desiredCameraPosition.z,
        incidentCameraZ,
        incidentProgress,
      );
    }
    if (!this.cameraInitialized) {
      this.camera.position.copy(this.desiredCameraPosition);
      this.cameraInitialized = true;
    } else {
      this.camera.position.lerp(
        this.desiredCameraPosition,
        1 - Math.exp(-3.3 * frameDt),
      );
    }
    const titleLookSide = titleScreen
      ? (portraitTitle ? -18 : 20) * boatScale
      : 0;
    const normalLookX =
      x +
      forwardX * this.activeBoat.camera.lookAhead * boatScale +
      Math.cos(heading) * titleLookSide;
    const normalLookZ =
      z +
      forwardZ * this.activeBoat.camera.lookAhead * boatScale -
      Math.sin(heading) * titleLookSide;
    this.cameraLookAt.set(
      THREE.MathUtils.lerp(
        normalLookX,
        incident?.result.point.x ?? normalLookX,
        incidentProgress * 0.42,
      ),
      heave +
        THREE.MathUtils.lerp(
          titleScreen ? 15.5 : 1.2,
          0.8,
          incidentProgress,
        ),
      THREE.MathUtils.lerp(
        normalLookZ,
        incident?.result.point.z ?? normalLookZ,
        incidentProgress * 0.42,
      ),
    );
    this.camera.lookAt(this.cameraLookAt);
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

const HULL_STATIONS = [
  { z: 3.15, width: 0.035, top: 0.58, bottom: -0.04 },
  { z: 2.12, width: 0.76, top: 0.44, bottom: -0.4 },
  { z: 0.35, width: 1.08, top: 0.35, bottom: -0.64 },
  { z: -1.45, width: 1, top: 0.4, bottom: -0.54 },
  { z: -2.62, width: 0.67, top: 0.5, bottom: -0.28 },
] as const;

function createHullRailCurve(
  side: number,
  level: number,
  widthScale = 1,
): THREE.CatmullRomCurve3 {
  const points = HULL_STATIONS.map((station) => {
    const widthAtLevel = THREE.MathUtils.lerp(
      station.width,
      station.width * 0.42,
      level,
    );
    return new THREE.Vector3(
      side * widthAtLevel * widthScale,
      THREE.MathUtils.lerp(station.top, station.bottom, level) + 0.025,
      station.z,
    );
  });
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function createInteriorFloorGeometry(): THREE.BufferGeometry {
  const outline = [
    { x: 0, z: INTERIOR_FLOOR_BOW_Z },
    { x: 0.28, z: 2.55 },
    { x: 0.55, z: 1.72 },
    { x: 0.78, z: 0.25 },
    { x: 0.7, z: -1.3 },
    { x: 0.43, z: -2.18 },
    { x: -0.43, z: -2.18 },
    { x: -0.7, z: -1.3 },
    { x: -0.78, z: 0.25 },
    { x: -0.55, z: 1.72 },
    { x: -0.28, z: 2.55 },
  ];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0]!.x, -outline[0]!.z);
  for (const point of outline.slice(1)) shape.lineTo(point.x, -point.z);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createHullGeometry(): THREE.BufferGeometry {
  const stations = HULL_STATIONS;
  const vertices: number[] = [];
  const triangle = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c);
  for (let index = 0; index < stations.length - 1; index += 1) {
    const a = stations[index]!;
    const b = stations[index + 1]!;
    const atp = [-a.width, a.top, a.z];
    const ats = [a.width, a.top, a.z];
    const abp = [-a.width * 0.42, a.bottom, a.z];
    const abs = [a.width * 0.42, a.bottom, a.z];
    const btp = [-b.width, b.top, b.z];
    const bts = [b.width, b.top, b.z];
    const bbp = [-b.width * 0.42, b.bottom, b.z];
    const bbs = [b.width * 0.42, b.bottom, b.z];
    triangle(atp, btp, bbp); triangle(atp, bbp, abp);
    triangle(ats, abs, bbs); triangle(ats, bbs, bts);
    triangle(abp, bbp, bbs); triangle(abp, bbs, abs);
  }
  const addEndCap = (station: (typeof stations)[number], facesForward: boolean) => {
    const portTop = [-station.width, station.top, station.z];
    const starboardTop = [station.width, station.top, station.z];
    const portBottom = [-station.width * 0.42, station.bottom, station.z];
    const starboardBottom = [station.width * 0.42, station.bottom, station.z];
    if (facesForward) {
      triangle(portTop, starboardBottom, starboardTop);
      triangle(portTop, portBottom, starboardBottom);
    } else {
      triangle(portTop, starboardTop, starboardBottom);
      triangle(portTop, starboardBottom, portBottom);
    }
  };
  addEndCap(stations[0]!, true);
  addEndCap(stations.at(-1)!, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createDeckGeometry(): THREE.BufferGeometry {
  const points = [
    [0, 0.6, 3.12],
    [-0.77, 0.46, 2.08],
    [-1.07, 0.38, 0.32],
    [-0.98, 0.42, -1.42],
    [-0.65, 0.52, -2.6],
    [0.65, 0.52, -2.6],
    [0.98, 0.42, -1.42],
    [1.07, 0.38, 0.32],
    [0.77, 0.46, 2.08],
  ];
  const vertices: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    vertices.push(...points[0]!, ...points[index + 1]!, ...points[index]!);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSailGeometry(): THREE.BufferGeometry {
  const rows = 9;
  const columns = 9;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const chord = (1 - v) * 3.42;
      positions.push(0, v * 5.8, -u * chord);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createHeadsailGeometry(): THREE.BufferGeometry {
  const rows = 8;
  const columns = 7;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const chord = (1 - v) * 2.62;
      positions.push(0, 0.18 + v * 5.8, u * chord);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(uvs, 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
