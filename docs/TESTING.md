# Fair Winds testing round

Live round: [https://floeb-sailingsimulator.web.app/](https://floeb-sailingsimulator.web.app/)

## Start

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 4317 --strictPort
```

Before a testing round, run the repeatable acceptance lane:

```powershell
npm test
npm run test:browser
```

The browser suite builds the production bundle, launches installed Chrome at
1440×900 and 390×844, exercises launch, keyboard and touch sheet input,
Conditions, boat selection and persistence, rejects console/page errors, and
writes fresh captures under `.artifacts/visual-qa/`.

Open `http://127.0.0.1:4317/`, choose **Continue**, and use headphones if
available. The first test round should answer one question: does the boat teach
the relationship between wind, helm, and mainsail trim through its behavior?

For deterministic local visual review, `/?preview=game` starts a trimmed moving
trainer without audio, and `/?preview=impact` opens the Pine Islet rock-impact
cinematic. Add a named sea state such as
`/?preview=game&sea=rough` or `/?preview=game&sea=storm` to review high-wave
motion and crest treatment. These routes are development-only and are absent
from the production build.

## Focused scenarios

### 1. Luff to attached flow

The boat starts on a beam reach with the sheet deliberately eased. Confirm the
sail visibly flutters, the telltales wander, the HUD says **Luffing**, and sail
flutter is audible. Hold `S` / **Sheet in** gradually. The flutter should settle,
the telltales should stream, the HUD should say **Attached**, and boat speed
should begin increasing. The lesson should advance only after attached flow is
held briefly.

### 2. Find and recover from a stall

Keep sheeting in past useful trim. Confirm the HUD changes to **Stalled**, the
sail/telltales look heavier rather than fluttering, and acceleration weakens.
Hold `W` / **Ease** until flow attaches again. The trim marker and target are
teaching aids, not a throttle: changing sheet must first change boom/sail state,
which then changes aerodynamic force.

### 3. Tack through the wind

Build some speed, then hold one helm direction with `A` or `D`. Rudder authority
should be weak while nearly stopped and stronger with water flow. During the
tack, confirm the point of sail enters **No-go zone**, the sail luffs, the boom
travels across the centerline once, and the sail settles on the new leeward side.
Retrim after the turn and confirm speed recovers. Heel, wake, telltales, audio,
and the HUD should agree with the same flow state.

### 4. Change conditions

Open **Conditions** or press `C`.

- Try **Light air**, **Fresh breeze**, and **Passing shower**.
- Switch between **Manual** and **Evolving** weather.
- Change wind speed and wind-from direction.
- Switch waves between **Linked to wind** and **Manual**.
- Select each named sea state through **Storm** and confirm the water, crest
  treatment, and boat response change together.
- Switch from the Harbor 20 to Coastal 28 and Lake 34. Confirm the optional
  headsail appears, both sails react to linked trim, the camera reframes, and
  draft-sensitive grounding changes.
- Increase rain and cloud, then confirm visibility, rain particles, and rain
  audio change together.
- Reload the page and confirm the chosen configuration persists.
- Use **Restart weather** and confirm the same seed replays the same evolution.

### 5. Explore and reset

Sail toward Juniper buoy, Pine islet, or North light. The water should continue
without a visible tile edge and the distant lake boundary should not dominate
the opening view. Confirm the enlarged Pine Islet shoreline agrees with shallow
water in the contextual depth warning. A direct rock or dock strike should end the
run as an impact; slow contact with the training buoy should rebound without
ending the run; grounding should report depth and draft. Confirm **Recover
nearby** resumes in clear water and `R` / **Reset boat** clears the wake and
returns to the opening lesson state. Confirm `M` / **Sound** mutes and restores
all audio buses.

### 6. Compact/touch layout

At a phone-sized viewport, confirm the helm and sheet pairs are reachable with
both thumbs, can be held simultaneously, and release on pointer cancellation.
Open Conditions and confirm the drawer fills the width without horizontal
overflow. Rotate once and confirm the HUD and controls remain usable.

## Feedback to capture

- Browser, operating system, input method, and approximate frame rate.
- Whether luffing, attached flow, and stall were distinguishable without reading
  the words in the HUD.
- Whether the helm direction and boom crossing felt intuitive.
- The first moment the boat or interface contradicted what the tester expected.
- Any visual overlap, stuck input, audio imbalance, console warning, or reset
  inconsistency, with a screenshot and the weather preset/seed when possible.

## Intentional approximations in this core

- Sailing uses a deterministic planar surge/sway/yaw force model with explicit
  lift, drag, keel side force, hull resistance, rudder force, heel, and sail
  state. It is not CFD and is not a full six-degree rigid-body solver.
- Boat heave, pitch, and wave roll come from hull-sized five-point samples of
  the same six-component field used by the water shader. Boat-specific
  underdamped response follows displacement and vertical surface velocity.
- Harbor 20 remains the default mainsail-only trainer. Coastal 28 and Lake 34
  are selectable validation boats with linked optional headsails, distinct
  mass, draft, handling, camera scale, and reference polars. Reefing, vang,
  traveler, and twist are later product slices.
- Bathymetry, grounding, hard-object collision, recovery, and a rig-collapse
  impact presentation are implemented. Structural deformation is a authored
  end-state animation, not a breakable finite-element model.
- Wind, water, rain, sail, and hull ambience use procedural Web Audio. The
  soundtrack and sparse bird calls use credited audio files. All audio starts
  only after a title-menu gesture to respect browser autoplay rules.

These are scope choices, not evidence that the underlying teaching contracts
may disagree. Visible sail, boom, telltales, wake, heel, audio, lesson, and HUD
must still match the deterministic simulation snapshot.
