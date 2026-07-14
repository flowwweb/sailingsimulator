# Repository guidance

## Product boundary

Build one small, realistic teaching simulator: one boat, one large lake, one
mainsail, wind, trim, luffing, points of sail, tacking, and free exploration.
Do not add multiplayer, racing boosts, combat, economy, survival systems, or a
fleet of boats until the core sailing model is proven.

## Engineering rules

- Keep the deterministic simulation independent from Three.js and the UI.
- Run simulation at a fixed timestep; render by interpolating state.
- Use apparent wind for sail forces. Keep lift, drag, hull resistance, keel
  side force, rudder force, heel, and luff/stall state explicit and testable.
- The sheet controls the sail; it must not be an invisible speed slider.
- The visible sail, telltales, wake, heel, audio, HUD, and physics state must
  agree.
- Prefer analytic waves with the same wave function on CPU and GPU.
- Preserve broad WebGL compatibility before considering WebGPU-only features.
- Keep lesson UI quiet and contextual. Teach through cause and effect.

## Proof

Before claiming a physics change is correct, add or update deterministic tests
for the relevant force/state transition and run `npm test` plus `npm run build`.
For visual or interaction changes, also verify the rendered result at desktop
and mobile sizes and state what was not visually verified.
