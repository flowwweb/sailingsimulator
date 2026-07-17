# One-shot core build prompt

Copy everything below the divider into one Codex task rooted at this repository.
It is intentionally scoped to one short, playable vertical slice.

---

You are implementing the first playable 3D core of the public repository
`flowwweb/sailingsimulator`. Work autonomously through implementation and proof;
do not stop after writing a plan. Do not push, deploy, or rewrite unrelated user
work unless explicitly asked.

## Begin with the repository truth

Before editing:

1. Read `AGENTS.md`, `README.md`, `docs/short-sprint-blueprint.md`,
   `docs/game-design.md`, `docs/physics-model.md`, `docs/architecture.md`,
   `docs/art-direction.md`, `docs/mockups/README.md`, and
   `docs/research/saltwind-analysis.md` completely.
2. Read `docs/game-plan/README.md` and every numbered document in
   `docs/game-plan/` completely. They are the detailed contracts for product
   scope, interaction, physics/weather/waves, presentation/accessibility,
   platform/assets, and proof.
3. Check `git status --short --branch`, package scripts, installed versions,
   current source, and tests. Preserve unrelated changes.
4. Write a compact solution brief: objective, non-goals, task risk, files,
   patterns to reuse, likely traps, proof commands, and claim limits.
5. Treat the existing deterministic physics lab as the starting contract. Fix
   a real blocking physics defect if found, but do not broadly redesign it.

The game-plan documents resolve detail; this prompt resolves execution. If a
conflict remains, preserve the product boundary in `AGENTS.md`, the
deterministic simulation boundary, and the smallest implementation that makes
the causal sailing behavior true.

## Sprint outcome

Deliver one polished browser-playable 3D vertical slice in the existing Vite +
strict TypeScript + Three.js/WebGL project:

- a mainsail-only 6 m training keelboat as the default, plus two
  definition-driven monohull validation profiles with optional headsails;
- real sheet input controlling main and assisted linked headsail trim;
- one camera-centered 3.6 km mountain-lake basin with local islands and an
  atmospherically revealed outer shore;
- a chase camera, keyboard and touch helm/sheet controls, a quiet HUD, and
  reset/pause;
- under-trimmed luff, optimal attached flow, over-trimmed stall, the no-go
  zone, reduced rudder authority at low speed, and a basic tack;
- a short “make the sail draw” lesson plus unrestricted free sail;
- manual or deterministic evolving weather with adjustable wind, waves, gusts,
  rain, visibility, cloud, time scale, and seed;
- a quiet condition-aware ambient soundscape plus two or three visible optional
  destinations, so Free Sail is pleasurable without racing or progression.

The browser is the primary product surface: the production build must run from
a normal URL on desktop and mobile without a login, download, native shell, or
server dependency. Design it as an app-capable web product: responsive touch
input, safe browser audio activation, local-only persistence, and no platform
APIs in simulation code. Do not build native packages in this sprint. Preserve
the seam for a later web app manifest/PWA and a Capacitor mobile wrapper or
Tauri desktop wrapper without duplicating gameplay code.

This is a playable educational core, not the complete game. Finish and prove
this slice before expanding it.

The core is successful only when a player can launch from a browser URL, choose
a weather preset or manual conditions, steer and trim, see and hear luff versus
attached flow versus stall, perform a recoverable tack, experience consistent
waves/rain/visibility, finish the trim lesson, then Free Sail. Do not replace
one of those contracts with extra scenery, a racing loop, native packaging, or
more boat systems.

## Fixed technology decision

Use:

- the repository's Vite, TypeScript, Three.js, and Vitest versions;
- `simplex-noise` for seeded smooth gust variation;
- a small repository-owned seeded PRNG passed to `simplex-noise`;
- ordinary semantic DOM/CSS for HUD, touch controls, pause, and Conditions;
- optional `lil-gui` imported only in development for deep tuning;
- native Web Audio oscillators/noise/filtering for wind, water, rain, and luff.

Recorded CC0 ambience or one-shots are allowed when synthesis sounds cheap,
especially rigging, blocks/boom, hull creak, wave slap, birds and insects. Every
file must have source/author/license/modification evidence in
`THIRD_PARTY_NOTICES.md`. Do not add a general audio engine unless the native
Web Audio graph proves insufficient.

Once the first 3D DOM/canvas interface exists, add Playwright as the single
browser-test tool. Use it for launch, keyboard/touch, Conditions, pause/reset,
console checks, and desktop/mobile captures. Vitest remains the owner of
deterministic numerical contracts; do not use screenshots as physics tests.

Do not add React, React Three Fiber, an ECS, a general rigid-body/cloth engine,
a server, an external weather API, a large asset pack, a post-processing stack,
or a WebGPU-only path. Do not add a PWA plugin, Capacitor, or Tauri in this
core sprint. Do not use Three.js `Water` reflections; implement the specified
low-poly water directly.

Install only dependencies actually used. Pin exact versions and allow the
normal package lock update. Explain any dependency beyond the two named above
before adding it.

## Required boundaries

Keep these directions one-way:

```text
input -> fixed 60 Hz simulation -> immutable snapshot -> render/UI/audio
weather config/seed/time/position -> weather snapshot -> simulation + render
wave parameters -> shared analytic function -> CPU boat pose + GPU water
```

- `src/sim` and `src/weather` must not import Three.js or touch the DOM.
- Rendering, UI, and audio may read snapshots but may not calculate or overwrite
  physics truth.
- Run physics and weather at a fixed 60 Hz. Clamp catch-up and interpolate
  render snapshots.
- Use meters, seconds, kilograms, radians internally, and m/s internally.
  Convert to knots/degrees only at UI and configuration boundaries.
- Define “wind direction” in the UI as meteorological degrees the wind comes
  **from**. Centralize its conversion to the vector the air moves toward.
- Avoid per-frame allocations in simulation and renderer hot paths.
- Helm maps to a bounded, rate-limited physical rudder angle; it creates force
  from water flow and has negligible authority near zero boat speed.
- Sheet defines boom opening. Apparent wind selects sail side; boom movement is
  bounded and smooth, so a tack/gybe cannot teleport the sail through the mast.

Use or adapt this cohesive layout; do not create abstraction layers without a
current use:

```text
src/
  sim/           boat state, forces, integrator, snapshots, tests
  weather/       types, presets, PRNG/noise, sampler, wave model, tests
  lessons/       one trim lesson state machine
  render/        scene, boat, sail, water, rain, wind cues, camera, wake
  ui/            HUD, Conditions drawer, touch controls, pause
  audio/         wind/water/rain/luff mix
  main.ts        composition root and fixed-step/interpolated loop
```

## Weather contract

Create typed weather configuration with:

- `mode: "manual" | "evolving"`;
- numeric seed and `timeScale` including pause;
- wind speed in m/s and direction-from degrees;
- gust strength, spatial scale, period, and direction-shift range;
- `waveMode: "linked" | "manual"`, height, period, and direction;
- rain intensity 0–1, visibility in meters, and cloud cover 0–1.

Provide four data presets with sensible lake conditions:

1. `Learning Day`: steady roughly 5 m/s wind, 0.15–0.25 m waves, no rain,
   long visibility;
2. `Variable Breeze`: evolving wind, 20–30% gusts, small direction shifts, and
   moderate waves;
3. `Rain Shower`: stronger evolving breeze, visible rain, shorter visibility,
   darker atmosphere, and moderate waves;
4. `Calm Evening`: light steady wind, tiny waves, no rain, warm low light.

Manual mode must hold exact values until changed. Evolving mode must change
conditions gradually within documented bounds and produce identical samples
for identical seed, time, and position. Local gusts are changes in the true
wind field—not boosts or direct changes to boat velocity.

When waves are linked, wave energy and direction derive from the wind. Manual
waves obey named or custom significant height, dominant length, steepness, and
direction. Use six bounded second-order analytic components normalized to the
requested significant wave height. One repository-owned CPU evaluator returns
height, slope, and vertical velocity; the GPU receives the same spectrum and
phase. Use an adaptive triangular water grid and a clipped, softened,
resolution-capped planar reflection distorted by the shared analytic normal.

Rain affects particles, fog/visibility, lighting/color, surface response, and
audio. In this slice it does not change mass, friction, sail coefficients, or
the 3-DOF force model. Make that approximation explicit in code comments and
the known-limitations note.

## Sailing model contract

Preserve a game-scaled planar surge/sway/yaw model:

- true wind at boat position minus boat velocity equals apparent wind;
- the sheet constrains boom/sail angle and is never a hidden speed multiplier;
- sail angle of attack drives explicit continuous lift and drag curves;
- keep luff, attached-flow, and stall intensities distinct and testable;
- hull longitudinal drag, keel/lateral resistance, water-flow rudder force,
  yaw moment, and bounded derived heel remain explicit;
- entering the roughly 40° no-go zone removes useful drive and the boat coasts;
- low water speed reduces rudder authority;
- a tack crosses the no-go zone, changes sail side, loses speed, then recovers
  after bearing off and retrimming.

The visible heel, wake, telltales, sail shape, wind cues, audio, HUD, and lesson
state must consume the same immutable physics snapshot. A state cannot look
good while the diagnostics say it is luffing or stalled.

Tune for legible teaching before numerical sophistication. Call the result an
educational game-scaled model, not a certified sailing simulator.

## Visual and audio contract

Follow `docs/art-direction.md`: quiet geometric modernism, simplified low-poly
forms, crisp silhouettes, controlled facet size, restrained maritime palette,
soft atmosphere, no outlines, no photorealism, no childish toy look, and no
generic glossy mobile-game finish.

Implement `docs/game-plan/07-fun-immersion-audio.md` as a product contract, not
optional polish. The opening minute must let a beginner turn audible luff into
attached flow and feel the boat come alive. Free Sail needs two or three sparse
landmark silhouettes or markers to choose between without adding quests,
collectibles, gates, or a score.

Use mockups 02, 03, 04, 06, and 10 as composition and feedback references for
core play, luff, attached flow, gusts, and mobile controls. They are visual
targets, not textures or exact layouts to paste into the game.

Water must use the standard stylized low-poly construction: one coherent
adaptive triangular mesh, analytic vertex displacement and smooth wave normals,
subtle controlled colour faceting, restrained Fresnel/specular sun highlights,
a softly distorted resolution-capped planar reflection, and localized wake
foam. Never use unrelated polygon tiles, paper bands, stacked ribbons, hard
crystalline cell normals, or mirror-perfect reflections.

Build the hull, deck, cockpit, keel, rudder, mast, boom, and sail from a small
number of procedural meshes. Correct proportions and readable sailing parts
matter more than surface detail. Use a custom sail grid: boom angle follows
the physics; attached flow creates stable camber; luff creates localized
leading-edge flutter; stall creates deeper, slower turbulence. Do not reuse one
generic flap animation for luff and stall.

Make the same state visible in all channels:

| State | Sail/telltales | Boat/water | Audio/HUD |
| --- | --- | --- | --- |
| Luff | leading-edge flutter, wandering telltales | slowing, smaller wake | cloth flutter, luff cue |
| Attached | stable camber, streaming telltales | best acceleration, clean wake, controlled heel | quiet airflow, subtle trim confirmation |
| Stall | over-deep/turbulent sail, leeward telltale lift | excess heel with weaker acceleration | low turbulent rush, “Ease a little” |
| Gust | increased load without state contradiction | stronger wake/heel/weather helm | rising wind; no boost meter |

Use a mast pennant, a few wind streaks/darker gust patches, water texture motion,
and sound to make wind readable without forcing the player to stare at the HUD.
Rain should be a camera-relative bounded `Points` or instanced-particle volume,
with no unbounded particle allocation.

Create a Web Audio mixer after the `Set Sail` user gesture with master,
ambience, wind, water, boat, sail, weather, and UI buses. Continuous parameters
must crossfade smoothly from the same immutable snapshot used by rendering.
Include open-lake air/water ambience, speed-dependent hull wash, load-dependent
rigging/boat details, distinct luff/stall/fill sounds, and rain. Persist mute and
category levels, maintain headroom/mono compatibility, and make every lesson
fully completable without sound. Do not mask sailing with constant music.

## Player interface

Keyboard:

- `A/D` or arrows: helm;
- `W`: ease sheet; `S`: sheet in;
- `R`: reset/recover; `Esc`: pause;
- `C`: open/close Conditions.

Touch:

- spring-centered horizontal helm pad;
- persistent vertical sheet slider;
- clearly labeled `HELM` and `SHEET`;
- touch-sized pause and Conditions actions.

The HUD contains only point-of-sail/wind compass, speed/trend, sheet position,
one coaching sentence, and pause/conditions. Conditions must be an accessible
DOM drawer containing presets, Manual/Evolving, essential wind/wave/rain/
visibility controls, seed, time scale, restart from seed, and a copyable config.
Put less-used values under an Advanced disclosure. Do not ship `lil-gui` as the
player interface.

The one lesson starts with an over-eased sail. It asks the player to sheet in
until the leading-edge flutter stops, then deliberately over-sheet to feel
stall, then ease back to attached flow. It teaches through state changes and
one contextual sentence at a time; there is no failure screen.

## Ordered implementation

1. Add weather types, presets, seeded sampling, wave components, and unit tests.
2. Refactor the current loop so it samples weather before stepping the boat and
   exposes immutable current/previous snapshots.
3. Build the Three.js scene, camera, light/fog, camera-centered low-poly water,
   procedural boat, sail, and interpolation.
4. Connect sail shape, telltales, heel, wake, wind cues, and HUD to the same
   simulation snapshot.
5. Add Conditions, keyboard/touch controls, pause/reset, and config sharing.
6. Add bounded rain plus the dynamic ambient/audio buses after user gesture.
7. Add two or three sparse optional destinations, the single trim lesson, and
   Free Sail. Validate the opening luff-to-attached reward before adding polish.
8. Tune only after the contracts and full loop work. Remove dead scaffolding.
9. Add a concise known-limitations section to the README or a linked doc.
10. Add Playwright smoke flows and runtime captures once DOM/canvas controls
    exist.
11. Run all proof gates and fix in-scope failures before closeout.

If the whole slice genuinely cannot fit, preserve this priority order:

1. correct deterministic weather + sailing behavior;
2. coherent 3D sail/water/boat feedback;
3. manual/evolving Conditions and rain;
4. keyboard/touch usability;
5. one lesson and polish.

Do not replace a missing high-priority contract with extra scenery or UI.

## Required tests

Add focused deterministic tests for at least:

- meteorological direction conversion;
- manual weather holds exact values;
- same evolving seed/time/position gives the same sample;
- different positions can enter different gust patches without discontinuity;
- changing wind changes apparent wind on the next fixed tick;
- wave height/slope remains finite and bounded across a long sampled run;
- linked waves approach targets gradually; manual waves do not drift;
- pause freezes deterministic weather phase;
- under-trimmed luff, attached optimum, over-trimmed stall, and no-go behavior;
- low-speed rudder authority and a stable long simulation;
- same initial state, seed, timestep, and inputs produce the same final snapshot;
- boom/sail side crosses once during a deterministic tack and does not teleport;
- keyboard and touch normalized controls reach the same simulation inputs.

Avoid brittle screenshot-as-physics tests. Keep numerical tolerances explicit.

## Proof and acceptance

Run at minimum:

```powershell
npm test
npm run build
```

Then run the production build or dev app and verify at 1440×900 and 390×844:

- no console errors;
- keyboard and touch controls work;
- Manual wind changes force, sail, cues, and HUD coherently;
- Evolving mode is gradual and restart-from-seed is reproducible;
- wave height/period/direction and linked/manual modes visibly work;
- rain 0 and rain 1 work; visibility and audio respond;
- luff, attached flow, and stall are visually distinct;
- ambient lake, wind, water, boat/sail and rain layers respond without abrupt
  transitions, clipping, obvious short loops, or contradiction with visuals;
- mute/category levels persist and lessons remain completable while muted;
- a beginner can find attached flow in the opening minutes and voluntarily
  choose a visible Free Sail destination;
- pause, reset, Conditions, lesson, and free sail work;
- low/reduced-motion quality remains readable.

Before handoff, update the relevant `docs/game-plan/` contract with every
intentional approximation, implemented dependency/asset plus license evidence,
or newly discovered proof command. Do not silently change the model through
code-only tuning.

Capture fresh desktop and mobile evidence if the environment supports it. Do
not claim a frame rate without measuring it on named hardware. Do not claim
live/deployed behavior without testing the deployed URL.

Close out compactly with:

1. what changed;
2. tests/build with pass, fail, timeout, or blocker status;
3. rendered/runtime evidence;
4. known approximations and anything unverified;
5. the next highest-value slice only.

Do not claim realistic, complete, production-ready, safe, shipped, or deployed
unless fresh proof supports that exact claim.

---
