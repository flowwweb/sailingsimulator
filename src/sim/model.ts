import {
  HARBOR_20,
  getSailDefinition,
  type BoatDefinition,
  type SailDefinition,
} from "./boats";

export interface Vec2 {
  x: number;
  y: number;
}

export type SailSide = -1 | 1;

export interface BoatState {
  position: Vec2;
  velocity: Vec2;
  heading: number;
  yawRate: number;
  rudderAngle: number;
  sheet: number;
  boomAngle: number;
  headsailSheet: number;
  headsailAngle: number;
  sailSide: SailSide;
  tackCount: number;
  heel: number;
  heave: number;
  heaveVelocity: number;
  wavePitch: number;
  wavePitchVelocity: number;
  waveRoll: number;
  waveRollVelocity: number;
}

export interface Controls {
  rudder: number;
  sheetRate: number;
  headsailRate?: number;
}

export interface WavePoseTarget {
  heave: number;
  pitch: number;
  roll: number;
  heaveVelocity?: number;
  pitchVelocity?: number;
  rollVelocity?: number;
}

export interface Environment {
  trueWind: Vec2;
  wavePose?: WavePoseTarget;
  boat?: BoatDefinition;
}

export interface SailDiagnostics {
  apparentWind: Vec2;
  apparentWindSpeed: number;
  apparentWindAngle: number;
  boomAngle: number;
  desiredBoomAngle: number;
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

export interface HydroDiagnostics {
  forwardSpeed: number;
  leewaySpeed: number;
  hullDrag: Vec2;
  keelForce: Vec2;
  rudderForce: Vec2;
  rudderSideForce: number;
  ironsRecoveryTorque: number;
  yawTorque: number;
  targetHeel: number;
}

export interface StepResult {
  state: BoatState;
  sail: SailDiagnostics;
  headsail?: SailDiagnostics;
  hydro: HydroDiagnostics;
}

const AIR_DENSITY = 1.225;
const MIN_BOOM_ANGLE = degrees(5);
const MAX_BOOM_ANGLE = degrees(85);
const BOOM_BASE_RATE = degrees(42);
const IRONS_RECOVERY_TORQUE = 18;

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

function moveToward(current: number, target: number, maximumDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
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

function add(...vectors: Vec2[]): Vec2 {
  return vectors.reduce(
    (total, vector) => ({ x: total.x + vector.x, y: total.y + vector.y }),
    { x: 0, y: 0 },
  );
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

function desiredBoomFor(
  apparentWindAngle: number,
  sheet: number,
  previousSide: SailSide,
): number {
  const absoluteWindAngle = Math.abs(apparentWindAngle);
  const maxOpening = lerp(MIN_BOOM_ANGLE, MAX_BOOM_ANGLE, sheet);
  const windFreeOpening = clamp(
    absoluteWindAngle - degrees(8),
    MIN_BOOM_ANGLE,
    MAX_BOOM_ANGLE,
  );
  const windSide = Math.abs(apparentWindAngle) > degrees(4)
    ? Math.sign(apparentWindAngle)
    : -previousSide;
  const leewardSide = (windSide > 0 ? -1 : 1) as SailSide;
  return leewardSide * Math.min(maxOpening, windFreeOpening);
}

function apparentWindFor(state: BoatState, environment: Environment): {
  vector: Vec2;
  speed: number;
  angle: number;
} {
  const forward = forwardFor(state.heading);
  const starboard = starboardFor(state.heading);
  const vector = {
    x: environment.trueWind.x - state.velocity.x,
    y: environment.trueWind.y - state.velocity.y,
  };
  const incoming = scale(vector, -1);
  return {
    vector,
    speed: magnitude(vector),
    angle: wrappedAngle(Math.atan2(dot(incoming, starboard), dot(incoming, forward))),
  };
}

export function createInitialState(): BoatState {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    heading: 0,
    yawRate: 0,
    rudderAngle: 0,
    sheet: 0.52,
    boomAngle: -degrees(46.6),
    headsailSheet: 0.52,
    headsailAngle: -degrees(46.6),
    sailSide: -1,
    tackCount: 0,
    heel: 0,
    heave: 0,
    heaveVelocity: 0,
    wavePitch: 0,
    wavePitchVelocity: 0,
    waveRoll: 0,
    waveRollVelocity: 0,
  };
}

export function sheetForBoomAngle(angle: number): number {
  return clamp((Math.abs(angle) - MIN_BOOM_ANGLE) / (MAX_BOOM_ANGLE - MIN_BOOM_ANGLE), 0, 1);
}

export function computeSailAerodynamics(
  state: BoatState,
  environment: Environment,
): SailDiagnostics {
  const boat = environment.boat ?? HARBOR_20;
  const mainsail = getSailDefinition(boat, "mainsail");
  if (!mainsail) throw new Error(`Boat ${boat.id} has no mainsail definition.`);
  return computeSailElementAerodynamics(
    state,
    environment,
    mainsail,
    state.boomAngle,
    state.sheet,
  );
}

export function computeHeadsailAerodynamics(
  state: BoatState,
  environment: Environment,
): SailDiagnostics | undefined {
  const boat = environment.boat ?? HARBOR_20;
  const headsail = getSailDefinition(boat, "headsail");
  if (!headsail) return undefined;
  return computeSailElementAerodynamics(
    state,
    environment,
    headsail,
    state.headsailAngle,
    state.headsailSheet,
  );
}

function computeSailElementAerodynamics(
  state: BoatState,
  environment: Environment,
  sailDefinition: SailDefinition,
  sailAngle: number,
  sheet: number,
): SailDiagnostics {
  const forward = forwardFor(state.heading);
  const starboard = starboardFor(state.heading);
  const apparent = apparentWindFor(state, environment);
  const absoluteWindAngle = Math.abs(apparent.angle);
  const idealBoomAngle = clamp(
    absoluteWindAngle * 0.72 - degrees(18),
    MIN_BOOM_ANGLE,
    MAX_BOOM_ANGLE,
  );
  const boomOpening = Math.abs(sailAngle);
  const desiredBoomAngle = desiredBoomFor(
    apparent.angle,
    sheet,
    state.sailSide,
  );
  const angleOfAttack =
    degrees(sailDefinition.designAngleDegrees) +
    idealBoomAngle -
    boomOpening;
  const alphaDegrees = radiansToDegrees(angleOfAttack);
  const absoluteWindDegrees = radiansToDegrees(absoluteWindAngle);

  const noGo = 1 - smoothstep(28, 42, absoluteWindDegrees);
  const luffFromTrim = 1 - smoothstep(2, 9, alphaDegrees);
  const wrongSide = Math.sign(desiredBoomAngle) !== Math.sign(sailAngle)
    ? smoothstep(3, 18, Math.abs(radiansToDegrees(sailAngle)))
    : 0;
  const luff = Math.max(noGo, luffFromTrim, wrongSide * 0.92);
  const stall = smoothstep(22, 38, alphaDegrees) * (1 - noGo);
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
  liftCoefficient *= (1 - noGo) * (1 - wrongSide * 0.82);

  const downwindDrag = smoothstep(105, 165, absoluteWindDegrees) * 0.85;
  const dragCoefficient =
    0.08 + 0.08 * liftCoefficient * liftCoefficient + stall * 0.72 + downwindDrag;
  const dynamicPressure = 0.5 * AIR_DENSITY * apparent.speed * apparent.speed;
  const flowDirection = normalized(apparent.vector);
  const liftOption = { x: -flowDirection.y, y: flowDirection.x };
  const liftDirection = dot(liftOption, forward) >= 0 ? liftOption : scale(liftOption, -1);
  const liftForce = scale(
    liftDirection,
    dynamicPressure * sailDefinition.area * liftCoefficient,
  );
  const dragForce = scale(
    flowDirection,
    dynamicPressure * sailDefinition.area * dragCoefficient,
  );
  const force = add(liftForce, dragForce);

  return {
    apparentWind: apparent.vector,
    apparentWindSpeed: apparent.speed,
    apparentWindAngle: apparent.angle,
    boomAngle: sailAngle,
    desiredBoomAngle,
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
  const boat = environment.boat ?? HARBOR_20;
  const rudderTarget =
    clamp(controls.rudder, -1, 1) *
    degrees(boat.rudder.maximumAngleDegrees);
  const hasHeadsail = Boolean(getSailDefinition(boat, "headsail"));
  const headsailRate = controls.headsailRate ?? controls.sheetRate;
  const state: BoatState = {
    ...previous,
    position: { ...previous.position },
    velocity: { ...previous.velocity },
    rudderAngle: damp(
      previous.rudderAngle,
      rudderTarget,
      boat.rudder.responseRate,
      safeDt,
    ),
    sheet: clamp(previous.sheet + controls.sheetRate * safeDt * 0.3, 0, 1),
    headsailSheet: clamp(
      previous.headsailSheet +
        (hasHeadsail ? headsailRate : 0) *
          safeDt *
          0.3,
      0,
      1,
    ),
  };

  const apparent = apparentWindFor(state, environment);
  const boomTarget = desiredBoomFor(apparent.angle, state.sheet, state.sailSide);
  const boomRate = BOOM_BASE_RATE + degrees(5.5) * apparent.speed;
  state.boomAngle = moveToward(previous.boomAngle, boomTarget, boomRate * safeDt);
  if (hasHeadsail) {
    const headsailTarget = desiredBoomFor(
      apparent.angle,
      state.headsailSheet,
      state.sailSide,
    );
    state.headsailAngle = moveToward(
      previous.headsailAngle,
      headsailTarget,
      boomRate * 1.18 * safeDt,
    );
  }
  if (Math.abs(state.boomAngle) > degrees(2)) {
    const newSide = (state.boomAngle < 0 ? -1 : 1) as SailSide;
    if (newSide !== previous.sailSide) state.tackCount += 1;
    state.sailSide = newSide;
  }

  const sail = computeSailAerodynamics(state, environment);
  const headsail = computeHeadsailAerodynamics(state, environment);
  const combinedSailForce = add(
    sail.force,
    headsail?.force ?? { x: 0, y: 0 },
  );
  const combinedSideForce =
    sail.sideForce + (headsail?.sideForce ?? 0);
  const forward = forwardFor(state.heading);
  const starboard = starboardFor(state.heading);
  const forwardSpeed = dot(state.velocity, forward);
  const leewaySpeed = dot(state.velocity, starboard);
  const hullDrag = scale(
    forward,
    -forwardSpeed *
      (boat.hull.longitudinalDragLinear +
        Math.abs(forwardSpeed) *
          boat.hull.longitudinalDragQuadratic),
  );
  const keelForce = scale(
    starboard,
    -leewaySpeed *
      (boat.hull.lateralResistanceLinear +
        Math.abs(leewaySpeed) *
          boat.hull.lateralResistanceQuadratic),
  );
  const rudderSideForce =
    -Math.sin(state.rudderAngle) *
    Math.abs(forwardSpeed) *
    forwardSpeed *
    boat.rudder.forceFactor;
  const rudderForce = scale(starboard, rudderSideForce);
  const totalForce = add(
    combinedSailForce,
    hullDrag,
    keelForce,
    rudderForce,
  );
  const acceleration = scale(totalForce, 1 / boat.hull.displacement);
  state.velocity.x += acceleration.x * safeDt;
  state.velocity.y += acceleration.y * safeDt;

  // Once the sail has pushed the boat into sternway, amplify the player's helm
  // input just inside the no-go zone. This represents the combined effect of
  // backing/sculling the teaching boat without granting a stopped rudder force.
  const inIrons = 1 - smoothstep(degrees(28), degrees(42), Math.abs(apparent.angle));
  const sternway = smoothstep(0.03, 0.35, -forwardSpeed);
  const lowSpeed = 1 - smoothstep(0.35, 1.4, Math.abs(forwardSpeed));
  const ironsRecoveryTorque =
    clamp(controls.rudder, -1, 1) * inIrons * sternway * lowSpeed *
    apparent.speed * apparent.speed * IRONS_RECOVERY_TORQUE;
  const yawTorque =
    rudderSideForce * boat.rudder.lever +
    ironsRecoveryTorque -
    combinedSideForce * 0.12 -
    state.yawRate * 2_800;
  state.yawRate += (yawTorque / boat.hull.yawInertia) * safeDt;
  state.heading = wrappedAngle(state.heading + state.yawRate * safeDt);
  state.position.x += state.velocity.x * safeDt;
  state.position.y += state.velocity.y * safeDt;

  const targetHeel = clamp(
    Math.atan2(
      combinedSideForce * 2.1,
      boat.hull.displacement *
        9.81 *
        boat.hull.rightingArm,
    ),
    degrees(-24),
    degrees(24),
  );
  state.heel = damp(state.heel, targetHeel, 2.4, safeDt);
  const wavePose = environment.wavePose ?? {
    heave: 0,
    pitch: 0,
    roll: 0,
    heaveVelocity: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
  };
  const heaveFrequency = clamp(
    5.8 - boat.hull.length * 0.2,
    3.3,
    5,
  );
  const pitchFrequency = clamp(
    6.7 - boat.hull.length * 0.23,
    3.5,
    5.6,
  );
  const rollRadius = Math.max(boat.hull.beam * 0.38, 0.4);
  const rollFrequency = clamp(
    Math.sqrt(
      (9.81 * boat.hull.rightingArm) /
        (rollRadius * rollRadius),
    ),
    2.2,
    4.8,
  );
  [state.heave, state.heaveVelocity] = springAxis(
    previous.heave,
    previous.heaveVelocity,
    wavePose.heave,
    wavePose.heaveVelocity ?? 0,
    heaveFrequency,
    0.58,
    safeDt,
  );
  [state.wavePitch, state.wavePitchVelocity] = springAxis(
    previous.wavePitch,
    previous.wavePitchVelocity,
    wavePose.pitch,
    wavePose.pitchVelocity ?? 0,
    pitchFrequency,
    0.5,
    safeDt,
  );
  [state.waveRoll, state.waveRollVelocity] = springAxis(
    previous.waveRoll,
    previous.waveRollVelocity,
    wavePose.roll,
    wavePose.rollVelocity ?? 0,
    rollFrequency,
    0.42,
    safeDt,
  );

  return {
    state,
    sail: computeSailAerodynamics(state, environment),
    headsail: computeHeadsailAerodynamics(state, environment),
    hydro: {
      forwardSpeed,
      leewaySpeed,
      hullDrag,
      keelForce,
      rudderForce,
      rudderSideForce,
      ironsRecoveryTorque,
      yawTorque,
      targetHeel,
    },
  };
}

function springAxis(
  position: number,
  velocity: number,
  target: number,
  targetVelocity: number,
  frequency: number,
  dampingRatio: number,
  dt: number,
): [number, number] {
  const acceleration =
    frequency * frequency * (target - position) -
    2 *
      dampingRatio *
      frequency *
      (velocity - targetVelocity);
  const nextVelocity = velocity + acceleration * dt;
  return [position + nextVelocity * dt, nextVelocity];
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
