export interface TrafficPose {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface TrafficCommand {
  heading: number;
  speed: number;
  giveWay: boolean;
}

export interface EncounterAdvisory {
  type: "clear" | "head-on" | "crossing" | "overtaking";
  role: "clear" | "give-way" | "stand-on";
  distance: number;
  advice: string;
}

export function sailableRouteHeading(
  routeHeading: number,
  windFrom: number,
  preferredTack: number,
): number {
  const relative = wrapAngle(routeHeading - windFrom);
  const noGo = (42 * Math.PI) / 180;
  if (Math.abs(relative) >= noGo) return wrapAngle(routeHeading);
  return wrapAngle(windFrom + Math.sign(preferredTack || 1) * noGo);
}

export function trafficCommand(
  npc: TrafficPose,
  player: TrafficPose,
  routeHeading: number,
  polarSpeed: number,
  dt: number,
): TrafficCommand {
  const dx = player.x - npc.x;
  const dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  const bearing = wrapAngle(Math.atan2(dx, dz) - npc.heading);
  const reciprocal = Math.abs(wrapAngle(player.heading - npc.heading));
  const closing = distance < 150 && Math.cos(bearing) > 0.25;
  const headOn = closing && reciprocal > Math.PI * 0.72;
  const crossingFromStarboard = closing && bearing > 0.08 && bearing < Math.PI * 0.72;
  const giveWay = headOn || crossingFromStarboard;
  const desiredHeading = giveWay
    ? wrapAngle(routeHeading + (headOn ? 0.48 : 0.36))
    : routeHeading;
  const maxTurn = (giveWay ? 0.34 : 0.18) * Math.max(dt, 0);
  const heading = wrapAngle(
    npc.heading + clamp(wrapAngle(desiredHeading - npc.heading), -maxTurn, maxTurn),
  );
  return {
    heading,
    speed: Math.max(0.35, polarSpeed * (giveWay ? 0.62 : 0.82)),
    giveWay,
  };
}

export function classifyEncounter(
  own: TrafficPose,
  other: TrafficPose,
  advisoryRange = 180,
): EncounterAdvisory {
  const dx = other.x - own.x;
  const dz = other.z - own.z;
  const distance = Math.hypot(dx, dz);
  const bearing = wrapAngle(Math.atan2(dx, dz) - own.heading);
  const reciprocal = Math.abs(wrapAngle(other.heading - own.heading));
  const unitX = distance > 0 ? dx / distance : 0;
  const unitZ = distance > 0 ? dz / distance : 0;
  const ownVelocity = {
    x: Math.sin(own.heading) * own.speed,
    z: Math.cos(own.heading) * own.speed,
  };
  const otherVelocity = {
    x: Math.sin(other.heading) * other.speed,
    z: Math.cos(other.heading) * other.speed,
  };
  const rangeRate =
    (otherVelocity.x - ownVelocity.x) * unitX +
    (otherVelocity.z - ownVelocity.z) * unitZ;
  const result = (
    type: EncounterAdvisory["type"],
    role: EncounterAdvisory["role"],
    advice: string,
  ): EncounterAdvisory => ({ type, role, distance, advice });
  if (distance > advisoryRange || rangeRate >= -0.15) {
    return result("clear", "clear", "Traffic clear");
  }
  if (
    reciprocal < (30 * Math.PI) / 180 &&
    Math.abs(bearing) < (35 * Math.PI) / 180 &&
    own.speed > other.speed + 0.15
  ) {
    return result(
      "overtaking",
      "give-way",
      "Overtaking · keep clear and pass with room",
    );
  }
  if (
    reciprocal > (150 * Math.PI) / 180 &&
    Math.abs(bearing) < (28 * Math.PI) / 180
  ) {
    return result(
      "head-on",
      "give-way",
      "Head-on · alter course to starboard early",
    );
  }
  if (bearing > 0 && bearing < (112.5 * Math.PI) / 180) {
    return result(
      "crossing",
      "give-way",
      "Give way · traffic is on your starboard side",
    );
  }
  return result(
    "crossing",
    "stand-on",
    "Stand on · hold a predictable course and watch",
  );
}

export function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
