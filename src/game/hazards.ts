import { wrappedAngle, type BoatState } from "../sim/model";
import { HARBOR_20, type BoatDefinition } from "../sim/boats";
import { evaluateDocking } from "./docking";
import { depthAtTide } from "./bathymetry";
import {
  FAIR_WINDS_WORLD,
  type WorldDefinition,
  type WorldObject,
} from "./world-definition";

export type IncidentKind =
  | "clear"
  | "touch"
  | "docking"
  | "grounding"
  | "collision";
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
  contactPose?: Pick<BoatState, "position" | "heading"> & Partial<Pick<BoatState, "heave">>;
}

const DYNAMIC_GROUNDING_CLEARANCE = 0.08;

export function evaluateIncident(
  state: BoatState,
  boat: BoatDefinition,
  world: WorldDefinition = FAIR_WINDS_WORLD,
  waterLevel = 0,
  departingDock?: WorldObject,
  previous: BoatState = state,
): IncidentResult {
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  const docking = evaluateDocking(state, boat, world, departingDock);
  if (docking) {
    return {
      kind: "docking",
      severity: "none",
      point: docking.point,
      speed,
      object: docking.object,
    };
  }
  const collision = evaluateObjectCollision(state, boat, world, speed, previous, waterLevel);
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
    const depth = depthAtTide(world.sampleDepth(point.x, point.z), waterLevel);
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
  previous: BoatState,
  waterLevel: number,
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
    if ("box" in object.collision) {
      const quayTime = sweptQuayContact(previous, state, boat, object);
      const solid = sweptTownSolidContact(previous, state, boat, object, waterLevel);
      const time = Math.min(quayTime ?? Infinity, solid?.time ?? Infinity);
      if (Number.isFinite(time)) return {
        kind: "collision", severity: "impact", speed, object,
        contactPose: {
          position: { x: previous.position.x + (state.position.x - previous.position.x) * time,
            y: previous.position.y + (state.position.y - previous.position.y) * time },
          heading: wrappedAngle(previous.heading + wrappedAngle(state.heading - previous.heading) * time),
          ...(solid && solid.time === time ? { heave: previous.heave + (state.heave - previous.heave) * time } : {}),
        },
        point: solid && solid.time === time ? solid.point : {
          x: object.x + object.collision.box.x * Math.cos(object.heading ?? 0) + object.collision.box.z * Math.sin(object.heading ?? 0),
          z: object.z - object.collision.box.x * Math.sin(object.heading ?? 0) + object.collision.box.z * Math.cos(object.heading ?? 0),
        },
      };
      continue;
    }
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

function hullContactEnvelope(boat: BoatDefinition) {
  const scale = boat.hull.length / HARBOR_20.hull.length;
  // Bound the authored hull through roll/pitch, including the settling impact pose.
  const halfBeam = Math.hypot(1.38 * boat.hull.beam / HARBOR_20.hull.beam, 0.9 * scale);
  return { halfBeam, halfLength: Math.hypot(3.15 * scale, halfBeam), scale };
}

function sweptTownSolidContact(
  previous: BoatState, next: BoatState, boat: BoatDefinition, object: WorldObject, waterLevel: number,
): { time: number; point: { x: number; z: number } } | undefined {
  if (!object.collision || !("box" in object.collision) || !object.collision.solids) return undefined;
  const yaw = object.heading ?? 0, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const local = (state: BoatState) => ({
    x: (state.position.x - object.x) * cos - (state.position.y - object.z) * sin,
    z: (state.position.x - object.x) * sin + (state.position.y - object.z) * cos,
  });
  const start = local(previous), end = local(next), heading = previous.heading - yaw;
  const forward = { x: Math.sin(heading), z: Math.cos(heading) }, side = { x: forward.z, z: -forward.x };
  const { halfBeam, halfLength, scale } = hullContactEnvelope(boat);
  const turn = wrappedAngle(next.heading - previous.heading);
  const rotationSweep = 2 * Math.hypot(halfLength, halfBeam) * Math.sin(Math.abs(turn) / 2);
  const maxPitch = Math.min(Math.PI / 2, Math.max(Math.abs(previous.wavePitch), Math.abs(next.wavePitch)));
  const halfHeight = halfBeam + 3.15 * scale * Math.sin(maxPitch);
  let first: ReturnType<typeof sweptTownSolidContact>;
  for (const solid of object.collision.solids) {
    let enter = 0, exit = first?.time ?? 1;
    const slab = (position: number, travel: number, min: number, max: number) => {
      if (Math.abs(travel) < 1e-12) return position >= min && position <= max;
      const a = (min - position) / travel, b = (max - position) / travel;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      return enter <= exit;
    };
    if (!slab(waterLevel + previous.heave, next.heave - previous.heave,
      solid.minY - halfHeight - 0.001, solid.maxY + halfHeight + 0.001)) continue;
    const axes = [side, forward, ...solid.footprint.map((point, i) => {
      const nextPoint = solid.footprint[(i + 1) % solid.footprint.length]!;
      const x = point.z - nextPoint.z, z = nextPoint.x - point.x, length = Math.hypot(x, z);
      return { x: x / length, z: z / length };
    })];
    const intersects = axes.every(axis => {
      const extent = halfBeam * Math.abs(side.x * axis.x + side.z * axis.z)
        + halfLength * Math.abs(forward.x * axis.x + forward.z * axis.z) + rotationSweep + 0.001;
      const projected = solid.footprint.map(point => point.x * axis.x + point.z * axis.z);
      return slab(start.x * axis.x + start.z * axis.z, (end.x - start.x) * axis.x + (end.z - start.z) * axis.z,
        Math.min(...projected) - extent, Math.max(...projected) + extent);
    });
    if (intersects) first = { time: enter, point: { x: object.x + solid.x * cos + solid.z * sin,
      z: object.z - solid.x * sin + solid.z * cos } };
  }
  return first;
}

function sweptQuayContact(
  previous: BoatState,
  next: BoatState,
  boat: BoatDefinition,
  object: WorldObject,
): number | undefined {
  if (!object.collision || !("box" in object.collision)) return undefined;
  const box = object.collision.box;
  const yaw = object.heading ?? 0, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const centerX = object.x + box.x * cos + box.z * sin;
  const centerZ = object.z - box.x * sin + box.z * cos;
  const forward = { x: Math.sin(previous.heading), z: Math.cos(previous.heading) };
  const side = { x: forward.z, z: -forward.x };
  const quaySide = { x: cos, z: -sin }, quayForward = { x: sin, z: cos };
  const { halfBeam, halfLength } = hullContactEnvelope(boat);
  const turn = wrappedAngle(next.heading - previous.heading);
  const rotationSweep = 2 * Math.hypot(halfLength, halfBeam) * Math.sin(Math.abs(turn) / 2);
  const dx = next.position.x - previous.position.x, dz = next.position.y - previous.position.y;
  let enter = 0, exit = 1;
  for (const axis of [side, forward, quaySide, quayForward]) {
    const extent = halfBeam * Math.abs(side.x * axis.x + side.z * axis.z)
      + halfLength * Math.abs(forward.x * axis.x + forward.z * axis.z)
      + box.width / 2 * Math.abs(quaySide.x * axis.x + quaySide.z * axis.z)
      + box.depth / 2 * Math.abs(quayForward.x * axis.x + quayForward.z * axis.z)
      + rotationSweep + 0.001;
    const start = (previous.position.x - centerX) * axis.x + (previous.position.y - centerZ) * axis.z;
    const travel = dx * axis.x + dz * axis.z;
    if (Math.abs(travel) < 1e-12) {
      if (Math.abs(start) > extent) return undefined;
    } else {
      const a = (-extent - start) / travel, b = (extent - start) / travel;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return undefined;
    }
  }
  return enter;
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
