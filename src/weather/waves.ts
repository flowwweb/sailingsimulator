import { createRandom } from "./prng";
import type { WaveComponent, WaveSettings } from "./types";

export interface WaveSample {
  height: number;
  slopeX: number;
  slopeZ: number;
  verticalVelocity: number;
}

const GRAVITY = 9.81;
export const WAVE_COMPONENT_COUNT = 6;

export function buildWaveComponents(
  settings: WaveSettings,
  windSpeed: number,
  windDirectionFromDegrees: number,
  seed: number,
): readonly WaveComponent[] {
  const random = createRandom(seed ^ 0x5f3759df);
  const linked = settings.mode === "linked";
  const significantHeight = linked
    ? clamp(0.06 + windSpeed * windSpeed * 0.009, 0.06, 2.4)
    : clamp(settings.height, 0.03, 4);
  const baseLength = linked
    ? clamp(6 + windSpeed * 2.65, 7, 68)
    : clamp(settings.length, 4, 90);
  const directionFrom = linked
    ? windDirectionFromDegrees
    : settings.directionFromDegrees;
  const travelDirection = degrees(directionFrom + 180);
  // A broad, non-harmonic spectrum prevents the lake reading as one repeated
  // train of evenly spaced swells while retaining deterministic CPU/GPU waves.
  const weights = [0.25, 0.18, 0.21, 0.12, 0.15, 0.09] as const;
  const lengthBands = [1, 0.57, 0.78, 0.39, 0.66, 0.29] as const;
  const directionOffsets = [0, -11, 8, 23, -27, 38] as const;
  const amplitudeScale =
    significantHeight /
    (4 *
      Math.sqrt(
        weights.reduce(
          (total, weight) => total + weight * weight,
          0,
        ) / 2,
      ));
  const baseSteepness = linked
    ? clamp(0.13 + windSpeed * 0.027, 0.14, 0.52)
    : settings.steepness;

  return weights.map((weight, index) => {
    const spread = (random() - 0.5) * degrees(10 + index * 3);
    const direction =
      travelDirection + degrees(directionOffsets[index]!) + spread;
    const wavelength =
      baseLength * lengthBands[index]! * (0.91 + random() * 0.18);
    const waveNumber = (Math.PI * 2) / wavelength;
    return {
      amplitude: amplitudeScale * weight,
      wavelength,
      directionX: Math.sin(direction),
      directionZ: Math.cos(direction),
      angularFrequency: Math.sqrt(GRAVITY * waveNumber),
      phase: random() * Math.PI * 2,
      steepness: clamp(
        baseSteepness * (0.82 + random() * 0.28),
        0.04,
        0.62,
      ),
    };
  });
}

export function sampleWaves(
  components: readonly WaveComponent[],
  worldX: number,
  worldZ: number,
  time: number,
): WaveSample {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let verticalVelocity = 0;

  for (const wave of components) {
    const waveNumber = (Math.PI * 2) / wave.wavelength;
    const theta =
      waveNumber * (wave.directionX * worldX + wave.directionZ * worldZ) -
      wave.angularFrequency * time +
      wave.phase;
    const sine = Math.sin(theta);
    const cosine = Math.cos(theta);
    const secondOrderAmplitude =
      0.5 *
      wave.steepness *
      waveNumber *
      wave.amplitude *
      wave.amplitude;
    const secondSine = Math.sin(theta * 2);
    const secondCosine = Math.cos(theta * 2);
    height +=
      wave.amplitude * sine +
      secondOrderAmplitude * secondSine;
    const slopeMagnitude =
      waveNumber *
      (wave.amplitude * cosine +
        2 * secondOrderAmplitude * secondCosine);
    slopeX += slopeMagnitude * wave.directionX;
    slopeZ += slopeMagnitude * wave.directionZ;
    verticalVelocity -=
      wave.angularFrequency *
      (wave.amplitude * cosine +
        2 * secondOrderAmplitude * secondCosine);
  }

  return { height, slopeX, slopeZ, verticalVelocity };
}

export function waveShaderArrays(components: readonly WaveComponent[]): {
  directions: Float32Array;
  amplitudes: Float32Array;
  waveNumbers: Float32Array;
  angularFrequencies: Float32Array;
  phases: Float32Array;
  steepnesses: Float32Array;
} {
  const directions = new Float32Array(WAVE_COMPONENT_COUNT * 2);
  const amplitudes = new Float32Array(WAVE_COMPONENT_COUNT);
  const waveNumbers = new Float32Array(WAVE_COMPONENT_COUNT);
  const angularFrequencies = new Float32Array(WAVE_COMPONENT_COUNT);
  const phases = new Float32Array(WAVE_COMPONENT_COUNT);
  const steepnesses = new Float32Array(WAVE_COMPONENT_COUNT);
  components
    .slice(0, WAVE_COMPONENT_COUNT)
    .forEach((wave, index) => {
    directions[index * 2] = wave.directionX;
    directions[index * 2 + 1] = wave.directionZ;
    amplitudes[index] = wave.amplitude;
    waveNumbers[index] = (Math.PI * 2) / wave.wavelength;
    angularFrequencies[index] = wave.angularFrequency;
    phases[index] = wave.phase;
    steepnesses[index] = wave.steepness;
  });
  return {
    directions,
    amplitudes,
    waveNumbers,
    angularFrequencies,
    phases,
    steepnesses,
  };
}

export function significantWaveHeight(
  components: readonly WaveComponent[],
): number {
  const variance = components.reduce(
    (total, wave) =>
      total + (wave.amplitude * wave.amplitude) / 2,
    0,
  );
  return 4 * Math.sqrt(variance);
}

function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
