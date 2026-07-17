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

export interface WorldObject {
  id: string;
  name: string;
  kind: WorldObjectKind;
  x: number;
  z: number;
  heading?: number;
  collision?: {
    radius: number;
    response: "soft" | "hard";
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
}

export interface WorldDefinition {
  id: string;
  name: string;
  radius: number;
  spawn: { x: number; z: number; heading: number };
  recoverySpawn: { x: number; z: number; heading: number };
  regions: readonly WorldRegion[];
  objects: readonly WorldObject[];
  sampleDepth(x: number, z: number): number;
}

export const FAIR_WINDS_OBJECTS: readonly WorldObject[] = [
  {
    id: "juniper-buoy",
    name: "Juniper buoy",
    kind: "buoy",
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
    x: -520,
    z: 430,
    navigation: {
      description: "Rock, shoal water, and wind-shaped pines",
      visibleRange: 900,
    },
  },
  {
    id: "pine-islet-east-rock",
    name: "East shoal rock",
    kind: "rock",
    x: -472,
    z: 421,
    collision: { radius: 4.8, response: "hard" },
  },
  {
    id: "pine-islet-south-rock",
    name: "South shoal rock",
    kind: "rock",
    x: -535,
    z: 378,
    collision: { radius: 3.6, response: "hard" },
  },
  {
    id: "beacon-west-headland",
    name: "Beacon narrows",
    kind: "waypoint",
    x: 560,
    z: 585,
    navigation: {
      description: "A pine-covered headland across from North light",
      visibleRange: 1_200,
    },
  },
  {
    id: "north-light",
    name: "North light",
    kind: "lighthouse",
    x: 690,
    z: 620,
    collision: { radius: 48, response: "hard" },
    navigation: {
      description: "A lighthouse above the exposed northern reach",
      visibleRange: 1_400,
    },
  },
  {
    id: "juniper-cove-cabin",
    name: "Juniper cove cabin",
    kind: "cabin",
    x: 865,
    z: -410,
    navigation: {
      description: "Sheltered cove and recovery harbor",
      visibleRange: 650,
    },
  },
  {
    id: "juniper-cove-dock",
    name: "Juniper dock",
    kind: "dock",
    x: 825,
    z: -390,
    heading: Math.PI * 0.44,
    collision: { radius: 8, response: "hard" },
  },
];

export const FAIR_WINDS_WORLD: WorldDefinition = {
  id: "fair-winds-basin",
  name: "Fair Winds Basin",
  radius: LAKE_RADIUS,
  spawn: { x: 0, z: 0, heading: 0 },
  recoverySpawn: { x: 90, z: -120, heading: Math.PI * 0.2 },
  regions: [
    {
      id: "school-water",
      name: "School water",
      centerX: 0,
      centerZ: -80,
      radius: 360,
      description: "Deep open water with generous maneuvering room",
      soundscape: "open-water",
    },
    {
      id: "north-passage",
      name: "North passage",
      centerX: -330,
      centerZ: 420,
      radius: 260,
      description: "A navigable channel between rocky pine islands",
      soundscape: "pine-shore",
    },
    {
      id: "lighthouse-reach",
      name: "Lighthouse reach",
      centerX: 590,
      centerZ: 560,
      radius: 310,
      description: "Exposed water below North light",
      soundscape: "exposed-reach",
    },
    {
      id: "juniper-cove",
      name: "Juniper cove",
      centerX: 810,
      centerZ: -390,
      radius: 230,
      description: "Sheltered shallows, dock, and recovery harbor",
      soundscape: "sheltered-cove",
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
