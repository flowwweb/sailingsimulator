# Performance profile and budgets

Fair Winds prioritizes smooth input, coherent sail feedback, and stable water
motion over raw scene complexity. This profile records the current hot paths,
the changes made for the testing build, and the limits of the evidence.

## Runtime budgets

- Fixed simulation: 60 Hz, independent from rendering.
- HUD and landmark text: 10 Hz; updates are skipped when values do not change.
- Audio mix automation: 30 Hz.
- Lighting and atmospheric material refresh: 15 Hz.
- Planar reflection: 24 Hz desktop, 18 Hz compact, with a smaller render target
  than the main view. Water displacement and the main render still update every
  animation frame.
- Device pixel ratio: capped at 1.65 desktop, 1.5 on low-core desktops, and
  1.4 on compact screens.

## Addressed hot paths

- Cached the camera, reflection, wake, and lighting scratch objects instead of
  allocating Three.js vectors, colors, arrays, and sorted landmark lists every
  frame.
- Decoupled DOM instruments, atmosphere, sound mixing, and reflections from the
  render loop while keeping deterministic physics fixed-step.
- Reduced adaptive water geometry and reflection resolution without changing
  the shared CPU/GPU analytic wave definition.
- Excluded rain, wind streaks, and wake lines from the planar reflection pass;
  those effects should not reflect and were wasted draw work.
- Replaced dozens of separate title-headland tree and rock meshes with layered
  instanced low-poly groves and rock fringes.
- Disabled the title-only warm fill light during play so gameplay shaders keep
  the smaller light set.

## Relative profile

Both samples use installed headless Chrome at 1440×900, start play, warm the
scene, and collect a five-second interval. The baseline is the prior hosted
build; the current sample is the richer local testing build. The software/headless
renderer is deliberately treated as relative diagnostic evidence, not as a
real-device benchmark.

| Metric | Prior hosted build | Current testing build | Change |
| --- | ---: | ---: | ---: |
| Main-thread task time | 2979 ms | 2064 ms | -31% |
| Script time | 1996 ms | 1540 ms | -23% |
| Layout time | 287 ms | 73 ms | -75% |
| Style recalculation | 117 ms | 68 ms | -42% |
| JavaScript heap at sample end | 12.2 MB | 12.9 MB | +0.7 MB |

The synthetic frame sample was about 56 FPS with a 33 ms p95 versus roughly
79 FPS and 17 ms in the older, visually simpler hosted build. That is not an
FPS improvement claim: it shows that the remaining bottleneck is GPU/render
cadence, especially reflection frames, while main-thread and DOM cost improved
materially. The current testing gate is therefore visible Chrome smoothness and
real-device feedback, not a fabricated universal target.

## Next performance gates

1. Record Chrome DevTools GPU and frame tracks on one integrated-laptop GPU and
   one current phone.
2. Add dynamic reflection resolution only if a real device misses 30 FPS for
   two seconds; preserve reflection rather than disabling it silently.
3. Add distance-based landmark detail only after a profile shows the title cove
   remains a gameplay hotspot outside the opening scene.
4. Treat 30 FPS compact and 60 FPS desktop as product targets, not confirmed
   device coverage, until those hardware runs are captured.
