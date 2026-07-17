import type { WorldObject } from "../game/world-definition";

export interface BuoyVisualSpec {
  color: number;
  chartColor: string;
  topmark: "can" | "cone" | "sphere";
}

export function buoyVisualSpec(
  buoyMark: WorldObject["buoyMark"],
): BuoyVisualSpec {
  if (buoyMark === "starboard") {
    return { color: 0x2f8a63, chartColor: "#3f9d70", topmark: "cone" };
  }
  if (buoyMark === "port") {
    return { color: 0xc9503f, chartColor: "#ca5947", topmark: "can" };
  }
  return { color: 0xd78935, chartColor: "#d9933f", topmark: "sphere" };
}
