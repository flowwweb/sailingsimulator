export interface Vec2 {
  x: number;
  y: number;
}

export interface BoatState {
  position: Vec2;
  velocity: Vec2;
  heading: number;
  yawRate: number;
  rudderAngle: number;
  sheet: number;
  heel: number;
}

export interface Controls {
  rudder: number;
  sheetRate: number;
}

export interface Environment {
  trueWind: Vec2;
}

export interface SailDiagnostics {
  apparentWind: Vec2;
  apparentWindSpeed: number;
  apparentWindAngle: number;
  boomAngle: number;
  idealBoomAngle: number;
  angleOfAttack: number;
  liftCoefficient: number;
  dragCoefficient: number;
  luff: number;
  attached: number;
  stall: number;
  force: Vec2;
  driveForce: number;
  sideForce: number;
}

export interface StepResult {
  state: BoatState;
  sail: SailDiagnostics;
}

const AIR_DENSITY = 1.225;
const SAIL_AREA = 18;
const BOAT_MASS = 1_100;
const YAW_INERTIA = 4_200;
const MIN_BOOM_ANGLE = degrees(5);
const MAX_BOOM_ANGLE = degrees(85);
const DESIGN_ALPHA = degrees(14);
const MAX_RUDDER_ANGLE = degrees(28);

export function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

function magnitude(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function normalized(vector: Vec2): Vec2 {
  const length = magnitude(vector);
  if (length < 1e-8) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function scale(vector: Vec2, scalar: number): Vec2 {
  return { x: vector.x * scalar, y: vector.y * scalar };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function forwardFor(heading: number): Vec2 {
  return { x: Math.sin(heading), y: Math.cos(heading) };
}

function starboardFor(heading: number): Vec2 {
  return { x: Math.cos(heading), y: -Math.sin(heading) };
}

function wrappedAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function createInitialState(): BoatState {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    heading: 0,
    yawRate: 0,
    rudderAngle: 0,
    sheet: 0.52,
    heel: 0,
  };
}

export function sheetForBoomAngle(angle: number): number {
  return clamp((angle - MIN_BOOM_ANGLE) / (MAX_BOOM_ANGLE - MIN_BOOM_ANGLE), 0, 1);
}

export function computeSailAerodynamics(
  state: BoatState,
  environment: Environment,
): SailDiagnostics {
  const forward = forwardFor(state.heading);
  const starboard = starboardFor(state.heading);
  const apparentWind = {
    x: environment.trueWind.x - state.velocity.x,
    y: environment.trueWind.y - state.velocity.y,
  };
  const apparentWindSpeed = magnitude(apparentWind);
  const incoming = scale(apparentWind, -1);
  const apparentWindAngle = wrappedAngle(
    Math.atan2(dot(incoming, starboard), dot(incoming, forward)),
  );
  const absoluteWindAngle = Math.abs(apparentWindAngle);
  const idealBoomAngle = clamp(
    absoluteWindAngle * 0.72 - degrees(18),
    MIN_BOOM_ANGLE,
    MAX_BOOM_ANGLE,
  );
  const boomAngle = lerp(MIN_BOOM_ANGLE, MAX_BOOM_ANGLE, state.sheet);
  const angleOfAttack = DESIGN_ALPHA + idealBoomAngle - boomAngle;
  const alphaDegrees = radiansToDegrees(angleOfAttack);
  const absoluteWindDegrees = radiansToDegrees(absoluteWindAngle);

  const noGo = 1 - smoothstep(28, 42, absoluteWindDegrees);
  const luffFromTrim = 1 - smoothstep(2, 9, alphaDegrees);
  const luff = Math.max(noGo, luffFromTrim);
  const stall = smoothstep(22, 38, alphaDegrees);
  const attached = clamp((1 - luff) * (1 - stall), 0, 1);

  let liftCoefficient: number;
  if (alphaDegrees <= 0) {
    liftCoefficient = 0;
  } else if (alphaDegrees < 8) {
    liftCoefficient = lerp(0, 0.78, alphaDegrees / 8);
  } else if (alphaDegrees < 16) {
    liftCoefficient = lerp(0.78, 1.18, (alphaDegrees - 8) / 8);
  } else if (alphaDegrees < 25) {
    liftCoefficient = lerp(1.18, 0.9, (alphaDegrees - 16) / 9);
  } else {
    liftCoefficient = lerp(0.9, 0.12, smoothstep(25, 50, alphaDegrees));
  }
  liftCoefficient *= 1 - noGo;

  const downwindDrag = smoothstep(105, 165, absoluteWindDegrees) * 0.85;
  const dragCoefficient =
    0.08 + 0.08 * liftCoefficient * liftCoefficient + stall * 0.72 + downwindDrag;
  const dynamicPressure = 0.5 * AIR_DENSITY * apparentWindSpeed * apparentWindSpeed;
  const flowDirection = normalized(apparentWind);
  const liftOption = { x: -flowDirection.y, y: flowDirection.x };
  const liftDirection = dot(liftOption, forward) >= 0 ? liftOption : scale(liftOption, -1);
  const liftForce = scale(liftDirection, dynamicPressure * SAIL_AREA * liftCoefficient);
  const dragForce = scale(flowDirection, dynamicPressure * SAIL_AREA * dragCoefficient);
  const force = add(liftForce, dragForce);

  return {
    apparentWind,
    apparentWindSpeed,
    apparentWindAngle,
    boomAngle,
    idealBoomAngle,
    angleOfAttack,
    liftCoefficient,
    dragCoefficient,
    luff,
    attached,
    stall,
    force,
    driveForce: dot(force, forward),
    sideForce: dot(force, starboard),
  };
}

export function stepBoat(
  previous: BoatState,
  controls: Controls,
  environment: Environment,
  dt: number,
): StepResult {
  const safeDt = clamp(dt, 0, 1 / 20);
  const rudderTarget = clamp(controls.rudder, -1, 1) * MAX_RUDDER_ANGLE;
  const state: BoatState = {
    position: { ...previous.position },
    velocity: { ...previous.velocity },
    heading: previous.heading,
    yawRate: previous.yawRate,
    rudderAngle: damp(previous.rudderAngle, rudderTarget, 7, safeDt),
    sheet: clamp(previous.sheet + controls.sheetRate * safeDt * 0.3, 0, 1),
    heel: previous.heel,
  };

  const sail = computeSailAerodynamics(state, environment);
  const forward = forwardFor(state.heading);
  const starboard = starboardFor(state.heading);
  const surge = dot(state.velocity, forward);
  const sway = dot(state.velocity, starboard);
  const hullForce = add(
    scale(forward, -surge * (95 + Math.abs(surge) * 42)),
    scale(starboard, -sway * (880 + Math.abs(sway) * 520)),
  );
  const totalForce = add(sail.force, hullForce);
  const acceleration = scale(totalForce, 1 / BOAT_MASS);
  state.velocity.x += acceleration.x * safeDt;
  state.velocity.y += acceleration.y * safeDt;

  const waterSpeed = Math.max(Math.abs(surge), 0);
  const rudderSideForce =
    -Math.sin(state.rudderAngle) * waterSpeed * waterSpeed * 250;
  const yawTorque =
    rudderSideForce * 2.4 - sail.sideForce * 0.12 - state.yawRate * 2_800;
  state.yawRate += (yawTorque / YAW_INERTIA) * safeDt;
  state.heading = wrappedAngle(state.heading + state.yawRate * safeDt);
  state.position.x += state.velocity.x * safeDt;
  state.position.y += state.velocity.y * safeDt;

  const targetHeel = clamp(
    Math.atan2(sail.sideForce * 2.1, BOAT_MASS * 9.81 * 0.72),
    degrees(-24),
    degrees(24),
  );
  state.heel = damp(state.heel, targetHeel, 2.4, safeDt);

  return { state, sail: computeSailAerodynamics(state, environment) };
}

export function pointOfSail(angle: number): string {
  const value = Math.abs(radiansToDegrees(angle));
  if (value < 40) return "No-go zone";
  if (value < 55) return "Close-hauled";
  if (value < 80) return "Close reach";
  if (value < 110) return "Beam reach";
  if (value < 155) return "Broad reach";
  return "Run";
}
