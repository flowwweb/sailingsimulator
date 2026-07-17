# Complete game plan

This folder is the implementation map for the one-boat sailing simulator. It
turns the product principles into buildable contracts, not a second design
pitch. Read it before changing the simulation, 3D scene, controls, or the
canonical [one-shot core prompt](../ONE_SHOT_CORE_PROMPT.md).

## Product promise

On a peaceful lake that initially feels like open water, a new sailor can make
one small keelboat come alive by reading the wind, steering to a viable point
of sail, and trimming one mainsail. The player learns from visible cause and
effect: the sail luffs, fills, stalls, loads up, and changes the boat.

## Authority and reading order

| Document | Owns |
| --- | --- |
| [01 · Product contract](01-product-contract.md) | player, scope, mode structure, world scale, non-goals |
| [02 · Sailing controls and feel](02-sailing-controls-and-feel.md) | helm, sheet, boom, sail feedback, camera, lesson interaction |
| [03 · Physics, weather, and waves](03-physics-weather-waves.md) | units, fixed-step model, force laws, weather samples, wave fidelity |
| [04 · World, presentation, and accessibility](04-world-presentation-accessibility.md) | low-poly water, world construction, audio, UI, performance, accessibility |
| [05 · Platform, tools, and assets](05-platform-tools-assets.md) | browser/app delivery, approved dependencies, asset provenance, licenses |
| [06 · Roadmap and proof map](06-roadmap-and-proof.md) | delivery phases, test matrix, visual/runtime proof, release gates |
| [07 · Fun, immersion, and ambient audio](07-fun-immersion-audio.md) | core fun loop, landmarks, responsive delight, dynamic soundscape, playtesting |

Existing supporting documents remain authoritative for their narrow subjects:
[physics model](../physics-model.md), [architecture](../architecture.md),
[game design](../game-design.md), [art direction](../art-direction.md), and
[Saltwind analysis](../research/saltwind-analysis.md).

## Fidelity hierarchy

The word “realistic” means that controls and feedback obey the listed causal
relationships. It does **not** claim naval-architecture certification or replace
on-water instruction.

1. **Must be correct in the core:** apparent wind; sheet-to-boom constraint;
   luff/attached/stall distinction; speed-dependent rudder authority; keel
   resistance and leeway; tack speed loss; deterministic wind and wave samples.
2. **Must be coherent in the core:** heel, wake, pennant, telltales, sail motion,
   audio, HUD, rain, fog, and water pose all agree with the same snapshot; the
   first minute contains a satisfying luff-to-attached transition.
3. **Implemented validation extensions:** optional linked headsails and two
   larger monohull definitions, six bounded sea states through Storm,
   draft-sensitive grounding, deterministic object collision, and an incident
   recovery cinematic. These validate extensibility without widening the
   default one-mainsail teaching loop.
4. **Explicit later work:** independently controlled headsail sheets, reefing,
   capsize recovery physics, currents, full docking simulation, structural
   damage simulation, six-degree rigid-body dynamics, multiplayer, racing
   rules, and real-world weather feeds.

Do not let visual polish substitute for level 1, and do not let level 3 delay
the playable teaching loop.
