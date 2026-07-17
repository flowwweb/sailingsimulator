# 05 · Platform, tools, and assets

## Delivery decision

Browser is the primary product. The game must run from a normal static URL on
desktop and mobile with no account, service dependency, native shell, or
download. The simulation and UI remain platform-neutral.

Version local save data. Unknown or invalid settings fall back to safe defaults
without preventing launch. The page visibility policy must pause fixed-step
accumulation and nonessential audio scheduling so returning to a backgrounded
tab cannot create a giant catch-up step or a burst of stale sounds.

| Stage | Approach | Boundary |
| --- | --- | --- |
| Browser MVP | Vite + TypeScript + Three.js/WebGL | required now |
| Installable web app | manifest, icons, and deliberate offline cache | after core runtime proof |
| iOS/Android | Capacitor wrapper around the existing build | only when app-store distribution/haptics justify it |
| Desktop app | Tauri wrapper around static build | only when a desktop distribution need is demonstrated |

The web app manifest is the browser installability baseline:
[web.dev documentation](https://web.dev/learn/pwa/web-app-manifest). Capacitor
is designed to wrap existing web projects for mobile:
[official documentation](https://capacitorjs.com/docs). Tauri can host a static
web frontend for desktop distribution: [frontend guidance](https://v2.tauri.app/start/frontend/).

## Approved tool decisions

| Tool | Use | Decision |
| --- | --- | --- |
| Three.js | WebGL scene, custom water/sail shaders, procedural boat, rain particles | existing required dependency |
| Vite + strict TypeScript | build and code contracts | existing required tooling |
| Vitest | deterministic simulation and weather tests | existing required tooling |
| `simplex-noise` + repository PRNG | seeded smooth gust field only | add in 3D weather slice |
| `lil-gui` | developer-only tuning of weather/forces/render | add only when actual tuning surface ships; never player UI |
| Web Audio API | procedural wind/water/rain/luff feedback | use before audio libraries |
| Playwright | browser smoke tests, touch/keyboard flows, console checks, screenshots | installed; `npm run test:browser` exercises desktop and 390×844 Chrome |
| `vite-plugin-pwa` | manifest/service worker management | add only at PWA stage |
| Capacitor / Tauri | platform wrappers | defer until distribution need exists |

Three.js documents the npm/build-tool workflow and exposes the geometry/shader
building blocks this project needs: [installation](https://threejs.org/manual/en/installation.html),
[BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html), and
[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html). Playwright
supports cross-browser and mobile-emulated test projects plus screenshots and
traces: [official documentation](https://playwright.dev/).

Do not add React, React Three Fiber, an ECS, Rapier, cloth physics, an external
weather provider, a backend, or WebGPU-only code for the core. A general
rigid-body engine does not supply the sail/keel/rudder equations and adds a
parallel physics source of truth.

## Asset policy

1. **Core assets are procedural.** Boat, sail, telltales, water, wake, rain,
   clouds, terrain silhouettes, and UI need no third-party art to reach the
   target style.
2. **External assets require a ledger.** Before adding one, record source URL,
   exact license, author/attribution requirement, modification, and destination
   in `THIRD_PARTY_NOTICES.md`; place the original license beside the asset.
3. **Prefer CC0 or permissive licenses.** Poly Haven assets are CC0 and may be
   used commercially, but use only a few optional sky/noise/rock references and
   restyle them to avoid photorealism: [license](https://polyhaven.com/license).
4. **Keep interface icons sparse.** If icons become necessary, Lucide offers
   tree-shakable SVG icons under ISC; import only the exact icons used:
   [Lucide](https://lucide.dev/).
5. **Never copy.** Do not extract or reuse Saltwind, commercial-game, or
   unverified marketplace source/assets. A visual reference is not a license.
6. **Audio is licensed per file.** For recorded ambience or one-shots, verify
   each asset rather than trusting a library name. Freesound contains CC0,
   CC-BY, and non-commercial material; the first release should prefer exact
   CC0 assets and keep author/source/license evidence:
   [Freesound FAQ](https://freesound.org/help/faq/).

## Dependency and asset gates

A new dependency or asset is accepted only when it:

- removes current complexity or real duplication;
- has a compatible permissive license and documented provenance;
- fits browser bundle/performance budget;
- does not duplicate an existing platform API or Three.js feature;
- has a specific owner, use site, and removal path;
- updates lockfile and notices only when actually installed.

If it fails one gate, prefer a small repository-owned implementation or defer it.
