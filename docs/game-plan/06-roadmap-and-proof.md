# 06 · Roadmap and proof map

## Delivery sequence

| Phase | Deliverable | Exit proof | Explicitly deferred |
| --- | --- | --- | --- |
| 0 · Physics lab | current top-down lab, force curves, deterministic tests | apparent wind, luff/attached/stall, no-go, finite long run | 3D scene, weather variation |
| 1 · Weather core | typed manual/evolving conditions, seed, gust field, analytic waves, tests | same seed/sample reproducibility; bounded wave samples; manual holds exact | rain rendering, world art |
| 2 · 3D sailing slice | procedural boat/sail, camera, coherent water, fixed-step interpolation | 3D feedback matches snapshot at desktop/mobile | large lake, all lessons |
| 3 · Interaction and lesson | keyboard/touch, Conditions, dynamic ambient soundscape, trim lesson, Free Sail | player can find attached flow and deliberately stall/luff; audio follows the same snapshot | racing, progression |
| 4 · Lake and exploration | 3.6 km basin, terrain sectors, islands, landmarks, proximity ambience, fog reveal, bathymetry, grounding and object collision | world-scale/performance capture, long free-sail smoke, voluntary destination choice | docking simulation, economy, multiplayer |
| 5 · Browser quality | accessibility, PWA, browser/device matrix, release checklist | named-device evidence, no-console-error flows | native wrappers unless justified |
| 6 · Optional distribution | Capacitor/Tauri only after browser proof and demand | store/package-specific QA | new gameplay features |

Each phase is a separate, reviewable implementation task. The one-shot prompt
is permitted to complete Phases 1–3 as a cohesive playable core only when the
repository is otherwise clean enough to do so safely.

## Test layers

| Layer | Tool / evidence | Contract |
| --- | --- | --- |
| Unit | Vitest | vectors, angle wrapping, force curves, weather/wave samples, integrator invariants |
| Scenario | Vitest deterministic input tapes | trim states, tacks, gust entry, no-go recovery, long finite runs |
| Build | `npm run build` | strict TypeScript and production bundle compile |
| Browser smoke | Playwright | launch, keyboard/touch, Conditions, boat/settings persistence, no console errors, desktop/mobile screenshots |
| Visual | named screenshots/video at desktop + mobile | sail/water/HUD readability; no layout claim without rendered evidence |
| Performance | browser performance capture on named hardware | tier targets; no universal FPS claim |
| Accessibility | semantic inspection plus keyboard/reduced-motion flows | focus, labels, drawer behavior, non-colour feedback |
| Playtest | observed beginner + sailor sessions | first-minute success, understandable controls, voluntary continuation, fatigue notes |

## Scenario catalogue

Keep stable input tapes and expected bounded outputs for:

- beam-reach acceleration after correct trim;
- sheet-out luff, sheet-in attached, over-sheet stall;
- heading up into no-go and loss of steerage;
- controlled tack from attached flow to the opposite tack and recovery;
- gust patch entry and exit without discontinuity or boost behaviour;
- manual wind/wave/rain changes at fixed simulation boundaries;
- same-seed WeatherSnapshot and final BoatState reproducibility;
- wave height/slope sampling across a long route;
- pause/resume without weather phase jumps;
- keyboard and touch equivalence for normalized helm/sheet input.
- audio context starts after user gesture; state-driven buses crossfade without
  abrupt gain changes; mute and persisted volume work.

Tests prove force/state contracts, not subjective “fun.” Play sessions and
render captures are required for camera, feel, visual legibility, and pacing.

## Quality gates

### Before merging a physics or weather change

- relevant deterministic test added or updated;
- `npm test` passes;
- `npm run build` passes;
- coefficients/approximations recorded in the relevant document;
- visual feedback remains aligned if a derived diagnostic changed.

### Before claiming a 3D interaction change works

- desktop and mobile runtime capture completed;
- keyboard and touch flow exercised;
- browser console checked;
- reduced-motion and focus behavior inspected;
- any missing device/browser proof stated plainly.
- ambient loops/transitions checked for repetition, clipping, fatigue, and
  contradiction with visible conditions.

### Before public browser release

- static hosting works over HTTPS;
- named browser matrix covers Chromium, Firefox, and Safari/WebKit where
  available; mobile uses at least one real supported phone;
- performance tier evidence names device, browser, resolution, and conditions;
- privacy, third-party notices, attribution, local-data behavior, and known
  limitations are published;
- no claim says “realistic” beyond the documented educational model.

## Core completion definition

The core is ready for a playtest—not necessarily public release—when a player
can launch the browser game, choose a preset, steer, trim, see luff/attached/
stall, feel a tack, change conditions, experience bounded rain/waves, complete
the trim lesson, hear a coherent condition-aware ambient soundscape, and free
sail toward a chosen landmark without console errors. The test/build/runtime
and observed playtest evidence must support every part of that statement.

## Next decision after the core

Run a structured playtest with beginners and sailors. Use observed confusion to
choose exactly one next slice: improve sail feedback, improve lesson language,
add points-of-sail/tack lessons, or scale the lake. Do not choose a content or
platform expansion merely because it is easier to demonstrate.
