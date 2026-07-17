# Sailing Simulator

A focused browser game for learning the first principles of sailing on a lake
large enough to feel like open water.

**Live test build:** [floeb-sailingsimulator.web.app](https://floeb-sailingsimulator.web.app/)

The current repository slice is a browser-playable 3D core. Steer, sheet in or
ease out, read apparent wind, see and hear the sail luff or stall, find
attached flow, tack through the no-go zone, change the weather, and explore a
large lake with sparse distant landmarks. The opening menu is itself a live
golden-hour scene: analytic waves, reflected shores, the sailing boat, North
Light, ambient lake sound, and the Fair Winds theme all use the same in-game
rendering and audio systems as play.

![Core gameplay direction](docs/mockups/02-core-gameplay.png)

## The product in one sentence

Give a new sailor one responsive boat, readable wind, a physically coherent
sail, and a huge beautiful lake—then let understanding emerge from the boat's
behavior.

## Why this is the easiest credible approach

- Build for the browser with Vite, TypeScript, and Three.js/WebGL.
- Treat the browser build as the primary product, then add installable PWA or
  native wrappers only after the core is proven; the same simulation and UI
  remain shared across all targets.
- Simulate only planar surge, sway, and yaw; derive heel and wave motion for
  believable feedback instead of starting with full six-degree rigid-body CFD.
- Keep a deterministic fixed-step physics module separate from rendering.
- Use apparent wind and lift/drag curves for the sail, strong lateral keel
  resistance, water-flow rudder force, and quadratic hull drag.
- Render an adaptive reflected wave surface and sample the exact same
  six-component second-order field on the CPU for boat motion.
- Use a 3.6 km-wide basin. At 5–8 knots, a full crossing takes roughly
  15–24 minutes; atmospheric haze, a low eye height, and local islands keep the
  outer perimeter from reading as a small pond.
- Teach four things before adding more systems: wind direction, trim/luffing,
  points of sail, and tacking.

## Run the playable core

```powershell
npm install
npm run dev
```

Controls: `A/D` or arrow keys steer, `W` eases the sheet, `S` sheets in, and
`R` resets. `C` opens Settings and `M` mutes all audio. Touch controls stay
visible on compact screens. Choose **Continue** or **New journey** once to
enable the lake soundscape and Fair Winds theme. Settings provide persisted
master, music, ambience, boat/sail, and weather volumes plus playlist controls.

Run the deterministic contracts and production build before sharing a test:

```powershell
npm test
npm run build
npm run test:browser
```

`npm run test:browser` uses installed Chrome to exercise the production build
at 1440×900 and 390×844, including keyboard/touch sail input, Settings, boat
persistence, screenshots, and a strict console/page-error gate. Deploy the
same static build with `npm run deploy:firebase`; the default project is kept
in `.firebaserc`.

See [Testing round](docs/TESTING.md) for the focused manual scenarios and the
current simulation approximations.

## Project map

- [Saltwind analysis](docs/research/saltwind-analysis.md)
- [Game and learning design](docs/game-design.md)
- [Physics model](docs/physics-model.md)
- [Technical architecture and delivery plan](docs/architecture.md)
- [Complete segmented game plan](docs/game-plan/README.md)
- [Short-sprint core blueprint](docs/short-sprint-blueprint.md)
- [One-shot core build prompt](docs/ONE_SHOT_CORE_PROMPT.md)
- [Incremental master build prompt](docs/MASTER_PROMPT.md)
- [Ten visual mockups](docs/mockups/README.md)
- [Testing round](docs/TESTING.md)
- [Performance profile and budgets](docs/PERFORMANCE.md)

## Product guardrails

The Harbor 20 mainsail trainer remains the default. Settings also expose a
Coastal 28 and Lake 34 to validate optional headsails, distinct drafts, mass,
handling, camera scale, and reference polars. The release remains one focused
lake without boost mechanics, multiplayer, combat, trading, or survival meters.

## Reference and originality

[Saltwind](https://cdn.openai.com/ctf-cdn/sites/saltwind-game/index.html) was
studied as an observable browser reference. No Saltwind code, textures, names,
or other assets are included here. The implementation and generated mockups in
this repository are original.
