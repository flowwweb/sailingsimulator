# Core acceptance evidence

This file maps the Fair Winds playable-core claim to repository-owned proof.
It is an acceptance map, not a claim of naval-architecture certification or a
substitute for an observed human playtest.

## Automated gates

| Gate | Command | Contract |
| --- | --- | --- |
| Deterministic simulation | `npm test` | apparent wind, lift/drag states, rudder/keel/drag behavior, boat definitions and polars, academy stages, activity scoring, course vectors, traffic encounters, weather forecasts, progress storage, PWA contracts, waves, bathymetry, hazards, audio mixing |
| Production bundle | `npm run build` | strict TypeScript and deployable Vite bundle |
| Chrome acceptance | `npm run test:browser` | production launch, keyboard sheet input, 390×844 touch hold/target size, academy/activity/logbook flow, Settings, high contrast, PWA endpoints, boat persistence, zero console/page errors, desktop/mobile captures |
| Hosted acceptance | `$env:PLAYWRIGHT_BASE_URL='https://fairwinds.web.app'; npm run test:browser` | the same Chrome flow over the deployed HTTPS build |

The browser run writes ignored evidence to `.artifacts/visual-qa/` so local QA
captures do not inflate the public repository.

## Requirement map

| Requirement | Authoritative implementation | Evidence |
| --- | --- | --- |
| Geometric brand and restrained HUD | `index.html`, `src/style.css` | desktop and 390×844 Chrome captures |
| Live cinematic title scene | `src/main.ts`, `src/render/world.ts`, `public/brand/`, `public/music/` | animated-frame assertion, Chrome interaction/audio check, desktop and portrait captures |
| Large stylized mountain lake | `src/render/scenery.ts`, `src/game/bathymetry.ts`, `src/game/world-definition.ts` | visual captures plus deterministic depth tests |
| Reflected analytic water and sea states | `src/render/world.ts`, `src/weather/waves.ts`, `src/weather/types.ts` | shared CPU/GPU spectrum tests and Calm-through-Storm visual checks |
| Boat reacts to waves | `src/game/wave-pose.ts`, `src/sim/model.ts` | response-energy and boat-dimension deterministic tests |
| Correct teaching sail loop | `src/sim/model.ts`, `src/game/academy.ts` | luff/attached/stall/no-go/tack/gybe/reef tests plus keyboard/touch browser flows |
| Academy, activities, scoring, and logbook | `src/game/academy.ts`, `src/game/activity-session.ts`, `src/game/progress.ts` | deterministic stage/evaluator/storage tests plus scored-docking and activity browser flows |
| Course and traffic decisions | `src/game/course-navigation.ts`, `src/render/traffic-navigation.ts` | bearing/VMG and encounter tests plus live HUD assertions |
| Forecast-led reef decisions | `src/weather/forecast.ts`, `src/main.ts` | deterministic trend thresholds and browser weather-settings proof |
| Mainsail trainer and extensible sloops | `src/sim/boats.ts`, `src/render/world.ts` | three boat-definition tests and headsail capture |
| Grounding, collisions, incident view | `src/game/hazards.ts`, `src/main.ts`, `src/render/world.ts` | draft/collision tests and impact cinematic capture |
| Weather, rain, day/night, ambient sound | `src/weather/`, `src/audio/`, `src/render/scenery.ts` | deterministic weather/audio tests and manual visual/audio round |
| Browser and app-ready architecture | static Vite/WebGL build, responsive DOM controls, `public/manifest.webmanifest`, `public/sw.js`, `firebase.json` | local/live Chrome lanes, installable/offline-shell contracts; native wrappers deliberately deferred |

## Visual review set

The current acceptance set is generated locally under `.artifacts/visual-qa/`:

- `browser-title-desktop-1440x900.png` — title composition and brand;
- `browser-title-mobile-390x844.png` — exact portrait title framing;
- `browser-desktop-1440x900.png` — live desktop play with the headsail sloop;
- `browser-mobile-390x844.png` — exact compact/touch layout;
- `rough-sea-final.png` — higher sea-state surface and hull response;
- `coastal-headsail.png` — optional headsail geometry and diagnostics;
- `impact-cinematic-final.png` — collision zoom-out and collapsed-rig state.

Review these against the ten source mockups for composition, palette, water,
environmental depth, logo geometry, instrument restraint, and touch-safe layout.

## Claim limits and remaining product proof

- The model is a deterministic educational sailing simulation: planar
  surge/sway/yaw with derived heel and sampled hull wave response. It is not
  CFD, a certified polar predictor, or a complete six-degree structural model.
- The visual evidence is Chrome/SwiftShader automation on this Windows host.
  Firefox, Safari/WebKit, real-phone performance, and real-device audio remain
  public-release gates, not blockers for the current testing round.
- “Fun” and first-minute teaching success require observed beginner and sailor
  sessions. Use `docs/TESTING.md`; do not infer those outcomes from unit tests.
- Performance findings and their measurement limits are recorded in
  `docs/PERFORMANCE.md`; the synthetic renderer is not evidence of a universal
  device frame rate.
