# Master build prompt

> For the short-sprint playable 3D and weather core, use the canonical
> [one-shot core build prompt](ONE_SHOT_CORE_PROMPT.md). This document remains
> the lower-risk incremental prompt when the work must be split across several
> reviewed tasks.

Copy the prompt below into a new Codex task rooted at this repository. It is
written to produce narrow, provable increments instead of attempting the whole
game in one unreviewable pass.

---

You are building `flowwweb/sailingsimulator`, a public browser game that teaches
the basics of sailing through one responsive 6-meter training keelboat on a
huge freshwater lake.

Before editing:

1. Read `AGENTS.md`, `README.md`, `docs/game-design.md`,
   `docs/physics-model.md`, `docs/architecture.md`, `docs/art-direction.md`, and
   `docs/research/saltwind-analysis.md` completely.
2. Check `git status --short --branch`, package scripts, existing tests, and the
   current implementation. Preserve unrelated changes.
3. State the one narrow delivery slice you will complete, its non-goals, likely
   files, risks, proof commands, and claim limits.

Product objective:

- Teach wind direction, sail trim, luffing versus attached flow versus stall,
  points of sail, and tacking.
- Make the lake initially feel like open sea. Build a 3.6 km-wide central basin
  with local islands, atmospheric outer-shore reveal, and 15–24 minute full
  crossings at normal speeds.
- Preserve calm free exploration after four short optional lessons.

Non-goals until the core is proven:

- no multiplayer, AI racers, regatta gates, boost, combat, economy, survival,
  fishing, crafting, spinnakers, or full CFD;
- expose the mainsail-only Harbor 20 first; keep the Coastal 28 and Lake 34 as
  validation profiles for optional headsail, draft, mass, handling, and polar
  contracts rather than a progression/fleet system;
- no React/ECS/general rigid-body engine/server unless an existing proven need
  is documented;
- no WebGPU-only implementation and no photoreal asset pipeline.

Required engineering model:

- Vite + strict TypeScript + Three.js/WebGL + DOM/CSS UI.
- Keep `src/sim` deterministic and independent from Three.js and the DOM.
- Run a fixed 60 Hz simulation and interpolate for rendering.
- Compute apparent wind as true wind minus boat velocity.
- Use sail angle of attack and explicit lift/drag curves with continuous luff,
  attached-flow, and stall intensities.
- Use hull longitudinal drag, strong keel/lateral resistance, water-flow rudder
  force, and yaw moment. Derive a bounded heel target from lateral sail force
  and righting moment.
- The sheet changes the sail/boom constraint. Never implement trim as a hidden
  speed percentage.
- Make visual sail camber, leading-edge flutter, telltales, heel, wake, wind
  audio, cloth audio, and HUD agree with simulation state.
- Use a camera-centered adaptive triangulated grid and the same six-component
  second-order wave spectrum on CPU and GPU.
- Support wind-linked waves and named manual sea states from 0.08 m calm water
  through a bounded 3.5 m extreme test state. Boat pose samples hull-sized
  buoyancy points and follows displacement plus surface velocity.
- Reflect scenery and the boat with a clipped, softened, resolution-capped
  planar pass distorted by the analytic wave normal.

Required art direction:

Use quiet geometric modernism: simplified low-poly forms with carefully
controlled facet size, clean faceted shading plus soft ambient light, sparse
premium materials, slightly posterized atmospheric gradients, crisp silhouettes,
and a restrained maritime editorial palette. It must feel like an intentional
contemporary design decision. It must not be photorealistic, childish, toy-like,
retro low-poly, outlined anime, or glossy generic mobile-game art. Prefer
procedural geometry, vertex colors, shared materials, and atmosphere over large
texture sets. The boat remains nautically correct even when simplified.

Water must follow the standard low-poly method: one adaptive coherent
triangulated mesh, six-component second-order vertex-wave displacement, smooth
analytic reflection normals with a restrained faceted contribution,
depth-aware color, Fresnel/specular highlights, crest foam, and localized wake.
Use a clipped, softened, resolution-capped planar reflection so shore, boat, and
landmark reflections match the mockups without becoming photoreal mirror
water. Do not render tiled patchwork, paper-like polygon bands, or stacked
ribbons.

Interaction and teaching requirements:

- Keyboard: A/D or arrows helm, W ease, S sheet in, R recover, Esc pause.
- Touch: spring-centered helm control and persistent sheet slider.
- One contextual coaching message at a time.
- Lesson sequence: find wind; make the sail draw; points of sail; tack.
- Let players intentionally experience under-trimmed luff, optimal attached
  flow, and over-trimmed stall. Do not collapse them into one generic “bad trim.”
- No failure screen for entering the no-go zone. Let the boat slow and teach why.

Implementation sequence:

1. If Phase 0 is not solid, improve only the deterministic physics lab and its
   tests. Do not start 3D.
2. Otherwise build the Phase 1 vertical slice only: one procedural boat/sail,
   1 km water plane, chase camera, keyboard/touch, minimal HUD, and the
   luff→attached→stall lesson.
3. Use the mockups as composition and hierarchy references, not as texture
   sources. Do not copy Saltwind code or assets.
4. Add the smallest regression tests that prove each physics/state invariant.
5. Run `npm test` and `npm run build`. For visual or interaction changes, run
   the app and capture desktop and mobile evidence. Check console errors.
6. Report separately: what changed, static/test proof, rendered/runtime proof,
   unverified behavior, and the next narrow slice.

Acceptance criteria for the first 3D vertical slice:

- With a fixed wind and seed, identical inputs produce identical sim snapshots.
- Apparent wind changes as boat velocity changes.
- Over-easing causes leading-edge luff, wandering telltales, reduced force,
  audible flutter, and loss of speed.
- Correct trim produces stable camber, streaming telltales, attached-flow state,
  and the best acceleration for that heading.
- Over-sheeting produces stall/turbulence and excess heel without reusing the
  luff animation.
- Turning into the approximately 40° no-go zone removes useful drive and
  eventually reduces rudder authority.
- A tack crosses the no-go zone, changes sail side, loses speed, and recovers
  when the player bears off and retrims.
- Gusts are changes in the wind field, not a player power-up.
- The visible water, wind cues, sail behavior, wake, and instruments do not
  contradict one another.
- The screen matches `docs/art-direction.md` and remains readable at desktop
  and mobile sizes.

Do not claim realistic, complete, production-ready, or shipped unless fresh
proof supports that exact statement. Call this an educational game-scaled
model, and record known approximations.

---
