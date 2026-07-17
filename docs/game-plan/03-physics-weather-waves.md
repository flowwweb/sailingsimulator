# 03 · Physics, weather, and waves

## Claim boundary

This is a deterministic educational 3-DOF model: surge, sway, and yaw in the
horizontal plane. It teaches causal sailing behavior with bounded coefficients.
It is not CFD, a velocity-prediction program, a certified boat model, or a
full six-degree-of-freedom ocean simulation.

## Units and fixed step

- Internal units: meters, seconds, kilograms, radians, newtons, and m/s.
- UI converts to knots and degrees at its boundary only.
- Integrate at fixed `1 / 60` s using semi-implicit Euler. Clamp accumulated
  frame catch-up and interpolate previous/current snapshots for rendering.
- Simulation and weather code import neither Three.js nor the DOM.
- Given initial state, controls, weather seed/configuration, and timestep, a
  run must produce the same snapshot sequence on the same JavaScript runtime.

## Boat state and force order

```text
Weather sample -> true wind at boat position
true wind - boat velocity -> apparent wind
apparent wind + boom/sail angle -> luff / attached / stall + sail lift/drag
sail + hull + keel + rudder -> surge/sway/yaw acceleration
integrated state -> derived heel, point of sail, visual/audio snapshot
```

Maintain explicit state for world position, world velocity, heading, yaw rate,
rudder angle, sheet opening, actual boom angle, tack/sail side, and filtered
heel. Diagnostics expose apparent wind, angle of attack, force components,
luff, attached flow, stall, leeway, and point of sail.

## Core force model

### Wind and sail

- `apparentWind = trueWindAtBoat - boatVelocity`.
- Convert apparent flow to the boat’s forward/starboard axes.
- Use sail chord angle versus incoming apparent flow to calculate angle of
  attack. The player sheet affects this through boom constraint.
- Use bounded lift and drag curves. Lift rises through the attached range then
  falls after a stall onset; drag rises in stall and on deep downwind reaches.
- The no-go band suppresses useful lift as apparent wind approaches the bow.
- Apply sail force at a defined centre of effort so side force also creates yaw
  and heel. Do not calculate speed from a true-wind-angle lookup table.

### Hull, keel, and rudder

- Resolve velocity into surge and sway in boat coordinates.
- Apply increasing longitudinal hull drag in surge.
- Apply substantially stronger lateral resistance from keel/hull in sway; this
  permits visible bounded leeway rather than rails-like motion.
- Calculate rudder angle of attack from incoming water flow and physical rudder
  angle. Rudder force grows with water speed, adds drag, and applies a stern
  yaw moment.
- Add yaw damping. Keep all coefficients in one boat configuration object so
  tuning is inspectable and scenario tests can name the behavior they protect.

## Heel and boat pose

Heel is a filtered, bounded balance of lateral sail moment and righting moment.
It is derived from the same force snapshot rendered by the sail and wake. The
initial core may not capsize; heel caps below that threshold. Never render a
large heel when force diagnostics say near-zero lateral load.

Wave pose is a damped hydrostatic approximation, not direct animation. Sample
the canonical wave field at hull-definition-sized centre, bow, stern, port and
starboard footprints. Derive heave, pitch, roll, and their target velocities
from the local water surface. Boat-specific underdamped natural frequencies
give the Fair Winds Dinghy a quicker response than the longer, heavier Lake 34. Wave
pose still does not alter planar sail/keel/rudder forces; orbital flow,
slamming, and full six-degree coupling remain documented later work.

## Weather contract

`WeatherConfig + seed + time + world position -> WeatherSnapshot`.

| Field | Manual mode | Evolving mode |
| --- | --- | --- |
| True wind | exact speed and meteorological “from” direction | bounded slow base shifts plus seeded local gusts |
| Gusts | exact configured intensity/scale | seed-driven spatial/temporal variation, not a boost |
| Waves | wind-linked or one of six explicit sea states / custom spectrum | deterministic spectrum follows configured energy and direction |
| Rain/cloud/visibility | exact values | bounded fronts and transitions |
| Time | paused or scaled | same, without changing determinism |

Centralize the conversion from UI “wind from” degrees to the world vector the
air travels toward. The compass, pennant, streaks, wind audio, and sail forces
must use this one conversion.

Presets: Fair Winds, Light Air, Fresh Breeze, and Passing Shower. Named manual
sea states are Calm, Light Chop, Moderate, Fresh, Rough, and Storm. A copied
configuration includes seed and every exposed value so a bug or lesson can be
reproduced.

## Analytic wave contract

Use six directional second-order components. Each owns amplitude, wavelength,
direction, angular frequency, steepness, and phase. Amplitudes are normalized
so `4 * sqrt(sum(a² / 2))` equals configured significant wave height. The
canonical CPU function returns height, analytic first derivatives/slope, and
vertical surface velocity at `(x, z, t)`. The GPU receives that exact component
data and second-harmonic formula; it must not use unrelated “pretty water”
noise.

Evaluate phase in absolute world coordinates. Recentring the render grid around
the camera may move vertices, but it must not move the wave field, wake, boat,
or rain impact pattern through the world. Changing quality may alter mesh
density, never wave height, direction, timing, or the sampled boat pose.

In the core, waves drive:

- adaptive-grid water displacement and mostly analytic reflection normals with
  a restrained low-poly face contribution;
- boat heave from weighted samples and vertical velocity;
- pitch from fore/aft samples and roll from port/starboard samples, using the
  active boat length and beam;
- rain/wake placement, spray, and local water highlights.

They do **not** yet add full wave-induced surge/sway/yaw forces. Keep the wave
pose layer separated so later hydrodynamic coupling can be added without
changing the weather interface.

## Required deterministic scenarios

1. Same state, controls, seed, and fixed ticks produce equal final snapshots.
2. Meteorological direction conversion is correct on cardinal headings.
3. Moving with the wind changes apparent wind as expected.
4. Over-eased luff has less drive than attached trim; over-sheeted stall is
   distinct from luff and has reduced useful acceleration.
5. No-go heading removes useful drive and ultimately reduces rudder authority.
6. A tack crosses the no-go zone, flips sail side once, loses speed, then
   recovers after bearing away and retrimming.
7. Manual weather stays exact; same evolving sample inputs reproduce exactly;
   gusts vary smoothly across space and time.
8. Wave height/slopes are finite and bounded during long runs; linked waves
   converge gradually and manual waves do not drift.
9. Rain and visibility never alter the physics snapshot unless a later explicit
   physics feature says they do.
10. Five-point wave sampling produces bounded heave/pitch/roll targets and the
    damped response remains finite under maximum core wave conditions.

Every new force, state transition, or weather feature adds its own focused test
before visual work is claimed correct.
