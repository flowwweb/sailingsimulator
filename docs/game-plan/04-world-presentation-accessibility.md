# 04 · World, presentation, and accessibility

## Visual language

Follow [quiet geometric modernism](../art-direction.md): intentional low-poly
geometry, controlled facet size, soft ambient light, sparse premium materials,
maritime editorial colour, and crisp silhouettes. It must feel contemporary,
not photorealistic, childish, retro low-poly, or generic mobile-game glossy.

## Water and lake

- Render one coherent adaptive triangular water surface. It uses the shared
  six-component analytic wave spectrum for vertex displacement, smooth
  analytic normals, subtle low-poly colour faceting, restrained Fresnel and
  specular highlights, and local wake foam.
- Never use a tiled polygon collage, disconnected ribbons, perfectly mirrored
  water, or coarse geometry presented as an aesthetic shortcut. Use one
  resolution-capped planar reflection pass distorted and softly blurred by the
  analytic wave normal so scenery, the boat, and the sun path read naturally.
- Use fog, colour layers, a low eye line, and sparse distant terrain sectors to
  hide shoreline naturally. Do not fake ocean scale with an invisible wall.
- Render terrain as procedural/instanced silhouette sectors and collision as a
  later coarse navigation polygon. Decorative render meshes never define water
  collision.

## Boat, sail, and feedback

The boat is a small procedural mesh set: hull, deck, cockpit, keel, rudder,
mast, boom, sail, mainsheet, pennant, and telltales. Correct proportion and
legible function matter more than texture density.

The sail is a custom weighted grid, not cloth simulation:

- boom orientation comes from the actual boom state;
- attached flow adds stable camber and taut telltales;
- luff adds localized leading-edge flutter and unstable telltales;
- stall adds slower whole-sail turbulence and deeper-looking camber;
- gusts increase load/camber/heel in proportion to the physics snapshot;
- normals update at a controlled rate; no per-frame allocations in hot paths.

Wake begins only when meaningful water speed and drive exist. It widens and
brightens modestly with speed; it fades in luff/no-go coasting. It must not
continue like a motorboat wake after sail drive disappears.

## Audio

Use the full [fun and ambient-audio contract](07-fun-immersion-audio.md). Browser
Web Audio starts after the `Set Sail` gesture. The mix combines a quiet
continuous lake soundscape with physics-driven layers:

- open-lake air/water ambience and proximity-based distant wildlife;
- wind intensity follows apparent wind and gust factor;
- water sound follows speed and wave exposure;
- rigging, block, boom, hull-creak and wave-slap events follow sail load and
  the damped wave-pose response;
- luff is localized cloth flutter, not a permanent wind loop;
- stall is a lower turbulent rush, distinct from luff;
- rain follows rain intensity and pauses cleanly.

Respect master and category volume/mute, headroom, mono compatibility, and
`prefers-reduced-motion`. Audio is feedback, never the sole indication of a
required lesson state. A constant melodic soundtrack must not mask sailing.

## UI and accessibility

- DOM/CSS owns all readable interface: launch, HUD, pause, Conditions, lesson
  message, accessibility settings, and touch controls. Canvas contains no
  critical text or button.
- HUD: wind/point-of-sail compass, speed and trend, sheet position, one lesson
  message, pause, Conditions. Hide diagnostic numbers by default.
- Conditions drawer: presets, manual/evolving, wind speed/direction, gusts,
  wave link/height/period/direction, rain, visibility, seed, time scale,
  restart-from-seed, and copy configuration. Less common controls sit behind
  an Advanced disclosure.
- Use semantic buttons, labels, focus order, Escape dismissal, focus return,
  visible focus styles, keyboard equivalents, and an aria-live region for the
  single coaching sentence.
- Do not require colour alone: luff/stall/attached each have motion, shape,
  sound, and plain-language cues. Reduced motion lowers camera sway, rain
  density, sail flutter amplitude, and water movement without changing physics.

## Performance and quality tiers

| Tier | Target | Adjustments |
| --- | --- | --- |
| Desktop | 60 fps at 1080p on a mid-range laptop | moderate water grid, rain density, pixel ratio cap |
| Mobile | 30 fps on supported phones | lower pixel ratio, reduced water/rain density, fewer distant instances |
| Reduced motion | readability first | no aggressive camera/sail/rain motion; physics unchanged |

Use one directional light plus hemisphere/ambient light, fog, shared materials,
instancing, a capped half-resolution planar reflection target, and dynamic pixel
ratio caps. Avoid SSR, expensive post-process chains, large texture packs, and
per-frame geometry recreation.

## Render acceptance

At 1440×900 and 390×844, a player can identify wind direction, sail state,
point of sail, speed trend, helm/sheet controls, and the active lesson without
console errors or hidden-overflow controls. The water and boat remain legible
in Learning Day and Rain Shower, with quality changes affecting density—not the
meaning of the sailing feedback.
