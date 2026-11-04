import type { BoatState, Vec2 } from "../sim/model";

/** A deliberately simplified sand-bottom training model, not a holding prediction. */
export interface AnchorState {
  position: Vec2;
  rode: number;
  setSeconds: number;
  set: boolean;
  dragging: boolean;
  draggedDistance: number;
}

export interface AnchorStep {
  anchor: AnchorState;
  boat: BoatState;
  scope: number;
  tension: number;
}

const BOW_HEIGHT = 0.6;
const SET_TIME = 3;
const MIN_SCOPE = 5;
const HOLD_ACCELERATION = 0.6;

export function bowPosition(boat: BoatState, halfLength: number): Vec2 {
  return {
    x: boat.position.x + Math.sin(boat.heading) * halfLength,
    y: boat.position.y + Math.cos(boat.heading) * halfLength,
  };
}

/** Call only after a safe-depth, low-speed approach; depth is the current water depth. */
export function dropAnchor(boat: BoatState, halfLength: number, depth: number): AnchorState {
  return {
    position: bowPosition(boat, halfLength),
    rode: Math.max(depth + BOW_HEIGHT, 0),
    setSeconds: 0,
    set: false,
    dragging: false,
    draggedDistance: 0,
  };
}

export function payOutRode(anchor: AnchorState, meters: number): AnchorState {
  return { ...anchor, rode: Math.max(0, anchor.rode + Math.max(0, meters)) };
}

/** A spring-damper transmits a taut rode's load to the boat and drags the anchor under excess load. */
export function stepAnchor(
  anchor: AnchorState, boat: BoatState, halfLength: number, depth: number, dt: number,
): AnchorStep {
  const step = Math.max(0, dt);
  const height = Math.max(0.1, depth + BOW_HEIGHT);
  const scope = anchor.rode / height;
  const bow = bowPosition(boat, halfLength);
  const dx = bow.x - anchor.position.x;
  const dy = bow.y - anchor.position.y;
  const distance = Math.hypot(dx, dy);
  const nx = distance > 0 ? dx / distance : 0;
  const ny = distance > 0 ? dy / distance : 0;
  const horizontalRode = Math.sqrt(Math.max(0, anchor.rode ** 2 - height ** 2));
  const stretch = Math.max(0, distance - horizontalRode);
  const outwardSpeed = boat.velocity.x * nx + boat.velocity.y * ny;
  const tension = stretch > 0 ? Math.max(0, 0.8 * stretch + 1.2 * outwardSpeed) : 0;
  const setSeconds = scope >= MIN_SCOPE && tension > 0.025 && tension < 0.5
    ? anchor.setSeconds + step : 0;
  const set = anchor.set || setSeconds >= SET_TIME;
  const capacity = scope < MIN_SCOPE ? 0.08 : set ? HOLD_ACCELERATION : 0.5;
  const applied = Math.min(tension, capacity);
  const slip = Math.max(0, tension - capacity) * step * 0.8;
  const nextAnchor: AnchorState = {
    ...anchor,
    position: { x: anchor.position.x + nx * slip, y: anchor.position.y + ny * slip },
    setSeconds: slip > 0 ? 0 : setSeconds,
    set: slip > 0 ? false : set,
    dragging: slip > 0,
    draggedDistance: anchor.draggedDistance + slip,
  };
  return {
    anchor: nextAnchor,
    boat: { ...boat, velocity: { x: boat.velocity.x - nx * applied * step, y: boat.velocity.y - ny * applied * step } },
    scope,
    tension,
  };
}



