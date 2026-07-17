# Technical architecture and delivery plan

## Recommendation

Use Vite + TypeScript + Three.js with a custom deterministic simulation core
and ordinary DOM/CSS UI. Start on WebGL for reach and stability. Do not add
React, a general physics engine, an ECS, a server, or WebGPU until a proven need
appears.

For the first 3D sprint, add only `simplex-noise` for seeded gust fields and an
optional development-only `lil-gui` tuning surface. The shipped Conditions UI
remains semantic DOM/CSS. See [the platform and sprint decision](short-sprint-blueprint.md)
and the [canonical one-shot prompt](ONE_SHOT_CORE_PROMPT.md).

This is smaller than Saltwind's delivered React/Vinext structure and fits a
single-screen game. Three.js's own installation guide recommends npm with a
build tool such as Vite, and its WebGL water support confirms that broad browser
compatibility remains a practical path.

## Runtime boundaries

```text
Input ──> fixed-step simulation ──> immutable snapshot ──> Three.js renderer
                  │                         │
                  ├── deterministic tests   ├── DOM HUD
                  └── lesson state machine  └── audio/feedback

Weather field ──> true wind ──> apparent wind ──> sail/keel/rudder forces
Analytic waves ──> CPU samples + shared shader parameters ──> boat/water match
```

The simulation must not import Three.js or touch the DOM. The renderer may read
snapshots but must never become the source of physics truth.

## Weather boundary

Weather is evaluated before the boat step from configuration, seed, simulation
time, and position. It returns one immutable snapshot consumed by both the
sailing model and feedback systems. Manual mode holds exact values. Evolving
mode uses seeded bounded variation. A centralized conversion turns UI
meteorological “wind from” degrees into the vector the air travels toward.

Six second-order wave components are part of the weather snapshot. The CPU
evaluator returns height, analytic slope, and vertical surface velocity; the
renderer passes the same directions, amplitudes, wave numbers, angular
frequencies, steepness, and phase to the GPU shader. Named manual sea states
range from 0.08 m calm water through a 3.5 m extreme test state, while linked
waves derive significant height, dominant length, and steepness from wind.

## Planned source layout

```text
src/
  sim/          vectors, apparent wind, force curves, integrator, boat config
  weather/      deterministic spatial wind and gust field
  lessons/      lesson state machines and coaching events
  render/       scene, boat, sail deformation, water, terrain, camera, wake
  ui/           DOM HUD, menus, settings, touch controls
  audio/        wind, water, luff, rigging, feedback mix
  main.ts       composition root and fixed-step loop
```

The current `src/` contains the browser-playable Three.js slice. Boat mass,
draft, resistance, rudder, sail plans, headsails, collision footprints, camera
profiles, and reference polars live in deterministic `BoatDefinition`
contracts. Bathymetry, regions, landmarks, and collision objects live in one
`WorldDefinition`.

## Simulation scope

Use planar 3-DOF state:

- world position `(x, z)` and velocity;
- heading and yaw rate;
- rudder angle, sheet position, boom/sail angle;
- derived apparent wind, heel, pitch/heave sample, luff, stall, and trim quality.

Forces are sail lift/drag, hull longitudinal drag, keel/lateral resistance,
rudder side force and yaw moment, and optional mild current. Heel is a filtered
balance of lateral sail moment and righting moment. Vertical motion uses
hull-sized bow/stern/port/starboard/center samples; boat-specific underdamped
heave, pitch, and roll follow both surface displacement and vertical velocity.
This remains a teaching-oriented driven response rather than full 6-DOF
hydrodynamics.

Use semi-implicit Euler at 60 Hz, cap accumulated catch-up, and interpolate
snapshots for rendering.

## Lake and world rendering

- Coordinates are meters. The current basin is 3.6 km across; add a
  floating origin only if profiling shows visible precision issues.
- Render water as one camera-centered adaptive triangular grid: dense around
  the boat and progressively coarser toward the horizon.
- Evaluate the identical six-component second-order analytic wave function on
  CPU and GPU. Interpolate analytic slope for smooth reflection motion, then
  blend a restrained face normal so low-poly facets remain intentional.
- Render shoreline, landmark, cloud, and boat reflections through a clipped
  half-resolution planar pass, softened and distorted by the shared wave
  normal. Keep the sun path procedural so it breaks into moving highlights.
- Build the perimeter from a few procedural terrain sectors and landmark
  silhouettes; use fog and color layers to control reveal distance.
- Use a coarse navigation/collision polygon for shoreline. Do not collide
  against render meshes.
- Treat bathymetry, shoreline distance, objects, collision volumes, lessons,
  minimap, and render placement as consumers of one deterministic world
  definition.
- Save only compact player state and lesson progress in local storage.

## Sail rendering

Use a small custom grid mesh, not cloth physics. Precompute vertex weights for
height, chord, leech, and luff. Each frame:

1. set boom angle from the simulation;
2. shape camber from attached-flow/load state;
3. add high-frequency leading-edge oscillation proportional to luff intensity;
4. add slower whole-sail turbulence proportional to stall intensity;
5. orient telltales from local apparent flow with noise driven by luff/stall;
6. recompute or approximate normals at a controlled rate.

This makes the sail physically communicative at a fraction of soft-body cost.

## Performance budget

- 60 fps desktop at 1080p; 30 fps supported mobile.
- One main directional light, ambient/hemisphere light, fog, and low-cost
  contact shadows.
- One clipped half-resolution planar reflection capped at 1024×576, with
  five-tap softening and analytic-normal distortion.
- Shared materials and geometry; sparse instancing for shore objects.
- Dynamic pixel ratio with conservative limits.
- Avoid per-frame allocations in simulation and render hot paths.

## Delivery slices

### Phase 0 — physics lab (this initial repository)

- apparent wind, trim/luff/attached/stall states, hull/keel resistance, rudder;
- deterministic tests and top-down diagnostic UI;
- research, art direction, mockups, and master prompt.

### Phase 1 — honest 3D vertical slice

- one procedural trainer on the 3.6 km basin, plus definition-driven
  headsail/large-monohull validation profiles;
- chase camera, analytic water, wake, wind compass, keyboard/touch;
- lesson 2: luff → attached → stall;
- rendered desktop and mobile proof.

### Phase 2 — feel and teaching

- all four lessons, gust field, coherent audio, telltales, heel, tack behavior;
- tune from play sessions and add regression scenarios.

### Phase 3 — cinematic lake, hazards, and exploration

- implement the mockup-aligned mountain lake, atmospheric reveal, shared
  bathymetry, shore/object collision, grounding, landmarks, incident cinematic,
  free sail, save/progress, and performance tiers;
- introduce data-driven boat definitions, optional headsail force/render paths,
  draft-sensitive routes, and larger monohull profiles while keeping the
  training boat as the first exposed choice.

### Phase 4 — polish and public release

- accessibility, mobile QA, browser matrix, production telemetry only with a
  clear privacy boundary, deploy, and an honest known-limitations page.

## Proof gates

- `npm test`: deterministic force/state scenarios.
- `npm run build`: typecheck and production bundle.
- Physics scenario capture: same inputs/seed produce same snapshots.
- Render proof at 1440×900, 390×844, reduced motion, and low quality.
- Interaction proof for keyboard and touch.
- Performance capture on at least one mid-range laptop and one phone before a
  public performance claim.
