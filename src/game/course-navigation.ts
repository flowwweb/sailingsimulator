export interface CourseMetrics {
  distance: number;
  bearingDegrees: number;
  courseErrorDegrees: number;
  vmg: number;
  etaSeconds?: number;
}

export function courseMetrics(
  position: { x: number; y: number },
  velocity: { x: number; y: number },
  headingRadians: number,
  target: { x: number; z: number },
): CourseMetrics {
  const dx = target.x - position.x;
  const dz = target.z - position.y;
  const distance = Math.hypot(dx, dz);
  const bearingRadians = Math.atan2(dx, dz);
  const directionX = distance > 0 ? dx / distance : 0;
  const directionZ = distance > 0 ? dz / distance : 0;
  const vmg = velocity.x * directionX + velocity.y * directionZ;
  return {
    distance,
    bearingDegrees: normalizeDegrees(toDegrees(bearingRadians)),
    courseErrorDegrees: toDegrees(wrapAngle(bearingRadians - headingRadians)),
    vmg,
    etaSeconds: vmg > 0.1 ? distance / vmg : undefined,
  };
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
