import type { BoatState } from "../sim/model";
import type { BoatDefinition } from "../sim/boats";
import {
  FAIR_WINDS_WORLD,
  type WorldDefinition,
  type WorldObject,
} from "./world-definition";

export type IncidentKind = "clear" | "touch" | "grounding" | "collision";
export type IncidentSeverity = "none" | "touch" | "stranded" | "impact";

export interface IncidentResult {
  kind: IncidentKind;
  severity: IncidentSeverity;
  point: { x: number; z: number };
  speed: number;
  depth?: number;
  draft?: number;
  clearance?: number;
  object?: WorldObject;
}

const DYNAMIC_GROUNDING_CLEARANCE = 0.08;

export function evaluateIncident(
  state: BoatState,
  boat: BoatDefinition,
  world: WorldDefinition = FAIR_WINDS_WORLD,
  waterLevel = 0,
): IncidentResult {
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  const collision = evaluateObjectCollision(state, boat, world, speed);
  if (collision) return collision;

  const grounding = evaluateGrounding(state, boat, world, speed, waterLevel);
  if (grounding) return grounding;

  return {
    kind: "clear",
    severity: "none",
    point: { x: state.position.x, z: state.position.y },
    speed,
  };
}

function evaluateGrounding(
  state: BoatState,
  boat: BoatDefinition,
  world: WorldDefinition,
  speed: number,
  waterLevel: number,
): IncidentResult | undefined {
  const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  const sampleOffsets = [
    boat.collision.halfLength * 0.82,
    0,
    -boat.collision.halfLength * 0.76,
  ];
  let minimumDepth = Number.POSITIVE_INFINITY;
  let minimumPoint = { x: state.position.x, z: state.position.y };

  for (const offset of sampleOffsets) {
    const point = {
      x: state.position.x + forward.x * offset,
      z: state.position.y + forward.z * offset,
    };
    const depth = Math.max(0, world.sampleDepth(point.x, point.z) + waterLevel);
    if (depth >= minimumDepth) continue;
    minimumDepth = depth;
    minimumPoint = point;
  }

  const clearance = minimumDepth - boat.hull.draft;
  if (clearance > DYNAMIC_GROUNDING_CLEARANCE) return undefined;

  return {
    kind: "grounding",
    severity: speed >= 2.2 ? "impact" : "stranded",
    point: minimumPoint,
    speed,
    depth: minimumDepth,
    draft: boat.hull.draft,
    clearance,
  };
}

function evaluateObjectCollision(
  state: BoatState,
  boat: BoatDefinition,
  world: WorldDefinition,
  speed: number,
): IncidentResult | undefined {
  const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  const segmentStart = {
    x: state.position.x - forward.x * boat.collision.halfLength,
    z: state.position.y - forward.z * boat.collision.halfLength,
  };
  const segmentEnd = {
    x: state.position.x + forward.x * boat.collision.halfLength,
    z: state.position.y + forward.z * boat.collision.halfLength,
  };

  for (const object of world.objects) {
    if (!object.collision) continue;
    const distance = distanceToSegment(
      { x: object.x, z: object.z },
      segmentStart,
      segmentEnd,
    );
    const contactDistance =
      object.collision.radius + boat.collision.halfBeam * 0.82;
    if (distance > contactDistance) continue;

    const softTouch =
      object.collision.response === "soft" && speed < 1.5;
    return {
      kind: softTouch ? "touch" : "collision",
      severity: softTouch ? "touch" : "impact",
      point: { x: object.x, z: object.z },
      speed,
      object,
    };
  }

  return undefined;
}

function distanceToSegment(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared < 1e-8) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }
  const projection = Math.min(
    Math.max(
      ((point.x - start.x) * segmentX +
        (point.z - start.z) * segmentZ) /
        lengthSquared,
      0,
    ),
    1,
  );
  const closestX = start.x + segmentX * projection;
  const closestZ = start.z + segmentZ * projection;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}
