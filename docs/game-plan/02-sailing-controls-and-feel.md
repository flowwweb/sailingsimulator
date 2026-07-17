# 02 · Sailing controls and feel

## Input-to-motion contract

The player owns two continuous commands:

| Player command | Simulation control | Must not be |
| --- | --- | --- |
| Helm | target rudder angle, `-1…1` mapped to a bounded physical rudder angle | direct heading rotation |
| Sheet | sheet length/opening, `0…1` from sheeted-in to eased | a speed multiplier or an automatic-trim switch |

Keyboard uses held inputs; touch uses a spring-centered helm pad and persistent
sheet slider; gamepad may map left stick to helm and trigger/axis to sheet. All
surfaces drive the same normalized controls at fixed simulation ticks.

On pointer cancel, lost pointer capture, window blur, pause, or hidden tab,
release held helm commands safely without changing the persistent sheet value.
Touch controls must respect safe areas, orientation changes, and simultaneous
helm/sheet input. Reset restores a known boat/weather/lesson state; it is never
a hidden performance assist.

## Helm

- Map the player’s helm target to a maximum rudder angle of about ±28°.
- Rate-limit and smoothly damp the physical rudder angle. The rudder visibly
  moves and the HUD never pretends it moved instantly.
- Rudder side force derives from water flow over the rudder. At near-zero surge
  speed, helm authority is near zero; the boat must coast rather than pivot.
- Rudder force creates yaw torque around the hull. A held rudder produces a
  turn; releasing it allows the rudder to centre and yaw damping to settle.
- Later weather helm may bias the neutral helm requirement as heel rises, but
  do not add an invisible steering assist in the initial lesson.

### Required feel checks

- A stationary boat barely turns when the helm moves.
- A moving boat begins turning after a short, legible response—not instantly,
  and not so slowly that touch feels broken.
- Full rudder at speed bleeds drive through drag and leeway; it is not a free
  arcade turn.
- At a failed close-hauled attempt, dwindling speed also dwindles steering.

## Sheet, boom, and sail side

The sheet defines the **maximum opening** of the boom. It is not the boom’s
instant angle. Each fixed step:

1. derive apparent wind from sampled true wind minus boat velocity;
2. identify the leeward side from apparent wind in boat coordinates;
3. calculate the boom’s free/equilibrium tendency on that side;
4. constrain it by the player’s sheet opening and physical minimum/maximum;
5. smoothly move the visible boom and sail toward that constrained state.

The boom must never teleport through the mast merely because the wind changes
sides. During a tack or gybe it luffs/loads down, crosses with bounded angular
motion, then settles on the new leeward side. The exact crossing animation may
be simplified, but sail side, force direction, and the rendered boom must agree
on the same simulation tick.

Suggested initial bounds are 5° sheeted in and 85° eased. Treat them as boat
configuration, not scattered magic numbers.

## Teaching states

| State | Cause | Visible sail | Boat response | Coaching |
| --- | --- | --- | --- | --- |
| Luff | sheet too eased for apparent wind, or no-go heading | leading-edge flutter; weak/flat camber; telltales wander | low drive, upright, wake fades | “Bear away or sheet in.” |
| Attached | angle of attack in the working band | stable curved sail; streaming telltales | strongest useful drive; controlled heel and wake | “The sail is drawing.” |
| Stall | sheet too tight / angle of attack too high | deeper, loaded sail; slower broad turbulence; leeward telltale lifts | excess heel, poorer acceleration | “Ease a little.” |
| Tack | helm crosses the no-go zone | luff, boom crosses, then fills on the new side | drive and speed dip, then recover | “Bear away and retrim.” |
| Gust | weather field increases apparent wind/load | temporary camber/load increase | heel, wake, wind sound rise | “Ease or head up.” |

Luff and stall are distinct states. Do not solve both with a generic flapping
animation, a generic “bad trim” warning, or the same audio loop.

## Camera and control readability

- Default chase camera sits slightly above and behind the quarter, with sail,
  boom, telltales, heel, and nearby water visible.
- It anticipates heading only gently; camera lag must not hide helm response.
- A temporary look-around is permitted only if it does not steal helm/sheet
  input. Cockpit view is later work, not a requirement for the core.
- The wind compass reports wind **from** direction and point of sail. The mast
  pennant and water streaks make the same fact visible without reading numbers.

## Interaction acceptance

A new player should be able to discover the attached band using only sail
flutter, telltales, speed trend, wake, heel, and one contextual sentence. If
the lesson is easiest by staring at a trim percentage, fix the world feedback
before adding more UI.
