# Fair Winds visual and world redesign plan

## Decision

The ten July 17 mockups are the visual north star for the playable game. They
define a single coherent style rather than ten alternative themes:

- cinematic, carefully composed third-person sailing;
- stylized low-poly terrain with controlled facet size;
- smooth, reflective, gently faceted water rather than a polygon mosaic;
- mountain-lake geography with conifers, rock shelves, coves, islands, docks,
  navigation marks, cabins, and lighthouses;
- atmospheric lighting that can move from clear day through sunset, mist, rain,
  blue hour, and night without changing art style;
- a geometric white sail mark, widely tracked FAIR WINDS wordmark, diamond and
  rule motif, and warm amber as the only regular accent;
- thin white instruments placed around the edge of the view, with the world
  carrying most of the meaning.

The large centered logo is a launch, lesson-introduction, or discovery
composition. It is not a permanent gameplay watermark. During normal sailing,
the logo reduces to a small corner identity or disappears completely.

## Visual audit of the references

| Reference pattern | What it establishes | Implementation rule |
| --- | --- | --- |
| Boat occupies roughly 8–22% of the frame | The lake is the hero and the boat has believable scale | Default camera is an aft three-quarter chase view with dynamic distance, not an overhead toy camera |
| High-quality smooth water inside a low-poly world | “Low poly” describes authored form and terrain shading, not visibly coarse water tiles | Use one continuous displaced surface, high-enough tessellation, controlled normals, depth color, Fresnel, sun path, shoreline foam, and wake |
| Faceted mountains, rocks, and conifers | Intentional geometry replaces texture detail | Use shared procedural meshes, instancing, vertex colors, flat/weighted normals, and three distance LOD bands |
| Sunrise, clear day, mist, blue hour, night | Lighting and atmosphere create variety | Drive sky, sun/moon, fog, ambient color, exposure, cloud color, and practical lights from one environment snapshot |
| Sparse white instruments | Information is readable without card walls | Default HUD has no large opaque panels; panels appear only for transient lessons, menus, or warnings |
| Compass, wind, speed, trim, objective, waypoint | These are the persistent information hierarchy | Build five reusable SVG/DOM instruments with a consistent 1 px line system |
| Lighthouse, buoy, dock, cabin, cove | Exploration needs authored destinations and hazards | World objects come from one deterministic registry used by render, minimap, lessons, collisions, and audio |
| Amber diamonds/rules | A restrained navigation and progress accent | Amber is reserved for target, warning, active lesson, and selected control states |

## Brand system

### Mark

Create the sail mark as an inline SVG so it remains crisp at every resolution:

- tall mainsail triangle on the left;
- narrower headsail triangle on the right;
- consistent mast gap;
- no enclosing badge, gradient, stroke, or drop shadow.

The mark is a brand symbol, not a promise that every boat has two sails. The
starter training boat can remain mainsail-only.

### Wordmark

- Text: `FAIR WINDS`
- Typeface direction: geometric humanist sans with clean uppercase forms.
- Tracking: `0.28em` to `0.36em`, adjusted optically by breakpoint.
- Weight: 500–600, never extra-bold.
- Motif: two thin rules separated by a small outlined diamond.
- Descriptor: `A SAILING SCHOOL` or `SAILING SIMULATOR`, set smaller with
  generous tracking.

Use local/system font fallbacks in the first pass. Self-host a chosen open font
before public release so the presentation does not depend on Google Fonts.

## World design

### Playable geography

Build one deterministic mountain-lake basin 3.6 km across for the polished
testing slice, with local islands inside an atmospherically revealed outer
shore and data-driven coordinates that can grow without rewriting physics.

The basin has five authored regions:

1. **School water** — deep, open starting area with a buoy circuit and generous
   maneuvering room.
2. **North passage** — a navigable channel between rocky pine islands.
3. **Lighthouse reach** — exposed water, visible beacon, rocks, and changing
   wave character.
4. **Juniper cove** — sheltered shallows, cabin, dock, and grounding lesson.
5. **Mountain horizon** — non-playable distant terrain layers that establish
   scale and hide the circular world boundary.

### Shared world truth

`WorldDefinition` owns:

- bathymetry/depth sampler;
- shoreline and island signed-distance fields;
- render regions and terrain palette;
- world objects and collision volumes;
- lesson markers and waypoint metadata;
- ambient audio zones;
- spawn and recovery positions.

The renderer, minimap, collision system, grounding system, lessons, and UI must
consume this registry. Render meshes are never collision truth.

### Terrain

- Generate terrain sectors from deterministic radial/coast profiles.
- Use separate low, middle, and distant mountain bands.
- Use flat-shaded rock faces with controlled triangulation, not randomly noisy
  displaced planes.
- Blend exposed rock, pine soil, grass, and snow using height, slope, and
  region palette through vertex colors.
- Place conifers with instancing and seeded variation in height, rotation, and
  hue; keep silhouettes readable.
- Add authored hero props: lighthouse, dock, boathouse/cabin, navigation buoys,
  mooring posts, and sparse birds.
- Use fog and color compression to make distant layers dissolve gracefully.

### Water

The water should match the mockups while respecting the existing low-poly
water decision:

- one camera-centered adaptive triangulated surface, dense near the boat and
  progressively coarser toward the horizon;
- the same six-component second-order waves sampled by CPU and GPU;
- enough subdivisions that facets read as subtle highlight planes rather than
  tiles;
- depth-dependent color and transparency near shore;
- interpolated or derivative normals with an optional very subtle faceted
  contribution;
- a clipped half-resolution planar reflection for scenery and the boat,
  softened/distorted by analytic wave slope, plus an authored sun/moon path;
- localized shoreline foam, bow/stern wake, and impact splashes;
- no screen-space reflection or photoreal mirror-water treatment.

Reflection quality comes from the bounded planar pass, lighting, shared wave
normals, atmosphere, and authored composition. The render target is resolution
capped so broad WebGL reach remains the priority.

## Lighting and atmosphere

Create `LightingPreset` values that share one shader/material system:

- Clear morning
- Sailing school noon
- Golden hour
- Mist
- Passing shower
- Blue hour
- Moonlit night

Each preset defines sun/moon direction and intensity, hemisphere colors, fog
near/far and density, exposure, sky gradient, cloud tint, water deep/shallow
colors, practical-light intensity, and star visibility. Weather may evolve
between compatible presets; it must not pop between palettes.

## Camera and composition

### Normal sailing

- Perspective field of view: roughly 42–52°.
- Aft three-quarter target with the boat below center.
- Camera follows heading with damped lag and small velocity look-ahead.
- Camera height and distance respond subtly to speed and wave state.
- Keep horizon between 38% and 52% of the frame.
- Preserve a clear view of boom, sail side, telltales, heel, and upcoming water.

### Optional views

- Elevated teaching view for tacking.
- Low scenic chase view for exploration.
- Cockpit/helm learning view after core chase view is proven.

### Incident cinematic

On grounding or a severe collision:

1. freeze player input immediately;
2. continue a short deterministic impact/settling simulation;
3. widen the camera and rise to show the boat and hazard;
4. rotate slightly toward the incident point without orbiting wildly;
5. show damage appropriate to severity: hard heel, mast/boom collapse, sail
   slackening, or boat stranded upright;
6. reduce HUD to one calm incident panel with `Recover`, `Restart lesson`, and
   `Free sail from harbor`.

This is a teaching outcome, not a violent failure screen.

## UI architecture

### Persistent instruments

Use semantic DOM with inline SVG. Instruments share typography, stroke width,
spacing, and animation tokens:

- Heading/compass
- True/apparent wind
- Speed and trend
- Sail trim/flow
- Lesson objective or waypoint

The desktop layout pins instruments to corners and edges. The mobile layout
uses smaller top instruments plus thumb controls. The current stack of three
large glass cards is removed.

### Transient UI

- Launch brand composition
- Lesson-introduction title
- One-line coaching toast
- Discovery title
- Shallow-water warning
- Incident panel
- Conditions/menu drawer

Translucent panels are used only where text needs separation from the scene.
Most instruments sit directly on the world with shadow/contrast treatment.

### Accessibility

- All instruments have text equivalents and live-region announcements.
- Color is never the only luff/stall/shallow-water signal.
- Reduced motion disables camera flourish, logo transitions, and nonessential
  cloud/bird motion while preserving wave and sail feedback.
- Touch targets remain at least 44 CSS pixels.
- HUD safe zones are tested at 1440×900, 390×844, and landscape phone sizes.

## Boat and sail-plan architecture

### Data-driven boat definition

`BoatDefinition` supplies:

- hull length, beam, draft, displacement, yaw inertia, righting arm;
- hull drag, keel side-force, rudder area/lever/rate;
- visual dimensions and camera offsets;
- sail-plan definitions;
- reference polar table;
- collision footprint and recovery spawn rules.

The polar is a validation/tuning reference, not an invisible speed controller.
Forces still determine actual motion.

### Initial definitions

1. **Fair Winds Dinghy** — 4.65 m open centerboard dinghy, mainsail only, forgiving
   righting moment and shallow draft. This remains the first lesson boat.
2. **Coastal 28 sloop** — larger monohull with mainsail and optional headsail,
   deeper draft, more momentum, and a cruiser-racer polar.
3. **Lake 34 cruiser** — heavy large monohull with mainsail and headsail,
   slower acceleration, stronger momentum, deeper draft, and wider turning
   radius.

Only the trainer must be selectable in the first redesigned visual slice. The
other definitions and optional headsail path must be real and tested before
their final meshes and selection UI are exposed.

### Headsail

A headsail has its own area, trim input, force center, luff/attached/stall
diagnostics, side, telltales, and render mesh. It has no boom. The first support
pass may link headsail trim to the mainsheet in assisted mode; manual dual-sheet
controls come only after the single-sheet lesson remains understandable.

## Depth, collision, grounding, and damage

### Grounding

Sample depth at center, bow, keel center, and stern. Grounding begins when the
minimum water column is less than the active boat draft plus a small dynamic
clearance. The result includes contact point, depth, draft, speed, and severity.

Different drafts must materially change which routes are safe.

### Object collision

Use deterministic 2D collision primitives:

- circles for rocks, buoys, and pilings;
- capsules/segments for docks and breakwaters;
- shoreline signed-distance/depth checks for land.

Use the boat definition’s oriented capsule or convex footprint. Never use the
render mesh as collision geometry.

### Incident severity

- `touch`: cosmetic feedback, no game end;
- `stranded`: boat stops and cannot continue without recovery;
- `impact`: high-speed collision, visible rig/hull collapse state;
- `capsize-risk`: reserved for later, not implied by ordinary heel.

Grounding and meaningful collisions end the current run and enter the incident
cinematic. A soft buoy brush may remain a recoverable touch.

## Delivery sequence

### Slice A — contracts and visual system

- Add this design contract and update conflicting product docs.
- Introduce `BoatDefinition`, sail plans, polar references, `WorldDefinition`,
  world objects, depth samples, and hazard results.
- Add deterministic tests before renderer changes.
- Add brand SVG and HUD design tokens.

### Slice B — world composition

- Build the 3.6 km terrain basin and distance layers.
- Add instanced rocks, trees, lighthouse, dock, cabin, and buoys.
- Upgrade water, depth color, shoreline foam, sun path, and lighting presets.
- Tune chase camera composition against the references.

### Slice C — interface and teaching

- Replace card HUD with edge instruments.
- Add lesson objective, waypoint/course, shallow-water warning, and menu.
- Preserve keyboard/touch control clarity and Conditions.

### Slice D — boat families and hazards

- Make the trainer consume `BoatDefinition`.
- Add optional headsail force/render path and larger monohull definitions.
- Add collision/grounding integration, incident state, camera, and damage pose.

### Slice E — visual proof

- Capture the same required scenarios at desktop and mobile:
  launch, clear-day sailing, golden hour, night, shallow-water approach,
  grounding incident, collision incident, and headsail-capable boat.
- Compare composition, palette, environment density, UI hierarchy, boat scale,
  and water quality against all ten references.
- Run deterministic tests, production build, console inspection, interaction
  checks, and performance capture before claiming the redesign complete.

## Acceptance criteria

The redesign is ready only when:

- a fresh screenshot is recognizably from the same art family as the references
  without reusing them as textures;
- the lake has authored foreground, midground, and background depth in every
  normal camera direction;
- water reads calm, reflective, coherent, and premium at both shore and open
  water;
- normal gameplay has no large stacked-card wall;
- the brand mark and wordmark match one consistent SVG/typographic system;
- boat definitions change draft, mass, handling, camera, sail plan, and polar
  reference through data;
- the optional headsail path produces independent diagnostics and force;
- shore, rock, buoy, and dock hazards use deterministic world truth;
- grounding changes with boat draft and enters the incident cinematic;
- desktop and mobile captures pass a direct visual review against the supplied
  references;
- `npm test`, `npm run build`, browser console inspection, and interaction
  checks all pass with any approximations documented.
