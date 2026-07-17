import { describe, expect, it } from "vitest";
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  sanitizeAudioSettings,
  saveAudioSettings,
} from "./settings";

describe("audio settings", () => {
  it("clamps volumes and rejects unknown tracks", () => {
    const settings = sanitizeAudioSettings({
      muted: true,
      musicEnabled: false,
      trackId: "not-a-track",
      volumes: {
        master: 3,
        music: -1,
        ambience: 0.42,
        boat: Number.NaN,
        weather: 0.25,
      },
    });

    expect(settings.muted).toBe(true);
    expect(settings.musicEnabled).toBe(false);
    expect(settings.trackId).toBe(DEFAULT_AUDIO_SETTINGS.trackId);
    expect(settings.volumes.master).toBe(1);
    expect(settings.volumes.music).toBe(0);
    expect(settings.volumes.ambience).toBe(0.42);
    expect(settings.volumes.boat).toBe(DEFAULT_AUDIO_SETTINGS.volumes.boat);
    expect(settings.volumes.weather).toBe(0.25);
  });

  it("persists and reloads independent channel volumes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const settings = {
      ...DEFAULT_AUDIO_SETTINGS,
      trackId: "north-light",
      volumes: {
        ...DEFAULT_AUDIO_SETTINGS.volumes,
        music: 0.19,
        ambience: 0.64,
      },
    };

    saveAudioSettings(settings, storage);

    expect(values.has(AUDIO_SETTINGS_STORAGE_KEY)).toBe(true);
    expect(loadAudioSettings(storage)).toEqual(settings);
  });
});
