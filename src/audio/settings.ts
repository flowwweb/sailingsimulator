import { MUSIC_TRACKS } from "./music";

export type AudioChannel =
  | "master"
  | "music"
  | "ambience"
  | "boat"
  | "weather";

export interface AudioSettings {
  muted: boolean;
  musicEnabled: boolean;
  trackId: string;
  volumes: Record<AudioChannel, number>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AUDIO_SETTINGS_STORAGE_KEY = "fair-winds-audio";

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  musicEnabled: true,
  trackId: MUSIC_TRACKS[0]!.id,
  volumes: {
    master: 0.76,
    music: 0.38,
    ambience: 0.9,
    boat: 0.86,
    weather: 0.78,
  },
};

export function loadAudioSettings(
  storage: StorageLike | undefined = browserStorage(),
): AudioSettings {
  if (!storage) return cloneAudioSettings(DEFAULT_AUDIO_SETTINGS);
  try {
    const stored = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    return stored
      ? sanitizeAudioSettings(JSON.parse(stored))
      : cloneAudioSettings(DEFAULT_AUDIO_SETTINGS);
  } catch {
    return cloneAudioSettings(DEFAULT_AUDIO_SETTINGS);
  }
}

export function saveAudioSettings(
  settings: AudioSettings,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      AUDIO_SETTINGS_STORAGE_KEY,
      JSON.stringify(sanitizeAudioSettings(settings)),
    );
  } catch {
    // Audio remains usable when storage is unavailable or full.
  }
}

export function sanitizeAudioSettings(value: unknown): AudioSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<AudioSettings>)
      : {};
  const volumes =
    candidate.volumes && typeof candidate.volumes === "object"
      ? (candidate.volumes as Partial<Record<AudioChannel, unknown>>)
      : ({} as Partial<Record<AudioChannel, unknown>>);
  const trackId =
    typeof candidate.trackId === "string" &&
    MUSIC_TRACKS.some((track) => track.id === candidate.trackId)
      ? candidate.trackId
      : DEFAULT_AUDIO_SETTINGS.trackId;

  return {
    muted:
      typeof candidate.muted === "boolean"
        ? candidate.muted
        : DEFAULT_AUDIO_SETTINGS.muted,
    musicEnabled:
      typeof candidate.musicEnabled === "boolean"
        ? candidate.musicEnabled
        : DEFAULT_AUDIO_SETTINGS.musicEnabled,
    trackId,
    volumes: {
      master: sanitizeVolume(volumes.master, "master"),
      music: sanitizeVolume(volumes.music, "music"),
      ambience: sanitizeVolume(volumes.ambience, "ambience"),
      boat: sanitizeVolume(volumes.boat, "boat"),
      weather: sanitizeVolume(volumes.weather, "weather"),
    },
  };
}

export function cloneAudioSettings(settings: AudioSettings): AudioSettings {
  return {
    ...settings,
    volumes: { ...settings.volumes },
  };
}

function sanitizeVolume(
  value: unknown,
  channel: AudioChannel,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, 0, 1)
    : DEFAULT_AUDIO_SETTINGS.volumes[channel];
}

function browserStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
