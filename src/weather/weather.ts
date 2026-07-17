import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import { createRandom } from "./prng";
import { buildWaveComponents } from "./waves";
import {
  cloneWeatherConfig,
  type WeatherConfig,
  type WeatherSnapshot,
} from "./types";

export class WeatherSystem {
  private config: WeatherConfig;
  private noise: NoiseFunction2D;
  private waveKey = "";
  private waves: WeatherSnapshot["waves"] = [];

  constructor(config: WeatherConfig) {
    this.config = cloneWeatherConfig(config);
    this.noise = createNoise2D(createRandom(config.seed));
  }

  setConfig(config: WeatherConfig): void {
    const seedChanged = config.seed !== this.config.seed;
    this.config = cloneWeatherConfig(config);
    if (seedChanged) this.noise = createNoise2D(createRandom(config.seed));
    this.waveKey = "";
  }

  getConfig(): WeatherConfig {
    return cloneWeatherConfig(this.config);
  }

  sample(elapsedSeconds: number): WeatherSnapshot {
    const time = Math.max(0, elapsedSeconds) * clamp(this.config.timeScale, 0, 8);
    const timeOfDay = wrapHours(
      this.config.timeOfDay +
        (this.config.mode === "evolving" ? time / 600 : 0),
    );
    const slow = time * 0.012;
    const evolving = this.config.mode === "evolving" ? 1 : 0;
    const directionShift = this.noise(slow, 17.1) * 13 * evolving;
    const speedShift = this.noise(slow * 0.74, -8.4) * 0.22 * evolving;
    const gustNoise =
      this.noise(time * this.config.wind.gustScale * 0.08, 31.7) * 0.65 +
      this.noise(time * this.config.wind.gustScale * 0.23, -12.2) * 0.35;
    const gust = gustNoise * clamp(this.config.wind.gustStrength, 0, 0.6);
    const windSpeed = Math.max(
      0,
      this.config.wind.speed * (1 + speedShift + gust),
    );
    const windDirectionFromDegrees = wrapDegrees(
      this.config.wind.directionFromDegrees + directionShift,
    );
    const towardRadians = degrees(windDirectionFromDegrees + 180);
    const trueWind = {
      x: Math.sin(towardRadians) * windSpeed,
      y: Math.cos(towardRadians) * windSpeed,
    };
    const waveKey = JSON.stringify([
      this.config.seed,
      this.config.waves,
      Math.round(windSpeed * 4) / 4,
      Math.round(windDirectionFromDegrees),
    ]);
    if (waveKey !== this.waveKey) {
      this.waveKey = waveKey;
      this.waves = buildWaveComponents(
        this.config.waves,
        windSpeed,
        windDirectionFromDegrees,
        this.config.seed,
      );
    }

    const showerPulse = this.config.mode === "evolving"
      ? 0.84 + this.noise(slow * 1.4, 42.8) * 0.16
      : 1;
    return {
      time,
      timeOfDay,
      windSpeed,
      windDirectionFromDegrees,
      trueWind,
      gust,
      rain: clamp(this.config.rain * showerPulse, 0, 1),
      cloud: clamp(this.config.cloud + speedShift * 0.18, 0, 1),
      visibility: clamp(this.config.visibility - this.config.rain * 0.16, 0.35, 1),
      waves: this.waves,
    };
  }
}

function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function wrapHours(value: number): number {
  return ((value % 24) + 24) % 24;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
