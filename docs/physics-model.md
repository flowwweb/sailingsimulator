# Educational sailing physics model

## Scope and claim

This is a game-scaled planar model designed to teach correct relationships. It
is more physical than a polar-speed lookup, but it is not CFD, a certified
training simulator, or a velocity-prediction program for a particular hull.

The model follows the useful structure of published 3-DOF sailboat work:
surge, sway, and yaw; a true/apparent wind vector triangle; sail angle of
attack; aerodynamic lift/drag; and separate hull/rudder response. See
[Parameter Identification of an Unmanned Sailboat](https://www.mdpi.com/2077-1312/12/12/2226).

## Coordinates and state

- World units are meters, seconds, kilograms, Newtons, and radians.
- Heading `0` points north (`+z`) and increases clockwise.
- True wind is an air-velocity vector pointing where the air travels.
- Boat state contains world position/velocity, heading, yaw rate, rudder angle,
  sheet position, and filtered heel.

## Step 1: apparent wind

```text
V_apparent = V_true_wind - V_boat
```

Convert the vector into boat-forward and boat-starboard components. Apparent
wind angle is reported from the direction the air arrives, relative to the bow.
Because boat velocity is included, the apparent wind strengthens and moves
forward as the boat accelerates.

## Step 2: sheet, sail angle, and flow state

The player changes sheet position. It maps to a bounded boom/sail angle. A
heading-dependent ideal angle provides a calibrated approximation for the
training boat; the difference between actual and ideal angle becomes an
effective angle of attack around an attached-flow design value.

This initial calibration distinguishes three continuous regions:

- **luff / under-trimmed:** effective angle is too low or the boat is in the
  no-go zone; lift collapses and leading-edge flutter increases;
- **attached:** lift-to-drag is strongest and telltales stream;
- **stall / over-trimmed:** effective angle is too high; lift rolls off, drag,
  turbulence, and heel increase.

The final 3D model should replace the current teaching curve with measured or
well-sourced coefficient tables if a specific boat is selected. Keep the state
boundaries and tests stable while tuning coefficients.

## Step 3: sail force

```text
q = 0.5 × rho_air × |V_apparent|²
Lift = q × sail_area × C_l(alpha)
Drag = q × sail_area × C_d(alpha)
```

Lift acts perpendicular to apparent airflow; drag acts with it. Resolve the
sum into boat-forward drive and boat-side force. Reduce useful lift smoothly in
the approximately 40° no-go zone. Downwind propulsion becomes increasingly
drag-dominant.

## Step 4: water forces

- Quadratic longitudinal hull resistance opposes forward/reverse speed.
- Strong lateral resistance approximates hull and keel side force and produces
  small, visible leeway instead of locking the boat to rails.
- Rudder side force scales with water flow and rudder angle. As speed approaches
  zero, steering authority disappears.
- Yaw damping prevents perpetual rotation.

The production model should give keel and rudder their own angle-of-attack
curves. The Phase 0 lab uses a compact lateral-force approximation because its
first contract is sail-state teaching.

## Step 5: heel and waves

Derive heel target from lateral sail force times center-of-effort height versus
a calibrated righting moment. Filter and clamp it; do not let heel feed back
into every force until the simpler model is tuned.

For rendering, sample the analytic lake-wave function at bow, center, and stern
to derive heave and pitch. Roll is heel plus a small wave-normal contribution.

## Deterministic scenarios

Tests should cover at least:

1. boat speed changes apparent wind speed and angle;
2. over-eased sail luffs and produces less drive than attached flow;
3. correct trim produces the best acceleration for a representative reach;
4. over-sheeting stalls rather than reusing the luff state;
5. no-go heading removes useful lift and slows the boat;
6. keel/lateral resistance reduces leeway over time;
7. rudder authority falls with water speed;
8. a full tack changes sail side and restores attached flow after retrim;
9. fixed seed plus fixed inputs produce identical snapshots;
10. all state stays finite under long randomized input sequences.

## Tuning policy

Do not tune by changing several unrelated constants until one screenshot feels
good. Record a scenario, change one curve or coefficient family, run all tests,
then compare speed, leeway, yaw, heel, and flow-state traces. Visual feedback is
driven from the same diagnostics; it must not fake a better state.
