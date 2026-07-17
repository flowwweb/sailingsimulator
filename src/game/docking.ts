import type { BoatDefinition } from "../sim/boats";
import type { BoatState } from "../sim/model";
import type {
  WorldDefinition,
  WorldObject,
} from "./world-definition";

export interface DockingResult {
  object: WorldObject;
  point: { x: number; z: number };
  heading: number;
  speed: number;
}

export function evaluateDocking(
  state: BoatState,
  _boat: BoatDefinition,
  world: WorldDefinition,
): DockingResult | undefined {
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  for (const object of world.objects) {
    if (!object.docking || speed > object.docking.maxSpeed) continue;
    const point = dockingPoint(object);
    if (
      Math.hypot(
        state.position.x - point.x,
        state.position.y - point.z,
      ) > object.docking.captureRadius
    ) {
      continue;
    }
    const heading = nearestDockHeading(
      state.heading,
      object.docking.heading,
    );
    if (
      Math.abs(wrappedAngle(state.heading - heading)) >
      object.docking.headingTolerance
    ) {
      continue;
    }
    return { object, point, heading, speed };
  }
  return undefined;
}

export function dockingPoint(
  object: WorldObject,
): { x: number; z: number } {
  const docking = object.docking;
  if (!docking) return { x: object.x, z: object.z };
  const rotation = object.heading ?? 0;
  return {
    x:
      object.x +
      docking.offsetX * Math.cos(rotation) +
      docking.offsetZ * Math.sin(rotation),
    z:
      object.z -
      docking.offsetX * Math.sin(rotation) +
      docking.offsetZ * Math.cos(rotation),
  };
}

export function mooredBoatState(
  state: BoatState,
  docking: DockingResult,
): BoatState {
  return {
    ...state,
    position: { x: docking.point.x, y: docking.point.z },
    heading: docking.heading,
    velocity: { x: 0, y: 0 },
    yawRate: 0,
    rudderAngle: 0,
  };
}

function nearestDockHeading(current: number, dockHeading: number): number {
  const forward = current + wrappedAngle(dockHeading - current);
  const reverseHeading = dockHeading + Math.PI;
  const reverse = current + wrappedAngle(reverseHeading - current);
  return Math.abs(forward - current) <= Math.abs(reverse - current)
    ? wrappedAngle(forward)
    : wrappedAngle(reverse);
}

function wrappedAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
