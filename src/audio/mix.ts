import type { BoatState, SailDiagnostics } from "../sim/model";
import type { WeatherSnapshot } from "../weather/types";
import type { SoundscapeSnapshot } from "./zones";

export interface AudioMixTargets {
  wind: number;
  openWater: number;
  shore: number;
  hull: number;
  luff: number;
  stall: number;
  rain: number;
  boatMotion: number;
  birdActivity: number;
  waterbirdShare: number;
  dockActivity: number;
}

export function computeAudioMixTargets(
  weather: WeatherSnapshot,
  state: BoatState,
  sail: SailDiagnostics,
  soundscape: SoundscapeSnapshot,
): AudioMixTargets {
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  const speedFactor = smoothstep(0.18, 5.8, speed);
  const windFactor = smoothstep(1.2, 12, sail.apparentWindSpeed);
  const waveEnergy = clamp(
    weather.waves.reduce(
      (total, component) => total + Math.abs(component.amplitude),
      0,
    ) * 2.2,
    0,
    1,
  );
  const waveMotion = clamp(
    Math.abs(state.heaveVelocity) * 0.42 +
      Math.abs(state.wavePitchVelocity) * 1.15 +
      Math.abs(state.waveRollVelocity) * 0.95,
    0,
    1,
  );
  const sailLoad = smoothstep(
    120,
    2_400,
    Math.hypot(sail.force.x, sail.force.y),
  );
  const rainMask = 1 - weather.rain * 0.5;
  const shelter = 1 - soundscape.shelter * 0.58;
  const gustEnergy = 1 + Math.abs(weather.gust) * 0.42;
  const movementGate = smoothstep(0.025, 0.16, speed + waveMotion);

  const flutterPhase =
    0.5 +
    Math.sin(weather.time * 8.7) * 0.3 +
    Math.sin(weather.time * 13.1 + 1.7) * 0.2;
  const flutterPulse = 0.18 + smoothstep(0.46, 0.9, flutterPhase) * 0.82;
  const luffGate =
    smoothstep(0.5, 0.88, sail.luff) *
    smoothstep(2, 6.2, sail.apparentWindSpeed);

  const daytime =
    weather.timeOfDay >= 5.2 && weather.timeOfDay <= 21.2 ? 1 : 0.12;
  const wildlifeWeather = clamp(
    (1 - weather.rain * 0.9) * (1 - weather.cloud * 0.14),
    0.05,
    1,
  );
  const birdActivity = clamp(
    (soundscape.songbirds * 0.82 + soundscape.waterbirds * 0.58) *
      daytime *
      wildlifeWeather,
    0,
    1,
  );
  const birdTotal = soundscape.songbirds + soundscape.waterbirds;

  return {
    wind: clamp(
      (0.004 + windFactor * 0.028) * shelter * gustEnergy,
      0,
      0.034,
    ),
    openWater:
      (0.0055 + waveEnergy * 0.0055) *
      soundscape.openWater *
      (1 - weather.rain * 0.28),
    shore:
      (0.0025 + waveEnergy * 0.0045) *
      soundscape.shore *
      rainMask,
    hull:
      movementGate *
      (speedFactor * 0.025 + waveMotion * 0.009 + sailLoad * 0.003),
    luff: clamp(
      (0.007 + windFactor * 0.027) * luffGate * flutterPulse,
      0,
      0.034,
    ),
    stall:
      smoothstep(0.52, 0.9, sail.stall) *
      windFactor *
      (0.004 + windFactor * 0.009),
    rain: Math.pow(weather.rain, 1.2) * 0.055,
    boatMotion: clamp(
      waveMotion * 0.64 +
        Math.abs(state.heel) * 1.4 +
        sailLoad * 0.25 +
        speedFactor * 0.18,
      0,
      1,
    ),
    birdActivity,
    waterbirdShare:
      birdTotal > 0 ? soundscape.waterbirds / birdTotal : 0,
    dockActivity: soundscape.dock * (1 - weather.rain * 0.45),
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
