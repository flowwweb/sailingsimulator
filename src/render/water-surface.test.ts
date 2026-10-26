import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWaterSurface, updateWaterSurface } from "./water-surface";
import { DEFAULT_WEATHER, cloneWeatherConfig } from "../weather/types";
import { WeatherSystem } from "../weather/weather";
import { sampleWaves, significantWaveHeight, waveShaderArrays } from "../weather/waves";

function surface(compact = false) {
  return createWaterSurface({ reflectionTexture: new THREE.Texture(), reflectionMatrix: new THREE.Matrix4(), compact });
}

describe("Mediterranean water renderer contract", () => {
  it("retains every wave uniform, second-order displacement and world-space phase", () => {
    const water = surface();
    const weather = new WeatherSystem(DEFAULT_WEATHER).sample(37);
    updateWaterSurface(water, weather, 53, -47, new THREE.Matrix4());
    const u = water.material.uniforms;
    const arrays = waveShaderArrays(weather.waves);
    expect(u.uWaveDirection!.value).toEqual(arrays.directions);
    expect(u.uWaveAmplitude!.value).toEqual(arrays.amplitudes);
    expect(u.uWaveNumber!.value).toEqual(arrays.waveNumbers);
    expect(u.uWaveFrequency!.value).toEqual(arrays.angularFrequencies);
    expect(u.uWavePhase!.value).toEqual(arrays.phases);
    expect(u.uWaveSteepness!.value).toEqual(arrays.steepnesses);
    expect(u.uSignificantWaveHeight!.value).toBe(significantWaveHeight(weather.waves));
    expect(u.uTide!.value).toBe(weather.tideLevel);
    expect(water.position.toArray()).toEqual([60, weather.tideLevel, -40]);
    expect(u.uTime!.value).toBe(weather.time);
    expect(water.material.vertexShader).toContain("secondOrderAmplitude * sin(theta * 2.0)");
    expect(water.material.vertexShader).toContain("dot(uWaveDirection[i], world.xz)");
  });

  it("keeps CPU and shader wave arithmetic in offline parity across wind bands", () => {
    const points = [[0, 0], [1.3, -8.7], [-17.1, 48.2], [400, -300]] as const;
    for (const speed of [1, 6, 14]) {
      const config = cloneWeatherConfig(DEFAULT_WEATHER);
      config.wind = { ...config.wind, speed, directionFromDegrees: 90, gustStrength: 0 };
      config.waves = { ...config.waves, mode: "linked" };
      const weather = new WeatherSystem(config).sample(7.25);
      const arrays = waveShaderArrays(weather.waves);
      for (const [x, z] of points) {
        const cpu = sampleWaves(weather.waves, x, z, weather.time);
        let height = 0;
        let slopeX = 0;
        let slopeZ = 0;
        for (let index = 0; index < 6; index += 1) {
          const directionX = arrays.directions[index * 2]!;
          const directionZ = arrays.directions[index * 2 + 1]!;
          const amplitude = arrays.amplitudes[index]!;
          const waveNumber = arrays.waveNumbers[index]!;
          const theta = waveNumber * (directionX * x + directionZ * z) -
            arrays.angularFrequencies[index]! * weather.time + arrays.phases[index]!;
          const secondOrderAmplitude = 0.5 * arrays.steepnesses[index]! * waveNumber * amplitude * amplitude;
          height += amplitude * Math.sin(theta) + secondOrderAmplitude * Math.sin(theta * 2);
          const slope = waveNumber * (amplitude * Math.cos(theta) + 2 * secondOrderAmplitude * Math.cos(theta * 2));
          slopeX += slope * directionX;
          slopeZ += slope * directionZ;
        }
        expect(height).toBeCloseTo(cpu.height, 5);
        expect(slopeX).toBeCloseTo(cpu.slopeX, 5);
        expect(slopeZ).toBeCloseTo(cpu.slopeZ, 5);
      }
    }
  });

  it("refreshes settings but reuses arrays between identical wave snapshots", () => {
    const water = surface();
    const weather = new WeatherSystem(DEFAULT_WEATHER).sample(8);
    updateWaterSurface(water, weather, 0, 0, new THREE.Matrix4());
    const array = water.material.uniforms.uWaveAmplitude!.value;
    updateWaterSurface(water, weather, 100, 0, new THREE.Matrix4());
    expect(water.material.uniforms.uWaveAmplitude!.value).toBe(array);
    const changed = { ...weather, trueWind: { x: 0, y: -12 }, waves: weather.waves.map(wave => ({ ...wave, amplitude: wave.amplitude * 2 })) };
    updateWaterSurface(water, changed, 100, 0, new THREE.Matrix4());
    expect(water.material.uniforms.uWaveAmplitude!.value).not.toBe(array);
    expect(water.material.uniforms.uWindVector!.value.toArray()).toEqual([0, -12]);
    expect(water.material.uniforms.uSignificantWaveHeight!.value).toBeCloseTo(significantWaveHeight(weather.waves) * 2);
  });

  it("preserves reflection object identity and masks the transformed hull", () => {
    const reflectionTexture = new THREE.Texture();
    const reflectionMatrix = new THREE.Matrix4();
    const water = createWaterSurface({ reflectionTexture, reflectionMatrix, compact: true });
    const pose = new THREE.Matrix4().compose(new THREE.Vector3(82, 1.4, -27), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 1.3, -0.45)), new THREE.Vector3(0.8, 1.2, 1.2));
    const original = pose.clone();
    updateWaterSurface(water, new WeatherSystem(DEFAULT_WEATHER).sample(30), 82, -27, pose);
    const local = new THREE.Vector3(0.3, 0.1, -0.8);
    const restored = local.clone().applyMatrix4(pose).applyMatrix4(water.material.uniforms.uHullWorldToLocal!.value);
    expect(restored.distanceTo(local)).toBeLessThan(1e-10);
    expect(pose.equals(original)).toBe(true);
    expect(water.material.uniforms.uReflectionTexture!.value).toBe(reflectionTexture);
    expect(water.material.uniforms.uReflectionMatrix!.value).toBe(reflectionMatrix);
    expect(water.material.uniforms.uHullMask!.value).toBe(1);
  });

  it("keeps bounded compact geometry and uses the renderer output transforms", () => {
    const desktop = surface();
    const compact = surface(true);
    expect(desktop.geometry.getAttribute("position").count).toBe(221 ** 2);
    expect(compact.geometry.getAttribute("position").count).toBe(169 ** 2);
    expect(desktop.material.fragmentShader).toContain("#include <tonemapping_fragment>");
    expect(desktop.material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(desktop.material.depthWrite).toBe(true);
  });

  it("fades shoal shelf depths into basin depth at the shelf edge", () => {
    const fragment = surface().material.fragmentShader;
    expect(fragment).toContain("uShoalShelfRadius[index] * 0.8");
    expect(fragment).toContain("depth = mix(depth, min(depth, shelfDepth), shelfBlend);");
  });

  it("keeps fine sunlit ripples and crisp reflected detail", () => {
    const fragment = surface().material.fragmentShader;
    expect(fragment).toContain("0.07 + smoothstep(0.2, 10.0, windSpeed) * 0.17");
    expect(fragment).toContain("mix(smoothNormal, faceNormal, 0.08 + uTitle * 0.08)");
    expect(fragment).toContain("vec3(0.86, 0.92, 1.0), vec3(0.7, 0.82, 1.0)");
    expect(fragment).toContain("vec3 sceneReflection = texture2D(uReflectionTexture, reflectionUv).rgb;");
    expect(fragment).not.toContain("reflectionBlur");
    expect(fragment).toContain("alongWind * 2.2 - uTime * 0.36, acrossWind * 1.45");
    expect(fragment).toContain("float broadGlint = pow(sunAlignment, 96.0) * 0.1;");
    expect(fragment).toContain("float fineGlint = pow(sunAlignment, 420.0) * 1.2;");
    const previousGlint = (alignment: number) => 0.14 * alignment ** 48 + 0.65 * alignment ** 180;
    const revisedGlint = (alignment: number) => 0.1 * alignment ** 96 + 1.2 * alignment ** 420;
    expect(revisedGlint(0.95)).toBeLessThan(previousGlint(0.95) * 0.07);
    expect(revisedGlint(0.995)).toBeLessThan(previousGlint(0.995));
    expect(revisedGlint(1)).toBeGreaterThan(previousGlint(1));
    expect(fragment.match(/texture2D\(uReflectionTexture/g)).toHaveLength(1);
  });
});
