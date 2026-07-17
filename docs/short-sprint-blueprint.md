# Short-sprint core blueprint

Research date: 2026-07-14

## Decision

Build the first playable 3D core in the existing Vite + strict TypeScript +
Three.js repository. Keep the custom fixed-step 3-DOF sailing model and add a
deterministic weather service between the world configuration and the boat.

Ship it browser-first: a static web build that starts from a normal URL on
desktop and mobile. Keep the code platform-neutral so the same build can become
an installable PWA, a Capacitor iOS/Android app, or a Tauri desktop app later.
Do not build or maintain separate game implementations.

Use only two small additions:

- [`simplex-noise`](https://www.npmjs.com/package/simplex-noise) for seeded,
  smooth spatial and temporal gust variation;
- [`lil-gui`](https://lil-gui.georgealways.com/) as a development-only tuning
  surface, never as the shipped player interface.

The player-facing Conditions drawer remains ordinary accessible DOM/CSS. Rain,
wind streaks, telltales, sail deformation, the lake, and the boat are rendered
with Three.js. Audio uses the browser Web Audio API. Vitest remains the contract
test runner.

### Delivery path

1. **Browser MVP:** static Vite build, touch controls, keyboard controls, and
   responsive WebGL quality settings. This is the short-sprint deliverable.
2. **Installable web app:** add a web app manifest, icons, and an offline cache
   only after the core works. A manifest is the baseline browser installability
   contract: [web.dev guidance](https://web.dev/learn/pwa/web-app-manifest).
3. **Native mobile wrapper when justified:** add Capacitor around the existing
   web build for App Store/Google Play distribution, haptics, and native
   lifecycle handling. Capacitor is designed to be added to an existing modern
   JavaScript app: [official documentation](https://capacitorjs.com/docs).
4. **Desktop wrapper only if there is demand:** use Tauri to package the static
   frontend as a small desktop app. Do not add Tauri-specific APIs to ordinary
   gameplay code, so the browser remains first-class:
   [Tauri frontend guidance](https://v2.tauri.app/start/frontend/).

## Why this is the fastest credible route

Three.js officially supports the repository's npm + Vite setup. Its
`BufferGeometry` and `ShaderMaterial` APIs are sufficient for a custom
triangulated water surface, procedural sail mesh, rain points, and lightweight
atmosphere without adding an asset pipeline:
[installation](https://threejs.org/manual/en/installation.html),
[BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html), and
[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html).

The sailing problem is not primarily collision physics. It is a small set of
domain forces: apparent wind, sail lift and drag, keel side force, hull drag,
rudder force, and yaw moment. A general rigid-body engine would still require
these custom equations. Rapier is a strong option later for contact and
collisions, but its JavaScript package is an asynchronously loaded WebAssembly
rigid-body/contact engine. That is additional machinery without solving the
core aerodynamic problem: [Rapier JavaScript guide](https://rapier.rs/docs/user_guides/javascript/getting_started_js/).

A compact 3-DOF model is also a defensible engineering simplification. A
published, sea-trial-verified unmanned sailboat model uses surge, sway, yaw,
true/apparent wind, sail angle of attack, and lift/drag coefficients. This game
uses a deliberately less detailed, educational version of that structure:
[Chen et al., 2024](https://www.mdpi.com/2077-1312/12/12/2226).

## Platform comparison

| Platform | Strength | Cost for this project | Decision |
| --- | --- | --- | --- |
| Three.js + Vite | Direct browser/DOM integration, procedural geometry, custom shaders, smallest conceptual surface | We must own the game loop, weather, and force model | **Use now** |
| Babylon.js | Full web game engine, inspector, broad built-in feature set, official Vite/TypeScript scaffold | Stack migration and more engine surface than this one-scene game needs | Good alternative only before a repository exists |
| PlayCanvas | Strong WebGL/WebGPU engine and collaborative visual editor | Editor/platform workflow is unnecessary for a procedural, repo-first game | Good for an art-heavy web team, not this sprint |
| Godot | Excellent general game editor and native export path | Web export adds a WebAssembly/package pipeline and web-specific constraints | Prefer if native desktop/mobile becomes the primary target |
| Unity WebGL | Mature editor and ecosystem | Heaviest iteration/build/deploy route for a small browser-first project | Do not use for the core |

Official comparison anchors:

- Babylon.js can scaffold TypeScript + Vite and exposes a much larger engine
  surface: [create-babylonjs](https://doc.babylonjs.com/setup/createBabylonJS).
- PlayCanvas supports standalone engine or editor workflows and WebGL/WebGPU:
  [engine](https://developer.playcanvas.com/user-manual/engine/) and
  [graphics](https://developer.playcanvas.com/user-manual/graphics/).
- Godot's browser export requires WebAssembly and WebGL 2. Its documentation
  describes thread/header, mobile-performance, and audio constraints:
  [exporting for Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

## Weather is a core service, not an effect

The first 3D slice must support both exact manual conditions and deterministic
evolving conditions. The boat never reads controls or visual effects directly;
it receives a weather sample for its position and simulation time.

```text
WeatherConfig + seed + sim time + world position
                    │
                    v
             WeatherSnapshot
        ┌───────────┼────────────┐
        v           v            v
  true wind     wave field   atmosphere
        │           │            │
        v           v            v
  sail forces   CPU boat      rain/fog/light/
                pose + GPU     wind streaks/audio
                water shader
```

Recommended contracts:

```ts
type WeatherMode = "manual" | "evolving";
type WaveMode = "linked" | "manual";

interface WeatherConfig {
  mode: WeatherMode;
  seed: number;
  timeScale: number;
  wind: {
    speedMps: number;
    directionFromDeg: number;
    gustStrength: number;
    gustScaleM: number;
    gustPeriodS: number;
    shiftRangeDeg: number;
  };
  waves: {
    mode: WaveMode;
    heightM: number;
    periodS: number;
    directionFromDeg: number;
  };
  rain: { intensity: number };
  visibilityM: number;
  cloudCover: number;
}

interface WeatherSnapshot {
  trueWind: { x: number; y: number };
  gustFactor: number;
  wave: WaveParameters;
  rainIntensity: number;
  visibilityM: number;
  cloudCover: number;
}
```

Centralize the conversion from meteorological “wind from” degrees to the world
vector the air travels toward. The HUD, pennant, streaks, and simulation must
all use that conversion.

### Manual mode

- Values are exact and remain fixed until the player changes them.
- Wind speed and direction update the true-wind field on the next fixed tick.
- Waves may be linked to wind or independently overridden.
- Rain and visibility are independent controls.
- Pausing simulation time freezes gust and wave phase without breaking input.

### Evolving mode

- A seeded base timeline changes wind direction, wind speed, rain, cloud, and
  visibility slowly within configured bounds.
- Seeded simplex noise supplies local gust patches. It modifies the weather
  field, not player power or boat speed directly.
- Wave energy and direction ease toward the prevailing wind with a lag; they do
  not jump when wind changes.
- Given the same seed, inputs, fixed timestep, and sampled positions, the same
  snapshots must be produced.

### Deliberate approximation

Waves drive visual heave, pitch, and roll by sampling the same analytic wave
function used by the GPU water shader. They do not add full six-degree
hydrodynamic forces in the short-sprint core. Rain changes visibility, color,
particles, and audio but not grip, mass, or sail coefficients. These seams are
explicit so they can be expanded later.

## Shipped controls

The Conditions drawer should contain presets plus a compact advanced section:

- mode: Manual / Evolving;
- wind speed and “from” direction;
- gust strength and direction-shift range;
- wave link toggle, height, period, and direction;
- rain intensity, visibility, and time scale;
- seed, restart from seed, and copy/share configuration.

Start with four presets: `Learning Day`, `Variable Breeze`, `Rain Shower`, and
`Calm Evening`. Keep the full tuning matrix in development-only `lil-gui`.

## Five-day vertical-slice budget

| Day | Durable result |
| --- | --- |
| 1 | Weather types, presets, manual/evolving sampling, seed tests, and fixed-step composition |
| 2 | Three.js scene, chase camera, standard low-poly water, procedural boat, and sail mesh |
| 3 | Boat/sail renderer driven by physics snapshots; luff, attached flow, stall, heel, wake, and telltales |
| 4 | Conditions drawer, rain, fog/light response, wind cues, audio, and one trim lesson |
| 5 | Tuning, desktop/mobile interaction QA, determinism scenarios, build, and evidence captures |

The implemented sprint has grown into a 3.6 km basin with local islands,
day/night lighting, six bounded sea states, bathymetry, grounding, object
collision, and an incident cinematic. It still does not claim full docking
simulation, all four lessons, structural damage physics, or release packaging.

## Definition of done

- Manual wind, waves, rain, and visibility can be changed while sailing.
- Evolving weather is bounded, gradual, pausable, and reproducible by seed.
- Changing true wind changes apparent wind, sail state, forces, telltales,
  audio, wake, and HUD coherently.
- Under-trimmed luff, attached flow, and over-trimmed stall are visibly and
  physically distinct.
- The water is one coherent triangulated low-poly surface; CPU boat pose and
  GPU waves agree.
- Rain is performant, readable, and can be set to zero.
- Keyboard and touch can steer and trim; the Conditions drawer is accessible.
- Fresh `npm test` and `npm run build` pass. Desktop and mobile runtime checks
  show no console errors.

This definition proves a playable educational vertical slice. It does not
prove certified realism, finished content, production performance, or live
deployment.
