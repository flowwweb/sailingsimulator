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

export function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
