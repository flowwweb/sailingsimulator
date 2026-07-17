# Saltwind implementation analysis

Research date: 2026-07-14

Reference: [Saltwind — 3D Sailing Regatta](https://cdn.openai.com/ctf-cdn/sites/saltwind-game/index.html)

This is an analysis of the files delivered to the browser, not a claim about
Saltwind's private source repository or development process.

## What the shipped site reveals

The page is a compact React application delivered through Vinext/RSC and Vite.
Its canvas identifies Three.js r184. The interface is DOM/CSS, while the game
is dynamically loaded as a large Three.js module.

The delivered game contains:

- a fixed `1/60` second simulation step with frame-delta clamping;
- a custom procedural sailboat—hull, deck, mast, boom, sail, rigging, mainsheet,
  telltales, and pennant are built from Three.js geometry rather than a GLB;
- procedural islands plus a small set of tiling materials for rock, sailcloth,
  teak, clouds, foam, and water detail;
- a camera-following ocean mesh displaced by four analytic sine-wave bands and
  a small ripple term;
- the same analytic wave function on the CPU for boat, buoy, wake, and spray
  placement, with wave attenuation at island shorelines;
- a chase camera, fog, sun/sky treatment, particles, wake, buoys, gates,
  responsive resolution scaling, keyboard/touch input, and generated Web Audio;
- a DOM HUD, modal sailing notes, pause/finish screens, local best time, and
  accessible labels/live status.

The main observable files are the
[HTML shell](https://cdn.openai.com/ctf-cdn/sites/saltwind-game/index.html),
[UI module](https://cdn.openai.com/ctf-cdn/sites/saltwind-game/assets/GameExperience-D_ylyX0e.js),
[game module](https://cdn.openai.com/ctf-cdn/sites/saltwind-game/assets/SailingGame-fg0CYjiC.js),
and [configuration](https://cdn.openai.com/ctf-cdn/sites/saltwind-game/assets/config-DRuRse85.js).
Hashed filenames may change if the reference is redeployed.

## What its sailing model does

Saltwind is intentionally an arcade time trial. Its propulsion model uses:

- a hand-authored speed multiplier over absolute wind angle;
- an ideal trim equal to normalized absolute wind angle;
- a Gaussian trim-efficiency curve that bottoms out around 48%;
- smoothed target speed, rudder/yaw response, a small leeway term, and visual
  heel;
- a rechargeable “gust” boost independent of normal sail aerodynamics.

The visible sail is better than the force model: boom angle follows trim, sail
vertices deform, telltales flutter more when efficiency is poor, and the cloth
gains extra oscillation when trim is wrong. That creates convincing feedback,
but the physics does not calculate an apparent-wind vector, sail lift/drag,
keel force, rudder lift, or genuine attached/luff/stall regions.

## What to reuse as principles

1. Keep the game loop fixed-step and the renderer interpolated.
2. Make the visible sail, telltales, wake, heel, audio, and HUD tell the same
   story.
3. Use a camera-centered analytic water surface and share its equation with CPU
   sampling.
4. Build one polished boat and environment instead of an asset-heavy world.
5. Put readable, accessible UI in the DOM rather than baking it into WebGL.
6. Scale quality dynamically and honor reduced-motion preferences.

## What to change for this project

1. Replace wind-angle speed lookup with true wind minus boat velocity to obtain
   apparent wind.
2. Calculate sail angle of attack, lift, drag, luff, attached flow, and stall.
3. Model surge, sway, and yaw with hull drag, keel side force, and rudder force.
4. Remove boost and make gusts part of the weather field.
5. Replace the gate race as the primary loop with four lessons and free sail.
6. Expand the playable scale from a short 1.4 km course to a 3.6 km-wide basin.
   At ordinary training-boat speeds, the 15–24 minute crossing plus haze and
   intermediate islands creates the desired open-water impression without a
   needlessly sparse 100 km² world.
7. Use the original quiet-geometric art direction in
   [art-direction.md](../art-direction.md), not Saltwind's realistic materials.

## External technical anchors

- The RYA describes the no-go zone, points of sail, heading up/sheeting in,
  bearing away/easing, and tacking as beginner fundamentals:
  [Do you know your points of sail?](https://www.rya.org.uk/training/do-you-know-your-points-of-sail/)
- A validated 3-DOF sailboat model uses surge, sway, yaw, the true/apparent wind
  vector triangle, sail angle of attack, and lift/drag coefficients:
  [Parameter Identification of an Unmanned Sailboat](https://www.mdpi.com/2077-1312/12/12/2226)
- Three.js officially recommends npm plus a build tool such as Vite and exposes
  a WebGL `Water` addon; this project uses the same general platform but a
  simpler custom analytic surface:
  [installation](https://threejs.org/manual/en/installation.html) and
  [Water](https://threejs.org/docs/pages/Water.html).

## Claim limits

Bundle inspection can establish observable structure and formulas, but not
authorship history, prompts, private tooling, or why individual decisions were
made. The proposed model is deliberately educational and game-scaled; it is
not a certified naval-architecture simulator or a replacement for on-water
instruction.
