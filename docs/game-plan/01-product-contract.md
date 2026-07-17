# 01 · Product contract

## Player and learning outcome

The primary player is a curious beginner, not a racing expert. After one short
session they should be able to say:

- wind has a direction and the boat cannot sail directly into it;
- the sail is not a throttle: I steer and adjust it to the wind;
- too loose luffs, correctly trimmed flow draws, too tight stalls;
- a tack costs speed because the boat crosses the no-go zone and the sail must
  settle onto the new side.

The game is a safe practice companion, not a certification tool or replacement
for qualified on-water instruction.

## Core product

| Area | Core commitment |
| --- | --- |
| Vessel | Harbor 20 mainsail trainer first; Coastal 28 and Lake 34 validation profiles prove optional headsail, mass, draft, handling, camera, and polar contracts |
| World | Freshwater mountain basin 3.6 km across; central start, local islands, and atmospheric outer-shore reveal |
| Modes | One guided trim lesson and Free Sail first; later three small lessons: find wind, points of sail, tack |
| Conditions | Manual and seeded evolving weather, with wind, gusts, waves, rain, visibility, cloud, time scale, and presets |
| Controls | Keyboard, touch, and optional gamepad only when it maps to the same helm and sheet model |
| Presentation | Quiet geometric modernism and standard coherent low-poly water, not photorealism or toy-like art |
| Save | Local-only preferences, last Conditions preset, seed, and lesson progress; no account or server |

## Fun and session contract

- First useful input within 15 seconds of choosing `Learn` or `Free Sail`.
- First clear luff-to-attached success within the opening minute for a beginner
  who follows the single coaching sentence.
- Every two or three minutes, changing wind, a gust, a wave set, visible
  landmark, or player-chosen experiment offers a new low-pressure decision.
- Free Sail contains two or three visible destinations in the test basin and a
  sparse final-lake landmark set. They create direction without quests,
  collectible currency, or a racing course.
- The player may change Conditions, restart from seed, or continue sailing at
  any time. Learning never locks the sandbox.

## Mode structure

### Start and free sail

The launch screen offers `Learn`, `Free Sail`, and `Conditions`. Free Sail is
always available. It starts on a broad or beam reach with a safe default
Learning Day preset, so the first minute feels responsive rather than stalled.

### First lesson: make the sail draw

1. Place the boat on a beam reach with the sheet deliberately eased.
2. Show one sentence: “Sheet in until the leading edge stops fluttering.”
3. Detect sustained attached flow, then invite a deliberate over-sheet.
4. Detect stall and ask the player to ease back to a narrow attached band.
5. Finish with a calm Free Sail handoff. No timer, score, fail screen, or
   perfect-input demand.

Later lessons teach wind direction, points of sail, and tacking. They cannot
introduce new hardware before the player has learned the one sail and one helm.

## World contract

- World coordinates use meters across the implemented 1.8 km radius.
- The player begins near the center. Low camera height, fog,
  layered terrain silhouettes, and sparse tall landmarks delay the shoreline
  reveal naturally.
- A full crossing is intentionally slow: roughly 15–24 minutes at 5–8 knots.
- Shoreline/grounding truth comes from analytic bathymetry and deterministic
  object volumes, never collision against decorative meshes.

## Non-negotiable non-goals

Do not add these before the core proof map is green:

- multiplayer, leaderboards, race starts, racing rules, AI opponents, or boosts;
- cargo, economy, survival, combat, fishing, crafting, character progression,
  or a fleet;
- jibs, spinnakers, reefing, sail inventories, anchors, docking, damage,
  capsize, or full six-degree rigid-body hydrodynamics;
- real-world weather APIs, cloud services, accounts, telemetry, or native-only
  features;
- photoreal asset packs, licensed boat models, or copied assets/code.

## Decisions that protect the experience

- A large lake is exploration pacing, not content padding; sail feedback must
  remain interesting while nothing else happens.
- Sparse landmarks give the player somewhere to choose to sail while preserving
  the open-water feeling; they are not a progression system.
- Weather is a condition the player reads and adjusts, not a difficulty slider
  or power-up generator.
- The instrument panel confirms the world. It must not become a dashboard that
  tells the player exactly what to do every second.
- Every later system must preserve the beginner’s ability to understand why the
  boat reacted as it did.
