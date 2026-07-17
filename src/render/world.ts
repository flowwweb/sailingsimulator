import * as THREE from "three";
import type { IncidentResult } from "../game/hazards";
import {
  FAIR_WINDS_WORLD,
  navigationObjects,
  type WorldObject,
} from "../game/world-definition";
import type { BoatState, SailDiagnostics } from "../sim/model";
import {
  HARBOR_20,
  getSailDefinition,
  type BoatDefinition,
} from "../sim/boats";
import {
  significantWaveHeight,
  waveShaderArrays,
} from "../weather/waves";
import type { WeatherSnapshot } from "../weather/types";
import { LakeScenery } from "./scenery";

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
  };
}

export class SailingWorld {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 3_500);
  private readonly scenery = new LakeScenery();
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
  private readonly sailMaterial: SailMaterial;
  private headsailMaterial!: SailMaterial;
  private readonly telltales: THREE.Line[] = [];
  private readonly wakeLines: [THREE.Line, THREE.Line];
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

    this.water = this.createWater();
    this.scene.add(this.water);
    this.sailMaterial = this.createBoat();
    this.scene.add(this.boatRoot);
    this.wakeLines = [this.createWakeLine(), this.createWakeLine()];
    this.scene.add(...this.wakeLines);
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
  }

  setBoat(boat: BoatDefinition): void {
    this.activeBoat = boat;
    const scale = boat.hull.length / HARBOR_20.hull.length;
    this.boatRoot.scale.setScalar(scale);
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

    this.boatRoot.position.set(x, heave, z);
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
    const impactLean =
      incident?.result.severity === "impact"
        ? impactDirection * 0.24 * incidentProgress
        : 0;
    this.hullPose.rotation.z = -heel + impactLean;
    this.rigPose.rotation.z =
      incident?.result.severity === "impact"
        ? impactDirection * 0.94 * incidentProgress
        : incident?.result.severity === "stranded"
          ? impactDirection * 0.08 * incidentProgress
          : 0;
    this.rigPose.rotation.x =
      incident?.result.severity === "impact"
        ? -0.12 * incidentProgress
        : 0;
    this.boomPivot.rotation.y = -boomAngle;
    this.rudderPivot.rotation.y = -rudderAngle;
    this.sailMaterial.uniforms.uTime.value = weather.time;
    this.sailMaterial.uniforms.uLuff.value = sail.luff;
    this.sailMaterial.uniforms.uStall.value = sail.stall;
    this.sailMaterial.uniforms.uAttached.value = sail.attached;
    this.headsailPivot.rotation.y = -current.headsailAngle;
    this.headsailPivot.visible = Boolean(headsail);
    if (headsail) {
      this.headsailMaterial.uniforms.uTime.value = weather.time;
      this.headsailMaterial.uniforms.uLuff.value = headsail.luff;
      this.headsailMaterial.uniforms.uStall.value = headsail.stall;
      this.headsailMaterial.uniforms.uAttached.value =
        headsail.attached;
    }
    this.updateTelltales(sail, weather.time);
    this.updateWater(weather, x, z);
    this.updateWake(current);
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
    this.titleFill.visible = titleScreen;
    this.titleFill.intensity = titleScreen ? 0.95 : 0;
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
      uniforms: {
        uTime: { value: 0 },
        uWaveDirection: { value: new Float32Array(12) },
        uWaveAmplitude: { value: new Float32Array(6) },
        uWaveNumber: { value: new Float32Array(6) },
        uWaveFrequency: { value: new Float32Array(6) },
        uWavePhase: { value: new Float32Array(6) },
        uWaveSteepness: { value: new Float32Array(6) },
        uSignificantWaveHeight: { value: 0.5 },
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
        varying vec3 vWorldPosition;
        varying vec4 vReflectionCoord;
        varying float vWaveHeight;
        varying float vWaveSlope;
        varying vec2 vWaveSlopeVector;
        float smootherstep(float edge0, float edge1, float value) {
          float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
          return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        }
        float estimatedDepth(vec2 point) {
          float edgeProgress = 1.0 - length(point) / 1800.0;
          float depth = 36.0 * smootherstep(0.0, 0.72, edgeProgress);
          float shoalDistance = length(point - vec2(-520.0, 430.0));
          if (shoalDistance < 160.0) {
            float shelfDepth = 12.0 * smootherstep(55.0, 160.0, shoalDistance);
            depth = min(depth, shelfDepth);
          }
          float coveDistance = length(
            point - vec2(915.0, -440.0)
          );
          if (coveDistance < 210.0) {
            float coveDepth = 12.0 * smootherstep(
              90.0,
              210.0,
              coveDistance
            );
            depth = min(depth, coveDepth);
          }
          return max(0.0, depth);
        }
        void main() {
          vec3 dx = dFdx(vWorldPosition);
          vec3 dy = dFdy(vWorldPosition);
          vec3 faceNormal = normalize(cross(dx, dy));
          if (faceNormal.y < 0.0) faceNormal = -faceNormal;
          vec3 smoothNormal = normalize(
            vec3(
              -vWaveSlopeVector.x,
              1.0,
              -vWaveSlopeVector.y
            )
          );
          vec3 normal = normalize(
            mix(smoothNormal, faceNormal, 0.14)
          );
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
          float fresnel = pow(1.0 - facing, 2.55);
          float diffuse = clamp(dot(normal, uSunDirection), 0.0, 1.0);
          vec3 reflected = reflect(-uSunDirection, normal);
          float sparkle = pow(max(dot(reflected, viewDirection), 0.0), 118.0)
            * (1.0 - uCloud * 0.72);
          float depthMix = smoothstep(2.0, 23.0, estimatedDepth(vWorldPosition.xz));
          vec3 color = mix(uWaterShallow, uWaterDeep, depthMix);
          float faceVariation = dot(normal.xz, normalize(vec2(0.66, 0.34)));
          color *= 0.9 + diffuse * 0.2 + faceVariation * 0.018;
          color = mix(
            color,
            uSkyColor,
            0.075 + fresnel * (0.58 - uCloud * 0.14)
          );
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
            (0.04 + fresnel * 0.5) *
            (1.0 - uCloud * 0.12);
          color = mix(
            color,
            sceneReflection,
            clamp(reflectionStrength, 0.0, 0.58)
          );
          vec2 surfaceDirection = normalize(vWorldPosition.xz - cameraPosition.xz);
          vec2 sunAcrossWater = normalize(uSunDirection.xz);
          float sunPath = pow(
            max(dot(surfaceDirection, sunAcrossWater), 0.0),
            108.0
          );
          float shimmerA = 0.5 + 0.5 * sin(
            vWorldPosition.x * 0.88 +
            vWorldPosition.z * 0.19 -
            uTime * 1.8
          );
          float shimmerB = 0.5 + 0.5 * sin(
            vWorldPosition.x * -0.21 +
            vWorldPosition.z * 1.05 +
            uTime * 1.15
          );
          float shimmer = smoothstep(
            0.62,
            0.88,
            shimmerA * 0.52 + shimmerB * 0.48
          );
          sunPath *= shimmer * (0.28 + max(faceVariation, 0.0) * 0.26);
          color += uSunColor * sparkle * 1.35;
          color += uSunColor * sunPath * (1.0 - uCloud * 0.72) * 0.52;
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
          gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
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
      color: 0xe8e0c8,
      roughness: 0.66,
      metalness: 0,
      flatShading: true,
    });
    const hull = new THREE.Mesh(createHullGeometry(), hullMaterial);
    this.hullPose.add(hull);

    const deck = new THREE.Mesh(
      createDeckGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.8, flatShading: true }),
    );
    deck.position.y = 0.02;
    this.hullPose.add(deck);
    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.1, 1.62),
      new THREE.MeshStandardMaterial({ color: 0x292e2d, roughness: 0.88 }),
    );
    cockpit.position.set(0, 0.42, -1.08);
    this.hullPose.add(cockpit);
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x9b603d,
      roughness: 0.78,
      flatShading: true,
    });
    for (const x of [-0.63, 0.63]) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 1.9),
        woodMaterial,
      );
      bench.position.set(x, 0.52, -0.98);
      this.hullPose.add(bench);
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
    this.hullPose.add(cabinTop);
    for (const x of [-0.96, 0.96]) {
      const gunwale = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.1, 4.25),
        woodMaterial,
      );
      gunwale.position.set(x, 0.48, -0.28);
      this.hullPose.add(gunwale);
    }

    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x263d42, roughness: 0.72 });
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.45, 1.95), darkMaterial);
    keel.position.set(0, -1.08, -0.15);
    this.hullPose.add(keel);
    this.rudderPivot.position.set(0, -0.1, -2.55);
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.72), darkMaterial);
    rudder.position.set(0, -0.55, -0.26);
    this.rudderPivot.add(rudder);
    this.hullPose.add(this.rudderPivot);

    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0xe6d2a9, roughness: 0.56 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 8.4, 8), mastMaterial);
    mast.position.set(0, 4.45, 0.55);
    this.rigPose.add(mast);
    this.boomPivot.position.set(0, 1.14, 0.55);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 4.7, 8), mastMaterial);
    boom.rotation.x = Math.PI / 2;
    boom.position.z = -2.3;
    this.boomPivot.add(boom);
    this.rigPose.add(this.boomPivot);

    const sailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLuff: { value: 0 },
        uStall: { value: 0 },
        uAttached: { value: 1 },
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
        varying vec2 vUv;
        varying float vShade;
        void main() {
          vec3 cloth = vec3(0.91, 0.87, 0.73);
          cloth = mix(cloth, vec3(0.82, 0.56, 0.32), uStall * 0.3);
          cloth += vShade * 0.42;
          float seam = smoothstep(0.965, 0.99, fract(vUv.y * 5.0));
          cloth -= seam * 0.035;
          gl_FragColor = vec4(cloth, 0.93 + uAttached * 0.05 - uLuff * 0.04);
        }
      `,
    }) as SailMaterial;
    const sail = new THREE.Mesh(createSailGeometry(), sailMaterial);
    sail.position.y = 0.06;
    this.boomPivot.add(sail);
    this.createTelltales();

    this.headsailMaterial = sailMaterial.clone() as SailMaterial;
    this.headsailPivot.position.set(0, 0.7, 0.55);
    const headsail = new THREE.Mesh(
      createHeadsailGeometry(),
      this.headsailMaterial,
    );
    this.headsailPivot.add(headsail);
    this.headsailPivot.visible = false;
    this.rigPose.add(this.headsailPivot);

    const pennant = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.7, 3),
      new THREE.MeshBasicMaterial({ color: 0xd75f37 }),
    );
    pennant.rotation.z = -Math.PI / 2;
    pennant.position.set(-0.34, 8.38, 0.55);
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
        new THREE.Vector3(0.04, placement.y, placement.z - 0.42),
        new THREE.Vector3(0.06, placement.y, placement.z - 0.76),
      ]);
      const material = new THREE.LineBasicMaterial({ color: colors[index], linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      line.userData.anchor = placement;
      this.boomPivot.add(line);
      this.telltales.push(line);
    });
  }

  private updateTelltales(sail: SailDiagnostics, time: number): void {
    this.telltales.forEach((line, index) => {
      const anchor = line.userData.anchor as { y: number; z: number };
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const luffWave = Math.sin(time * 19 + index * 2.3) * sail.luff;
      const stallDroop = sail.stall * 0.28;
      positions.setXYZ(0, 0, anchor.y, anchor.z);
      positions.setXYZ(1, luffWave * 0.18, anchor.y - stallDroop * 0.35, anchor.z - 0.4);
      positions.setXYZ(2, luffWave * 0.32, anchor.y - stallDroop, anchor.z - 0.78 + sail.attached * -0.12);
      positions.needsUpdate = true;
    });
  }

  private createWakeLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(150 * 3), 3));
    geometry.setDrawRange(0, 0);
    return new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xe4f2ed,
        transparent: true,
        opacity: 0.28,
      }),
    );
  }

  private updateWake(state: BoatState): void {
    this.wakeCenter.set(state.position.x, 0.08, state.position.y);
    const speed = Math.hypot(state.velocity.x, state.velocity.y);
    if (speed < 0.18) return;
    if (
      this.hasLastWakeCenter &&
      this.wakeCenter.distanceToSquared(this.lastWakeCenter) < 0.16
    ) return;
    this.lastWakeCenter.copy(this.wakeCenter);
    this.hasLastWakeCenter = true;
    const starboardX = Math.cos(state.heading);
    const starboardZ = -Math.sin(state.heading);
    const sternX = this.wakeCenter.x - Math.sin(state.heading) * 2.45;
    const sternZ = this.wakeCenter.z - Math.cos(state.heading) * 2.45;
    this.wakeTracks[0].push(new THREE.Vector3(sternX - starboardX * 0.72, 0.08, sternZ - starboardZ * 0.72));
    this.wakeTracks[1].push(new THREE.Vector3(sternX + starboardX * 0.72, 0.08, sternZ + starboardZ * 0.72));
    for (let index = 0; index < 2; index += 1) {
      const track = this.wakeTracks[index]!;
      const line = this.wakeLines[index]!;
      if (track.length > 18) track.shift();
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      track.forEach((point, pointIndex) => positions.setXYZ(pointIndex, point.x, point.y, point.z));
      positions.needsUpdate = true;
      line.geometry.setDrawRange(0, track.length);
      (line.material as THREE.LineBasicMaterial).opacity = Math.min(
        0.09 + speed * 0.035,
        0.24,
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

  private updateWater(weather: WeatherSnapshot, x: number, z: number): void {
    this.water.position.set(Math.round(x / 20) * 20, 0, Math.round(z / 20) * 20);
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
    if (object.kind === "buoy") {
      const buoy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.58, 1.7, 8),
        new THREE.MeshStandardMaterial({
          color: 0xd65b38,
          flatShading: true,
        }),
      );
      buoy.position.y = 0.7;
      group.add(buoy);
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
        new THREE.BoxGeometry(13, 0.34, 2.2),
        deckMaterial,
      );
      deck.position.y = 0.45;
      group.add(deck);
      for (const x of [-5.5, -1.8, 1.8, 5.5]) {
        for (const z of [-0.8, 0.8]) {
          const piling = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.2, 2.2, 7),
            deckMaterial,
          );
          piling.position.set(x, -0.15, z);
          group.add(piling);
        }
      }
      return;
    }

    if (object.kind === "cabin") {
      const coveLand = new THREE.Mesh(
        new THREE.CylinderGeometry(70, 90, 10, 13),
        new THREE.MeshStandardMaterial({
          color: 0x7f8f70,
          roughness: 0.96,
          flatShading: true,
        }),
      );
      coveLand.position.set(50, 0, -30);
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
        tree.position.set(
          50 + Math.sin(index * 2.3) * (18 + (index % 4) * 10),
          10,
          -30 + Math.cos(index * 2.3) * (16 + (index % 5) * 9),
        );
        group.add(tree);
      }
      return;
    }

    const isBeaconHeadland = object.id === "beacon-west-headland";
    const islandRadius =
      object.kind === "lighthouse" ? 62 : isBeaconHeadland ? 88 : 55;
    const islandHeight =
      isBeaconHeadland ? 18 : object.kind === "lighthouse" ? 13 : 7.5;
    const cinematicLandmark = isBeaconHeadland || object.kind === "lighthouse";
    let summitY = islandHeight;
    if (cinematicLandmark) {
      const shoreShelf = new THREE.Mesh(
        new THREE.CylinderGeometry(
          islandRadius * 0.94,
          islandRadius * 1.08,
          4.4,
          13,
        ),
        rockMaterial,
      );
      shoreShelf.position.y = 0.35;
      shoreShelf.rotation.y = 0.18;
      group.add(shoreShelf);

      const cliff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(islandRadius, 1),
        rockMaterial,
      );
      cliff.scale.set(
        0.94,
        (islandHeight / islandRadius) * 0.56,
        isBeaconHeadland ? 0.74 : 0.82,
      );
      cliff.position.y = islandHeight * 0.56;
      cliff.rotation.set(0.03, isBeaconHeadland ? -0.22 : 0.12, -0.025);
      group.add(cliff);

      const capHeight = isBeaconHeadland ? 3.6 : 3;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          islandRadius * 0.64,
          islandRadius * 0.73,
          capHeight,
          13,
        ),
        islandMaterial,
      );
      summitY = islandHeight * 1.03 + capHeight * 0.5;
      cap.position.y = summitY - capHeight * 0.5;
      cap.rotation.y = -0.15;
      group.add(cap);
      this.addRockFringe(
        group,
        isBeaconHeadland ? 24 : 17,
        islandRadius,
        rockMaterial,
        isBeaconHeadland ? 3.4 : 5.7,
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
      isBeaconHeadland ? 38 : object.kind === "lighthouse" ? 23 : 18,
      islandRadius * (cinematicLandmark ? 0.62 : 0.74),
      islandRadius * (isBeaconHeadland ? 0.48 : 0.62),
      cinematicLandmark ? summitY : 7.5,
      pineMaterial,
      isBeaconHeadland ? 1.9 : object.kind === "lighthouse" ? 4.6 : 7.2,
    );
    if (object.kind === "lighthouse") {
      const towerX = 12;
      const towerZ = -4;
      const towerHeight = 25;
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
      const towerCenterY = summitY + towerHeight * 0.5 - 0.25;
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
        stripe.position.set(towerX, summitY + offset, towerZ);
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
      gallery.position.set(towerX, summitY + towerHeight + 0.2, towerZ);
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
      lantern.position.set(towerX, summitY + towerHeight + 1.6, towerZ);
      group.add(lantern);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, 2.2, 10),
        new THREE.MeshStandardMaterial({
          color: 0x263943,
          roughness: 0.82,
          flatShading: true,
        }),
      );
      roof.position.set(towerX, summitY + towerHeight + 3.85, towerZ);
      group.add(roof);
      const lamp = new THREE.PointLight(0xffd884, 16, 80);
      lamp.position.set(towerX, summitY + towerHeight + 1.6, towerZ);
      group.add(lamp);
    }
  }

  private addRockFringe(
    group: THREE.Group,
    count: number,
    radius: number,
    material: THREE.Material,
    seed: number,
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
      position.set(
        Math.sin(phase) * radius * spread,
        1.2 + (index % 4) * 0.52,
        Math.cos(phase) * radius * spread * 0.82,
      );
      euler.set(
        (index % 3) * 0.08,
        phase * 0.73,
        ((index + 1) % 3) * 0.06,
      );
      rotation.setFromEuler(euler);
      const size = 0.58 + (index % 6) * 0.14;
      scale.set(size * 1.18, size * 0.62, size * 0.92);
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
  ): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x594330,
      emissive: 0x17110d,
      emissiveIntensity: 0.18,
      roughness: 1,
      flatShading: true,
    });
    const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.38, 4.2, 6);
    const crownGeometries = [
      new THREE.ConeGeometry(3.5, 6.2, 6),
      new THREE.ConeGeometry(2.9, 5.4, 6),
      new THREE.ConeGeometry(2.3, 4.6, 6),
    ];
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
    const crowns = crownGeometries.map(
      (geometry) => new THREE.InstancedMesh(geometry, crownMaterial, count),
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
      const treeBase = baseY + (1 - radial) * 1.2;
      const x = Math.sin(phase) * radiusX * radial;
      const z = Math.cos(phase) * radiusZ * radial;
      euler.set(0, phase * 0.37, 0);
      rotation.setFromEuler(euler);

      position.set(x, treeBase + 2.05 * height, z);
      scale.set(height, height, height);
      matrix.compose(position, rotation, scale);
      trunks.setMatrixAt(index, matrix);

      for (let layer = 0; layer < crowns.length; layer += 1) {
        const layerScale = height * (1 - layer * 0.05);
        position.set(x, treeBase + (4.7 + layer * 2.65) * height, z);
        scale.set(layerScale, layerScale, layerScale);
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
    this.renderer.xr.enabled = false;
    this.renderer.clippingPlanes = this.reflectionClippingPlanes;
    this.water.visible = false;
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
        (titleScreen ? 30 : 22.5) * boatScale,
        48 * boatScale,
        incidentProgress,
      ) *
      portraitFraming;
    const compositionSide = titleScreen
      ? (portraitTitle ? 14 : 28) * boatScale + titleDrift
      : THREE.MathUtils.lerp(
          7.2 * boatScale,
          14 * boatScale,
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
          (titleScreen ? 12.8 : 9.6) * boatScale,
          24 * boatScale,
          incidentProgress,
        ) +
        (portraitFraming - 1) * 1.4 +
        (titleScreen ? Math.sin(presentationTime * 0.12) * 0.42 : 0),
      z -
        forwardZ * chaseDistance -
        Math.sin(heading) * sideReveal,
    );
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
      forwardX * 5.8 +
      Math.cos(heading) * titleLookSide;
    const normalLookZ =
      z +
      forwardZ * 5.8 -
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

function createHullGeometry(): THREE.BufferGeometry {
  const stations = [
    { z: 3.25, width: 0.04, top: 0.18, bottom: -0.18 },
    { z: 2.0, width: 0.88, top: 0.34, bottom: -0.48 },
    { z: 0.2, width: 1.22, top: 0.36, bottom: -0.68 },
    { z: -1.6, width: 1.08, top: 0.32, bottom: -0.55 },
    { z: -2.75, width: 0.72, top: 0.18, bottom: -0.32 },
  ];
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
    [0, 0.39, 3.22],
    [-0.88, 0.39, 1.95],
    [-1.21, 0.41, 0.15],
    [-1.06, 0.37, -1.58],
    [-0.7, 0.24, -2.72],
    [0.7, 0.24, -2.72],
    [1.06, 0.37, -1.58],
    [1.21, 0.41, 0.15],
    [0.88, 0.39, 1.95],
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
      const chord = (1 - v) * 4.55;
      positions.push(0, v * 7.15, -u * chord);
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
