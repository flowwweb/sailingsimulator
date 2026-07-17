# Game and learning design

## North star

The player should be able to discover the first truth of sailing without a
lecture: the boat comes alive when its heading, sail angle, and the wind agree.

## Product pillars

1. **Cause and effect before terminology.** Let the sail flap, the boat slow,
   and the telltales misbehave before naming luffing.
2. **One coherent starting boat, extensible sailing depth.** Begin with a
   forgiving 6-meter ballasted training keelboat and one mainsail. Boat
   definitions must support different displacement, draft, handling, polars,
   and optional headsails without weakening the first lesson.
3. **A lake that initially feels like open water.** Exploration reveals the
   basin gradually; the boundary is geography, not an invisible wall.
4. **Quiet modern presentation.** The art direction supports reading wind,
   sail shape, heel, wake, and weather without visual noise.

## World scale

The implemented basin is 3.6 km across. The player begins in deep central
water, with local islands and navigation marks available before the outer
shoreline becomes a clear enclosing boundary. A low camera, distance fog,
layered mountain silhouettes, and an outward-shifted perimeter make the opening
read as broad open water rather than a small enclosed pond.

Expected speed is 5–8 knots (2.6–4.1 m/s):

| Journey | Approximate time |
| --- | ---: |
| 1 km lesson leg | 4–7 minutes |
| Center to outer shore, 1.8 km | 7–12 minutes |
| Full 3.6 km crossing | 15–24 minutes |

## Core loop

1. Read true wind from the environment and compass.
2. Choose a heading with the helm.
3. Sheet in or ease out.
4. Read the sail: leading-edge flutter, camber, telltales, heel, wake, sound,
   and speed trend.
5. Find attached flow and decide where to go next.

There is no boost button. Gusts are weather and must be handled by steering,
trim, and eventually reefing—not spent like a power-up.

## Lessons

### 1. Find the wind

- Steer on a beam reach with sail trim assisted.
- Read wind streaks, mast pennant, and compact wind compass.
- Learn “wind from,” not merely an abstract arrow.

### 2. Make the sail draw

- The lesson deliberately starts over-eased.
- The leading edge luffs, telltales wander, cloth audio flaps, and speed falls.
- Sheet in until flutter just stops and telltales stream.
- Continue sheeting to experience stall, then ease back to attached flow.

### 3. Points of sail

- Sail close-hauled, close reach, beam reach, broad reach, and run.
- The optimal sheet range moves continuously with apparent wind.
- Enter the roughly 40° no-go zone and observe the sail luff and boat coast.

### 4. Tack

- Begin close-hauled, build speed, turn smoothly through the no-go zone, let
  the boom cross, settle on the new tack, and retrim.
- Grade understanding, not racing time: completed turn, controlled rudder,
  correct final heading, and restored attached flow.

Completing the four lessons opens free sail. Lessons remain optional and
replayable.

## Controls

### Keyboard

- `A` / `D` or left / right: helm
- `W`: ease the sheet
- `S`: sheet in
- `R`: reset current lesson or recover the boat
- `Esc`: pause

### Touch

- Left thumb: horizontal helm pad that springs to center
- Right thumb: vertical sheet slider that stays where released
- Two clear labels: `HELM` and `SHEET`

Do not hide automatic trim inside the normal controls. Assist mode may show the
target band or slowly demonstrate a correction, but player input owns the sail.

## Feedback vocabulary

| State | Sail | Telltales | Boat | UI/audio |
| --- | --- | --- | --- | --- |
| Luffing / under-trimmed | leading edge loses shape and flaps | wander or hang | upright, slowing | cloth flutter; “Bear away or sheet in” |
| Attached / optimal | stable camber | stream together | clean wake, controlled heel | quiet airflow; subtle narrow target lock |
| Stalled / over-trimmed | over-deep, loaded, little flutter | leeward telltale lifts | excess heel, weaker acceleration | low turbulent rush; “Ease a little” |
| No-go zone | broad luff | chaotic | coasts and loses steerage | no-go wedge, no failure screen |
| Gust | camber/load and heel increase | accelerate and may lift | stronger wake and weather helm | dark water band, rising wind sound |

## Weather

Weather is configurable from the first 3D vertical slice so later conditions do
not require a new simulation boundary:

- manual mode holds exact wind, wave, rain, visibility, and cloud values;
- evolving mode uses a seed to vary wind and rain gradually within configured
  bounds;
- spatial gust patches add 10–35% true-wind speed and up to ±8° direction;
- linked waves derive a developing wind sea, while six named manual sea states
  cover calm, light chop, moderate, fresh, rough, and storm testing;
- significant height, dominant length, crest steepness, and direction can be
  tuned independently up to 3.5 m / 90 m;
- rain changes particles, visibility, atmosphere, water response, and audio;
- a mast pennant, water streaks, and distant surface color reveal changes.

Initial presets are Learning Day, Variable Breeze, Rain Shower, and Calm
Evening. The player can change the essential values in a quiet Conditions
drawer; full parameters stay in a development-only tuning panel.

The sail must react correctly to the sampled true wind in every condition.
Short-sprint rain remains a sensory/visibility system. Waves drive
boat-definition-sized buoyancy samples and underdamped heave, pitch, and roll
that follow both surface displacement and vertical velocity. Full 6-DOF
hydrodynamics, slamming loads, current, reefing, and structural failure remain
outside the current accuracy claim.

## Art and interface

Follow [quiet geometric modernism](art-direction.md). The persistent HUD
contains only waypoint, wind/point of sail, heading, speed, and sail flow/trim.
Depth appears only in shallow water. The map, reset, audio mix, boat selection,
and detailed weather controls live off-canvas in Settings; desktop key chrome
appears only on the launch screen, while touch retains the four controls
required to sail.

Instrument data should confirm what the world already communicates. If the
player must stare at a percentage to trim, the sail feedback is not good enough.

## Scope boundary

- multiplayer, AI competitors, regattas, leaderboards, or racing gates;
- the redesigned first slice exposes only the training boat, but the simulation
  and renderer support optional headsails and larger monohull definitions;
- spinnakers, reefing, detailed repair, crew simulation, and MOB remain later;
- economy, cargo, survival, fishing, crafting, combat, or character progression;
- full CFD, soft-body cloth simulation, six-degree-of-freedom rigid-body water
  physics, WebGPU-only rendering, or photoreal assets.

Grounding and meaningful collisions are now core teaching hazards. They end the
current run with a calm zoom-out incident view and recovery choices. They do not
introduce survival meters, punitive economy, or graphic destruction.
