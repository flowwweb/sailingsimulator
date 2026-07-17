import { describe, expect, it } from "vitest";
import {
  MUSIC_TRACKS,
  findMusicTrack,
  musicPlaybackStatus,
} from "./music";

describe("music playlist", () => {
  it("uses unique world-themed track identifiers and sources", () => {
    expect(MUSIC_TRACKS).toHaveLength(6);
    expect(new Set(MUSIC_TRACKS.map((track) => track.id)).size).toBe(6);
    expect(new Set(MUSIC_TRACKS.map((track) => track.source)).size).toBe(6);
    expect(MUSIC_TRACKS.every((track) => track.source.endsWith(".mp3"))).toBe(
      true,
    );
  });

  it("finds tracks by their persisted identifier", () => {
    expect(findMusicTrack("juniper-cove")?.title).toBe("Juniper Cove");
    expect(findMusicTrack("missing")).toBeUndefined();
  });

  it("does not promise autoplay when music was persisted as disabled", () => {
    const track = MUSIC_TRACKS[0]!;

    expect(musicPlaybackStatus(track, false, false, false)).toBe(
      "Open-water theme · Music paused",
    );
    expect(musicPlaybackStatus(track, false, false, true)).toBe(
      "Open-water theme · Starts after Set Sail",
    );
  });
});
