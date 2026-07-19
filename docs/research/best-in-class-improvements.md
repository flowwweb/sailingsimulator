# Best-in-class improvement brief

## Objective

Turn the existing Fair Winds playable core into the strongest focused browser
sailing teacher in its scope: one coherent lake, one default mainsail trainer,
real wind/trim consequences, quiet coaching, purposeful voyages, and trustworthy
progress. This pass does not add economy, survival, combat, multiplayer, racing
boosts, or a fleet-progression game.

## Research signals

- eSail makes instruction replayable through detailed tutorials plus separate
  skill challenges for steering, mooring, anchoring, navigation, and weather.
  <https://www.esailyachtsimulator.com/learn-to-sail>
- American Sailing's Sailing Challenge explicitly teaches points of sail,
  apparent wind, sail trim, tacking, jibing, rules of the road, and docking.
  <https://apps.apple.com/us/app/asas-sailing-challenge/id1109489005>
- RYA beginner guidance connects every course change to a trim response and
  treats the no-go zone and controlled tacking as foundational understanding.
  <https://www.rya.org.uk/training/do-you-know-your-points-of-sail/>
- US Sailing's small-boat assessment language grades observable control:
  smooth turns, sailing on every point of sail, and a gentle stop at a chosen
  dock position.
  <https://www.ussailing.org/wp-content/uploads/2023/01/Y_SB_014_JAN_2023v1.pdf>
- Sailwind shows the retention value of weather, navigation instruments,
  purposeful passages, and a world that supports quiet self-directed sailing,
  while Fair Winds deliberately excludes its economy and survival layer.
  <https://store.steampowered.com/app/1764530/Sailwind/>
- WCAG 2.2 calls for keyboard operability, visible focus, alternatives to
  dragging, reduced interaction motion, and adequately sized pointer targets.
  <https://www.w3.org/TR/WCAG22/>
- A high-quality progressive web app should be installable, fast, and resilient
  when a network is slow, flaky, or unavailable.
  <https://web.dev/articles/pwa-checklist>

## Ranked ten

Each item has a player outcome and a repository-owned proof contract. Existing
work counts only when the current implementation and fresh proof satisfy the
contract.

| Rank | Improvement | Player outcome | Acceptance contract |
| ---: | --- | --- | --- |
| 1 | Complete sailing academy | Learn trim, points of sail, tacking, gybing, reefing, and recovery through the boat's behavior rather than a lecture. | Deterministic stage transitions plus desktop/mobile lesson flow. |
| 2 | Live activity objectives | The seven chart activities become real tasks with start, progress, success, and safe cancellation states. | Pure activity evaluator tests and browser selection/progress/completion proof. |
| 3 | Skill scoring and debrief | Every completed drill explains control, trim, safety, and efficiency strengths without arcade bonuses. | Deterministic rubric tests and accessible debrief UI. |
| 4 | Persistent logbook and mastery | Completed skills, best scores, and voyages survive reloads; New Journey can deliberately reset them. | Versioned storage tests plus reload/reset browser proof. |
| 5 | Precision navigation | A readable compass is joined by waypoint bearing, course error, closing speed/VMG, and arrival cues. | Angle/vector tests and live helm/course browser assertions. |
| 6 | Harbor docking and mooring | Approach Juniper's visitor berth slowly, align with the pier, stop safely, and cast off intentionally. | Capture/rejection tests plus local and hosted docked-state proof. |
| 7 | Right-of-way encounter coach | Nearby sailing traffic creates calm, contextual stand-on/give-way practice without becoming a racing game. | Deterministic encounter classification and browser-readable advisory. |
| 8 | Forecast and reef decisions | Read a near-term trend, reef before stronger air, and understand why sail area matters. | Deterministic forecast/advice tests plus weather-settings/browser proof. |
| 9 | Inclusive controls and presentation | Keyboard, touch, coarse pointer, high-contrast, and reduced-motion users can complete the same learning loop. | Settings persistence, 44 px primary controls, focus/reduced-motion and mobile browser checks. |
| 10 | Installable, resilient web release | The game installs cleanly, starts quickly, and retains an offline application shell without caching the large optional soundtrack. | Manifest/service-worker contract tests, production build inspection, and hosted HTTPS smoke. |

## Risk and claim limits

- This remains an educational planar force model, not CFD or a certified
  training course.
- Scoring measures the explicit simulator signals above; it does not certify a
  real-world sailor.
- Automated Chrome proof cannot substitute for real-device audio, Safari,
  Firefox, or an observed beginner/sailor playtest.
- W1 is complete only after the exact committed revision is pushed, deployed to
  Firebase Hosting, and the hosted acceptance lane passes.

## Implementation map

| Rank | Repository implementation | Current proof surface |
| ---: | --- | --- |
| 1 | `src/game/academy.ts` | academy deterministic tests and desktop activity flow |
| 2 | `src/game/activity-session.ts` | evaluator tests and live chart coaching |
| 3 | `ActivityScore` debrief in `src/game/activity-session.ts` and `src/main.ts` | score rubric tests and scored-docking browser fixture |
| 4 | `src/game/progress.ts` | versioned parse/record tests and browser local-logbook assertion |
| 5 | existing compass tape plus `src/game/course-navigation.ts` | wrap/vector tests and live heading/course assertions |
| 6 | existing `src/game/docking.ts` and Juniper Harbor world slice | capture/rejection tests and docked browser fixture |
| 7 | `classifyEncounter` plus live ambient-traffic snapshots | encounter tests and contextual HUD |
| 8 | `src/weather/forecast.ts` | trend/advice tests and browser settings assertion |
| 9 | persisted high contrast, existing reduced-motion CSS, keyboard/touch parity | desktop persistence, reduced-motion, mobile 44 px target checks |
| 10 | manifest, app icon, service worker, Firebase headers | PWA contract test, production build inspection, local/live endpoint smoke |
