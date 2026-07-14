# Game and learning design

## North star

The player should be able to discover the first truth of sailing without a
lecture: the boat comes alive when its heading, sail angle, and the wind agree.

## Product pillars

1. **Cause and effect before terminology.** Let the sail flap, the boat slow,
   and the telltales misbehave before naming luffing.
2. **One coherent boat.** A forgiving 6-meter ballasted training keelboat with
   one mainsail. It can heel and feel lively but should recover naturally.
3. **A lake that initially feels like open water.** Exploration reveals the
   basin gradually; the boundary is geography, not an invisible wall.
4. **Quiet modern presentation.** The art direction supports reading wind,
   sail shape, heel, wake, and weather without visual noise.

## World scale

The playable lake is 10 km × 10 km. The player begins near its central basin,
about 4–5 km from most shorelines. A low camera, curvature-like horizon mask,
distance fog, and low-profile terrain make the lake feel ocean-sized at first.
Only high landmarks appear at long range.

Expected speed is 5–8 knots (2.6–4.1 m/s):

| Journey | Approximate time |
| --- | ---: |
| 1 km lesson leg | 4–7 minutes |
| Center to first shore, 4 km | 16–26 minutes |
| Full 10 km crossing | 40–65 minutes |

The initial vertical slice may use a 1 km test basin, but distances, fog, wave
tiling, and coordinates must be designed to scale without rewriting physics.

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

MVP weather is one fair-weather system with meaningful variation:

- prevailing true wind 8–12 knots;
- slow direction shifts of ±5°;
- spatial gust patches that add 10–35% speed and up to ±8° direction;
- waves whose direction and amplitude respond slowly to the prevailing wind;
- a mast pennant, water streaks, and distant surface color that reveal changes.

Rain, fronts, reefs, and day/night progression are later work. The sail must
first react correctly to the fair-weather wind field.

## Art and interface

Follow [quiet geometric modernism](art-direction.md). The HUD contains only:

- wind/point-of-sail compass;
- boat speed and trend;
- sheet position with an optional lesson target band;
- one contextual coaching sentence;
- pause/settings.

Instrument data should confirm what the world already communicates. If the
player must stare at a percentage to trim, the sail feedback is not good enough.

## Explicit non-goals for the first public build

- multiplayer, AI competitors, regattas, leaderboards, or racing gates;
- multiple boats, jibs, spinnakers, reefing, damage, docking physics, or MOB;
- economy, cargo, survival, fishing, crafting, combat, or character progression;
- full CFD, soft-body cloth simulation, six-degree-of-freedom rigid-body water
  physics, WebGPU-only rendering, or photoreal assets.
