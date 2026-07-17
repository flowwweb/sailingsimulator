export type WeatherMode = "manual" | "evolving";
export type WaveMode = "linked" | "manual";

export interface WindSettings {
  speed: number;
  directionFromDegrees: number;
  gustStrength: number;
  gustScale: number;
}

export interface WaveSettings {
  mode: WaveMode;
  height: number;
  length: number;
  steepness: number;
  directionFromDegrees: number;
}

export interface TideSettings {
  /** Peak-to-trough water-level change in metres. */
  range: number;
  periodHours: number;
  phaseHours: number;
}

export type SeaStateId =
  | "calm"
  | "light"
  | "moderate"
  | "fresh"
  | "rough"
  | "storm";

export interface SeaStatePreset {
  id: SeaStateId;
  label: string;
  description: string;
  height: number;
  length: number;
  steepness: number;
}

export interface WeatherConfig {
  mode: WeatherMode;
  seed: number;
  timeScale: number;
  timeOfDay: number;
  wind: WindSettings;
  waves: WaveSettings;
  tide: TideSettings;
  rain: number;
  cloud: number;
  visibility: number;
}

export interface WaveComponent {
  amplitude: number;
  wavelength: number;
  directionX: number;
  directionZ: number;
  angularFrequency: number;
  phase: number;
  steepness: number;
}

export interface WeatherSnapshot {
  time: number;
  timeOfDay: number;
  windSpeed: number;
  windDirectionFromDegrees: number;
  trueWind: { x: number; y: number };
  gust: number;
  rain: number;
  cloud: number;
  visibility: number;
  tideLevel: number;
  tideTrend: "rising" | "falling";
  waves: readonly WaveComponent[];
}

export const DEFAULT_WEATHER: WeatherConfig = {
  mode: "manual",
  seed: 8_143,
  timeScale: 1,
  timeOfDay: 13.8,
  wind: {
    speed: 7.5,
    directionFromDegrees: 90,
    gustStrength: 0.12,
    gustScale: 0.55,
  },
  waves: {
    mode: "linked",
    height: 0.3,
    length: 22,
    steepness: 0.25,
    directionFromDegrees: 90,
  },
  tide: {
    range: 1.2,
    periodHours: 12.42,
    phaseHours: 2.4,
  },
  rain: 0,
  cloud: 0.22,
  visibility: 1,
};

export const SEA_STATE_PRESETS: readonly SeaStatePreset[] = [
  {
    id: "calm",
    label: "Calm",
    description: "Glassy water with long, low undulation.",
    height: 0.08,
    length: 8,
    steepness: 0.1,
  },
  {
    id: "light",
    label: "Light chop",
    description: "Small wavelets with a gentle boat response.",
    height: 0.28,
    length: 13,
    steepness: 0.2,
  },
  {
    id: "moderate",
    label: "Moderate",
    description: "Developed lake waves that make trim and steering active.",
    height: 0.65,
    length: 22,
    steepness: 0.32,
  },
  {
    id: "fresh",
    label: "Fresh",
    description: "Steeper crests with clear pitch, roll, and heave.",
    height: 1.25,
    length: 34,
    steepness: 0.4,
  },
  {
    id: "rough",
    label: "Rough",
    description: "Large lake or coastal waves requiring conservative sailing.",
    height: 2.2,
    length: 52,
    steepness: 0.48,
  },
  {
    id: "storm",
    label: "Storm",
    description: "Extreme test conditions near the simulator safety limit.",
    height: 3.5,
    length: 76,
    steepness: 0.56,
  },
];

export const WEATHER_PRESETS: Readonly<Record<string, WeatherConfig>> = {
  "Fair winds": DEFAULT_WEATHER,
  "Light air": {
    ...DEFAULT_WEATHER,
    seed: 2_101,
    wind: { ...DEFAULT_WEATHER.wind, speed: 4, gustStrength: 0.08 },
    timeOfDay: 9.4,
    cloud: 0.08,
  },
  "Fresh breeze": {
    ...DEFAULT_WEATHER,
    seed: 5_907,
    wind: { ...DEFAULT_WEATHER.wind, speed: 10.5, gustStrength: 0.2 },
    timeOfDay: 13.6,
    cloud: 0.36,
  },
  "Passing shower": {
    ...DEFAULT_WEATHER,
    seed: 7_733,
    mode: "evolving",
    wind: { ...DEFAULT_WEATHER.wind, speed: 8.5, gustStrength: 0.26 },
    timeOfDay: 18.1,
    rain: 0.62,
    cloud: 0.78,
    visibility: 0.72,
  },
};

export function cloneWeatherConfig(config: WeatherConfig): WeatherConfig {
  return {
    ...config,
    wind: { ...config.wind },
    waves: { ...config.waves },
    tide: { ...config.tide },
  };
}
