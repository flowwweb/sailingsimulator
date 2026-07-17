export interface MusicTrack {
  id: string;
  title: string;
  setting: string;
  source: string;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: "fair-winds",
    title: "Fair Winds",
    setting: "Open-water theme",
    source: "/music/fair-winds.mp3",
  },
  {
    id: "juniper-cove",
    title: "Juniper Cove",
    setting: "Sheltered harbor",
    source: "/music/juniper-cove.mp3",
  },
  {
    id: "north-light",
    title: "North Light",
    setting: "The exposed northern reach",
    source: "/music/north-light.mp3",
  },
  {
    id: "pine-passage",
    title: "Pine Passage",
    setting: "Between the wooded islands",
    source: "/music/pine-passage.mp3",
  },
  {
    id: "school-water",
    title: "School Water",
    setting: "The first sail",
    source: "/music/school-water.mp3",
  },
  {
    id: "blue-hour-basin",
    title: "Blue Hour on the Basin",
    setting: "Evening on the lake",
    source: "/music/blue-hour-basin.mp3",
  },
];

export function findMusicTrack(id: string): MusicTrack | undefined {
  return MUSIC_TRACKS.find((track) => track.id === id);
}

export function musicPlaybackStatus(
  track: MusicTrack,
  isPlaying: boolean,
  isReady: boolean,
  isEnabled: boolean,
): string {
  if (isPlaying) return `${track.setting} · Playing`;
  if (!isEnabled) return `${track.setting} · Music paused`;
  if (isReady) return `${track.setting} · Paused`;
  return `${track.setting} · Starts after Set Sail`;
}
