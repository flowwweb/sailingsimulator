# Learning-world implementation plan

Status: proposed design, not implemented gameplay or release acceptance.
Original design: Fidelity Lab, 24 October 2026. Public implementation summary:
26 October 2026. The release review target is **80/100** for each participating
independent reviewer, with critical defects resolved.

The current Academy groups nine objectives into three lessons. The six
introductions below are the required replacement, not six working journeys.
Keep one teaching boat, the large inland lake, Mediterranean town and marina,
deterministic sailing model, and the approved quiet landscape interface.

## Six introductory journeys

| Introduction | Required player action and completion evidence | Recovery and transfer |
|---|---|---|
| 1. Reach the first buoy | Read wind cues, choose a sailable course, trim and steer. Require actual input, boat travel and controlled arrival in the authored target zone. | Explain a stalled approach from recorded behavior. Retry from before the error; selection or location injection earns no credit. |
| 2. Reach the second buoy | Change course, retrim and complete a controlled second leg. Accidental drift into the target is insufficient. | Show the observed cause of luff, heel or lost drive; repeat with a changed wind or target. |
| 3. Round and finish | Approach on the prescribed side, round in order, then cross the finish gate in its declared direction. | Reject a skipped mark, reverse crossing or teleport. Replay the missed decision, then use mirrored geometry. |
| 4. Cast off from the pier | Brief the departure, inspect the scenario's lines and obstacles, perform the required release actions and clear the pier under control. | A docking flag changing alone cannot complete the lesson. Restore a safe decision point and preserve the failed attempt. |
| 5. Leave the marina without traffic | Prepare a pilotage plan, manage clearance and speed, and travel through valid water to the exit. | Grounding, a shallow shortcut or reset is practice evidence, not mastery credit. Traffic must actually be disabled for this scenario. |
| 6. Return with scripted traffic | Observe the authored encounter, choose and verify an appropriate response, return safely and complete the scenario's arrival actions. | Preserve unsafe-event evidence. A contact must not teleport away to manufacture success; support recovery when another vessel does not cooperate. |

Introductions 4–6 have capability gates of their own, before they can be offered
or accepted: 4 requires the fixture's actual line-attachment/release actions and
pier separation; 5 requires depth, valid-water and clearance checks with traffic
disabled; 6 requires those checks, deterministic scripted traffic and witnessed
arrival/securing actions. Review only capabilities required by the authored
fixture; do not hide these gates in the later optional-scenario work.

Each introduction must bind a versioned fixture to its ordered actions,
completion/failure witnesses, reviewed numeric thresholds with units and
rationale, and positive/negative tests. Cover no-input drift, selector/reset or
reload credit, skipped/reversed geometry, unsafe contact and missing capability
as applicable. No introduction is accepted from its title or a happy-path timer.

Update scenario starts, completion, retry and persisted progress together with
the chooser, returning-player view and logbook. Migrate old earned objectives
explicitly: an old index must not accidentally become a completed new lesson.
Keep lookout, boom awareness, stopping options, sail controls and accessible
input available throughout the introduction.

## Shared scenario contract

A scenario declares its version, seed, boat and equipment capabilities,
environment, start state, ordered phases, required witnesses, failure events,
retry point and transfer variants. Rule-based scenarios also declare the
authored jurisdiction, mark region/direction and reviewed content version.

The attempt record links each earned predicate to a timestamped cue, player
input, world response and criterion. Retain mode, hints, retries, risk/contact
events, depth, phase transitions, reason codes and the previous attempt ID.
Do not infer understanding from camera movement or success from a timer alone.

| Mode | Support | Recorded result |
|---|---|---|
| Guided | Short contextual hints and optional explanations. | Guided completion with assistance visible. |
| Practice | Repeat a known seed; allow requested hints and retries. | Practice completion with assistance and retry counts. |
| Assessment | Brief the task and equipment; use an unfamiliar equivalent seed without tactical answer hints. | Independent result only when the required decisions and actions are witnessed. A hint converts the attempt to practice. |

| Event | Retained credit and history | Active state and chooser/logbook outcome |
|---|---|---|
| Pause | Keep earned outcomes, input trace and assistance history; pause/accessibility use alone earns no penalty. | Freeze simulated time and world/attempt state. Resume that consistent state without counting paused time toward a witness; chooser/logbook show an in-progress attempt, not completion. |
| Reload | Keep earned versioned outcomes and the prior attempt record. | Validate the saved scenario/seed/state. Restart interrupted continuous witnesses; if state cannot safely resume, brief a fresh linked attempt. Chooser/logbook reflect only earned credit. |
| Retry | Keep prior earned outcomes, failure evidence and retry parent. | Create a new attempt at its declared decision point; restore boat/weather/traffic together and clear unearned witnesses. Show the retry, never manufacture a completed lesson. |
| Mode change or hint | Keep prior outcomes and record the change/assistance. | An assisted assessment continues only as practice. Entering assessment starts a new eligible unassisted attempt; practice witnesses cannot become assessment credit. Chooser/logbook name the actual mode. |

Selecting a scenario cannot award completion. After a long absence from a
traffic encounter, offer a safe briefing/restart while retaining the log.
Reload or retry sequences must re-earn any invalidated ordered-action evidence.

Debrief with a short timeline answering what the learner noticed, chose and
observed, then suggest one useful next attempt. Separate a decision error from
control difficulty and a model or technical failure. Assessment thresholds
belong to reviewed scenario fixtures; speed cannot compensate for an unsafe
event. Simulator progress is not a practical qualification or certificate.

## Proposed scenarios after the introduction

These design IDs are separate from the README's W1 release-workflow label.

| Design scenario | Ordered learning loop | Capability gate and transfer |
|---|---|---|
| W1: Read the wind ahead | Inspect cues, predict a change, encounter the gust, act with real sheet/helm input, verify control, reach the target and explain the effect. | Reuse the sailing/weather model. Derive visible cues from it; distinguish true from apparent wind. Vary wind direction, target, gust timing and shore shelter. |
| C1: Crossing before harbor entry | Observe multiple samples, identify vessel status and the authored encounter, assess risk, make a clear safe response, verify its effect until clear, then resume pilotage. | Requires implemented propulsion/status changes, scripted traffic and reviewed jurisdiction/mark data. Test different encounter types and non-cooperative contacts; do not encode a universal steering answer or passing distance. |
| A1: Passage to a cove, anchor and watch | Plan an alternative, choose shelter/holding/depth/room, prepare equipment, approach under control, deploy from the bow, set, observe, keep watch and recover or re-anchor. | Requires an actual equipment, bottom/holding, rode, swing and drag model. A button or stationary frame cannot prove holding. Equipment-specific content and fixture thresholds require review before shipping. |

Further tracks can cover handling, reading conditions, sharing the water,
buoyage/pilotage, passage planning and seamanship. Add each only when the
required model and content exist. Coastal, tidal, night and restricted-visibility
extensions need their own declared environment and reviewed content; do not
silently turn the lake into an ocean scenario.

## Implementation visual targets

- Preserve warm stone, terracotta, cypress, an inland mountain horizon and
  blue/teal water. Improve shoreline relief, harbor layering, vegetation and
  materials in matched camera views.
- Use one consistent boat mesh and rig. Keep the normal trailing camera;
  a stationary debrief may use a deliberate side view without changing the
  meaning of the boat's bow, boom or controls.
- Retain the approved menu hierarchy and quiet navy/white/gold HUD, circular
  map and vertical mainsheet. Rebuild text, controls and navigation symbols as
  accessible runtime UI/data rather than cropping them from concept artwork.
- Generated concepts describe composition, not physics, buoy geometry, chart
  accuracy, light timing, responsive behavior or evidence of implemented play.
  Review production cues against actual boat, weather and scenario state.

## Delivery and review

Implement the six introductions and shared attempt/recovery contract first.
Then add W1 using existing capabilities, followed by C1 and A1 only after their
model/content gates are met. Reuse the existing progression and input systems.

Bind review to an identified source commit, build/config identity, output asset
hashes and deployed revision/time. Check desktop 1672x941, landscape 844x390 and
667x375, plus the portrait gate. Exercise all six start/completion/retry/resume
paths, title/chooser/return/free sail, controls, grounding/reset, keyboard focus,
Escape, console and relevant loading, empty, error and recovery states. Show
failures alongside successful evidence.

Independent reviewers compare matching views with the approved references and
score the actual deployed revision: sailing 25, lessons 25, visual fidelity 20,
controls/accessibility 15, reliability/performance 15. Mark untested dimensions
explicitly. Iterate on reproducible findings until each participating reviewer
rates the release at least 80/100 and critical defects are resolved. A design
document, code commit or concept frame does not earn a live score.
