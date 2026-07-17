import { LAKE_RADIUS, sampleLakeDepth } from "./bathymetry";

export type WorldObjectKind =
  | "buoy"
  | "rock"
  | "dock"
  | "lighthouse"
  | "cabin"
  | "waypoint";

export type SoundscapeKind =
  | "open-water"
  | "pine-shore"
  | "exposed-reach"
  | "sheltered-cove";

export type RegionPurpose =
  | "lesson"
  | "navigation"
  | "exploration"
  | "weather"
  | "harbor";

export type ActivityKind = "lesson" | "mission" | "exploration";

export interface WorldObject {
  id: string;
  name: string;
  kind: WorldObjectKind;
  x: number;
  z: number;
  heading?: number;
  buoyMark?: "port" | "starboard" | "training";
  landformId?: string;
  landmarkOffset?: { x: number; z: number };
  collision?: {
    radius: number;
    response: "soft" | "hard";
  };
  docking?: {
    offsetX: number;
    offsetZ: number;
    captureRadius: number;
    maxSpeed: number;
    heading: number;
    headingTolerance: number;
  };
  navigation?: {
    description: string;
    visibleRange: number;
  };
}

export interface WorldRegion {
  id: string;
  name: string;
  centerX: number;
  centerZ: number;
  radius: number;
  description: string;
  soundscape: SoundscapeKind;
  purpose: RegionPurpose;
}

export interface WorldRoute {
  id: string;
  name: string;
  kind: "channel" | "passage";
  minimumDepth: number;
  points: ReadonlyArray<{ x: number; z: number }>;
}

export interface WorldActivity {
  id: string;
  title: string;
  kind: ActivityKind;
  x: number;
  z: number;
  area: string;
  objective: string;
  difficulty: "Intro" | "Easy" | "Moderate" | "Open";
}

export interface WorldDefinition {
  id: string;
  name: string;
  radius: number;
  spawn: { x: number; z: number; heading: number };
  recoverySpawn: { x: number; z: number; heading: number };
  regions: readonly WorldRegion[];
  routes: readonly WorldRoute[];
  activities: readonly WorldActivity[];
  objects: readonly WorldObject[];
  sampleDepth(x: number, z: number): number;
}

export const FAIR_WINDS_OBJECTS: readonly WorldObject[] = [
  {
    id: "juniper-buoy",
    name: "Juniper buoy",
    kind: "buoy",
    buoyMark: "training",
    x: 210,
    z: -310,
    collision: { radius: 0.7, response: "soft" },
    navigation: {
      description: "The first sailing-school turning mark",
      visibleRange: 520,
    },
  },
  {
    id: "pine-islet",
    name: "Pine islet",
    kind: "waypoint",
    x: -650,
    z: 400,
    navigation: {
      description: "Rock, shoal water, and wind-shaped pines",
      visibleRange: 900,
    },
  },
  {
    id: "pine-islet-east-rock",
    name: "East shoal rock",
    kind: "rock",
    x: -586,
    z: 396,
    collision: { radius: 4.8, response: "hard" },
  },
  {
    id: "pine-islet-south-rock",
    name: "South shoal rock",
    kind: "rock",
    x: -662,
    z: 334,
    collision: { radius: 3.6, response: "hard" },
  },
  {
    id: "beacon-west-headland",
    name: "Cedar Head",
    kind: "waypoint",
    x: -320,
    z: 1_300,
    navigation: {
      description: "The western headland of Lantern Channel",
      visibleRange: 1_200,
    },
  },
  {
    id: "north-light",
    name: "North light",
    kind: "lighthouse",
    x: 1_050,
    z: 1_160,
    landmarkOffset: { x: -260, z: -10 },
    collision: { radius: 310, response: "hard" },
    navigation: {
      description: "A lighthouse above the exposed northern reach",
      visibleRange: 1_400,
    },
  },
  {
    id: "lantern-channel-port",
    name: "Lantern port mark",
    kind: "buoy",
    buoyMark: "port",
    x: 510,
    z: 500,
    collision: { radius: 0.7, response: "soft" },
    navigation: {
      description: "Western training mark at the channel entrance",
      visibleRange: 520,
    },
  },
  {
    id: "lantern-channel-starboard",
    name: "Lantern starboard mark",
    kind: "buoy",
    buoyMark: "starboard",
    x: 710,
    z: 505,
    collision: { radius: 0.7, response: "soft" },
    navigation: {
      description: "Eastern training mark at the channel entrance",
      visibleRange: 520,
    },
  },
  {
    id: "juniper-cove-cabin",
    name: "Juniper cove cabin",
    kind: "cabin",
    x: 1_100,
    z: -500,
    landformId: "juniper-cove",
    navigation: {
      description: "Sheltered cove and recovery harbor",
      visibleRange: 650,
    },
  },
  {
    id: "juniper-cove-dock",
    name: "Juniper dock",
    kind: "dock",
    x: 1_040,
    z: -480,
    heading: Math.PI * 0.44,
    collision: { radius: 1.2, response: "hard" },
    docking: {
      offsetX: 0,
      offsetZ: 3.2,
      captureRadius: 4.5,
      maxSpeed: 0.85,
      heading: Math.PI * 0.94,
      headingTolerance: Math.PI / 5,
    },
    navigation: {
      description: "A sheltered teaching harbor with a low-speed visitor berth",
      visibleRange: 760,
    },
  },
  {
    id: "gull-key",
    name: "Gull Key",
    kind: "waypoint",
    x: -930,
    z: -430,
    navigation: {
      description: "A low isolated island on the windward reach",
      visibleRange: 950,
    },
  },
  {
    id: "cedar-point",
    name: "Cedar Point",
    kind: "waypoint",
    x: 1_450,
    z: 200,
    landmarkOffset: { x: -250, z: 20 },
    navigation: {
      description: "A long eastern point sheltering Glasswater Bay",
      visibleRange: 1_050,
    },
  },
];

export const FAIR_WINDS_WORLD: WorldDefinition = {
  id: "fair-winds-basin",
  name: "Fair Winds Basin",
  radius: LAKE_RADIUS,
  spawn: { x: 610, z: 400, heading: 0 },
  recoverySpawn: { x: 610, z: 330, heading: 0 },
  regions: [
    {
      id: "lantern-channel",
      name: "Lantern Channel",
      centerX: 600,
      centerZ: 720,
      radius: 390,
      description: "A broad, deep departure channel between Cedar Head and North Light",
      soundscape: "pine-shore",
      purpose: "lesson",
    },
    {
      id: "school-water",
      name: "School Water",
      centerX: 250,
      centerZ: 50,
      radius: 410,
      description: "Deep open water with room to trim, tack, and gybe",
      soundscape: "open-water",
      purpose: "lesson",
    },
    {
      id: "pine-passage",
      name: "Pine Passage",
      centerX: -650,
      centerZ: 400,
      radius: 300,
      description: "Rocky shores, charted shoals, and a careful island rounding",
      soundscape: "pine-shore",
      purpose: "navigation",
    },
    {
      id: "lighthouse-reach",
      name: "Lighthouse Reach",
      centerX: 450,
      centerZ: 1_120,
      radius: 360,
      description: "Exposed water beyond North Light with a clean fetch",
      soundscape: "exposed-reach",
      purpose: "navigation",
    },
    {
      id: "windward-reach",
      name: "Windward Reach",
      centerX: -760,
      centerZ: -620,
      radius: 430,
      description: "Open fetch for fresh-air, wave, and reefing practice",
      soundscape: "exposed-reach",
      purpose: "weather",
    },
    {
      id: "south-broadwater",
      name: "South Broadwater",
      centerX: 0,
      centerZ: -900,
      radius: 500,
      description: "Long open-water legs with distant shorelines",
      soundscape: "open-water",
      purpose: "exploration",
    },
    {
      id: "juniper-cove",
      name: "Juniper Cove",
      centerX: 1_020,
      centerZ: -450,
      radius: 270,
      description: "Sheltered shallows, dock, and recovery harbor",
      soundscape: "sheltered-cove",
      purpose: "harbor",
    },
    {
      id: "glasswater-bay",
      name: "Glasswater Bay",
      centerX: 1_180,
      centerZ: 40,
      radius: 300,
      description: "Protected eastern water for low-speed sail handling",
      soundscape: "sheltered-cove",
      purpose: "exploration",
    },
  ],
  routes: [
    {
      id: "lantern-channel-route",
      name: "Lantern Channel",
      kind: "channel",
      minimumDepth: 10,
      points: [
        { x: 600, z: 330 },
        { x: 600, z: 500 },
        { x: 580, z: 720 },
        { x: 500, z: 930 },
      ],
    },
    {
      id: "pine-passage-route",
      name: "Pine Passage",
      kind: "passage",
      minimumDepth: 4,
      points: [
        { x: -420, z: 240 },
        { x: -500, z: 350 },
        { x: -510, z: 520 },
        { x: -430, z: 620 },
      ],
    },
  ],
  activities: [
    {
      id: "channel-departure",
      title: "Channel departure",
      kind: "lesson",
      x: 600,
      z: 700,
      area: "Lantern Channel",
      objective: "Hold a steady course between the channel marks while trimming for the reach.",
      difficulty: "Intro",
    },
    {
      id: "school-water-tacks",
      title: "Two clean tacks",
      kind: "lesson",
      x: 250,
      z: 50,
      area: "School Water",
      objective: "Cross the no-go zone twice and rebuild speed on each new tack.",
      difficulty: "Easy",
    },
    {
      id: "pine-passage-rounding",
      title: "Round Pine Islet",
      kind: "mission",
      x: -510,
      z: 520,
      area: "Pine Passage",
      objective: "Use the charted deep side and leave the east shoal rocks clear.",
      difficulty: "Moderate",
    },
    {
      id: "fresh-air-reef",
      title: "Fresh-air reef",
      kind: "lesson",
      x: -760,
      z: -620,
      area: "Windward Reach",
      objective: "Take one reef, settle the boat, and maintain attached flow in waves.",
      difficulty: "Moderate",
    },
    {
      id: "north-light-rounding",
      title: "Round North Light",
      kind: "mission",
      x: 450,
      z: 950,
      area: "Lighthouse Reach",
      objective: "Exit Lantern Channel and round the lighthouse with safe offing.",
      difficulty: "Moderate",
    },
    {
      id: "juniper-arrival",
      title: "Juniper arrival",
      kind: "mission",
      x: 1_035,
      z: -470,
      area: "Juniper Cove",
      objective: "Enter the sheltered cove under control and dock at the visitor berth below 1.7 kn.",
      difficulty: "Moderate",
    },
    {
      id: "broadwater-crossing",
      title: "Broadwater crossing",
      kind: "exploration",
      x: 0,
      z: -1_050,
      area: "South Broadwater",
      objective: "Choose your point of sail and make a long open-water passage.",
      difficulty: "Open",
    },
  ],
  objects: FAIR_WINDS_OBJECTS,
  sampleDepth: sampleLakeDepth,
};

export function navigationObjects(
  world: WorldDefinition,
): readonly WorldObject[] {
  return world.objects.filter((object) => object.navigation);
}

export function worldObjectFeaturePosition(
  object: WorldObject,
): { x: number; z: number } {
  return {
    x: object.x + (object.landmarkOffset?.x ?? 0),
    z: object.z + (object.landmarkOffset?.z ?? 0),
  };
}
