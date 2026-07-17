# 07 · Fun, immersion, and ambient audio

## Fun contract

The simulator must be enjoyable before it is educational. “Fun” here means the
player repeatedly makes a readable decision, sees the boat answer, and wants to
try the next adjustment or destination. It does not require points, rewards,
combat, or racing.

The core fun loop is:

```text
notice wind/water -> choose heading -> trim -> feel the boat accelerate
        -> respond to gust/wave -> choose a visible destination -> repeat
```

The first 60 seconds should include movement, one obvious sail response, and a
small success. Spawn Learning Day on a forgiving beam reach with the sail
slightly eased. The player hears luff, sheets in, the sail quiets and fills, the
boat heels gently, wake strengthens, and camera/audio settle into forward
motion. That transition is the game’s first reward.

## Sources of enjoyment

| Source | Core expression | Guardrail |
| --- | --- | --- |
| Mastery | find attached flow without an efficiency meter | feedback stays physical, not numerical |
| Motion | responsive helm, heel, wake, wave pose, boom crossing | no direct heading or speed cheats |
| Weather | gusts and showers create small trim/heading decisions | no random punishment or boost system |
| Exploration | distant lighthouse, wooded ridge, island gap, buoy line | landmarks are destinations, not collectible currency |
| Atmosphere | changing light, rain, water, wind, rigging and wildlife | quiet enough to hear sailing state |
| Experimentation | pause, presets, manual conditions, restart from seed | settings never silently alter boat coefficients |

The lake can be sparse, but it cannot be meaningless. The 3.6 km basin uses
readable mountain layers, local islands, a lighthouse, cove, dock, cabin,
rocks, and a nearby training buoy as optional destinations. Future regions may
remain authored and sparse without quests, economies, or content grind.

## Responsive delight

Attached flow should feel better through agreement, not celebration:

- luff flutter and cloth clatter subside;
- telltales stream and the sail takes a clean stable curve;
- wake becomes longer and cleaner;
- heel and camera settle into a mild loaded stance;
- water and hull audio gain a little energy;
- speed trend rises without a score burst or intrusive banner.

A tack should also be satisfying: audible load release, short quiet/luff phase,
bounded boom crossing, a soft rigging/boom transient, new-side fill, then wake
and flow return. Never add a “perfect tack” explosion, combo, or boost.

## Ambient soundscape

Audio is a continuous environment plus short physical events. Build it as
separate buses so changing one condition does not replace the whole mix.

```text
Master
  Ambience: broad lake air, distant shore/wildlife, optional sparse tonal bed
  Wind: apparent-wind body, gust rise, exposed rig whistle
  Water: hull wash, bow lap, wave slap, wake
  Boat: rigging tick, sheet tension, boom/blocks, hull creak
  Sail: attached airflow, luff flutter, stall turbulence, fill/snap transient
  Weather: rain surface, rain-on-boat, distant thunder only in later storms
  UI/lesson: restrained confirmations and spoken content only if later justified
```

### Core background layers

- **Open-lake bed:** low, wide air and water ambience; almost no identifiable
  loop point; gently follows wave energy and boat speed.
- **Shore distance:** occasional birds, insects, tree/wind texture, and softer
  reflected water only when the shoreline is actually near enough.
- **Boat presence:** subtle rigging taps, block movement and hull creaks at
  irregular seeded intervals; frequency grows with sail load and waves.
- **Calm evening:** quieter high frequencies, softer water, sparse wildlife.
- **Rain shower:** broad rain bed plus closer drops on boat/water, with wind and
  distant ambience appropriately masked rather than merely made louder.

Music is optional, starts quietly, and has its own persisted volume and
transport controls. It may continue as a lake soundtrack when enabled, but
must remain below sailing feedback and duck automatically during luff, stall,
heavy weather, coaching, or important sail transients. Muted or music-disabled
players receive the complete sailing experience.

## Dynamic mix rules

- Create/resume `AudioContext` from the player’s `Set Sail` gesture and handle
  suspended contexts gracefully. Browsers commonly require Web Audio to begin
  from a user gesture: [MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
- Smooth all continuous gain/filter changes; no abrupt volume steps when wind,
  rain, speed, or camera state changes.
- Apparent wind drives wind audio. Water-relative speed and wave impact drive
  water audio. Sail diagnostics drive luff/attached/stall. Do not mix from UI
  labels or duplicate physics calculations.
- Use seeded irregular timing for nonessential rigging/wildlife one-shots so a
  reproducible capture can be debugged without making the ambience robotic.
- Use spatial mono one-shots only where location matters; use restrained stereo
  beds for broad ambience. Avoid excessive stereo movement on headphones.
- Limit simultaneous voices and reuse decoded buffers/nodes. Suspend or mute
  cleanly when the page loses visibility according to the chosen pause policy.

## Sound sources and licensing

Generate continuous wind, rain, low water noise and turbulence with Web Audio
where it sounds convincing. Small recorded one-shots or seamless beds are
allowed when synthesis sounds cheap: rigging, boom/block movement, hull creak,
wave slap, birds, insects, and distant shore ambience.

For every recorded asset, preserve the source URL, author, exact asset license,
download date, modification, and attribution in `THIRD_PARTY_NOTICES.md`.
Freesound hosts sounds under several different Creative Commons licenses, so
only use individually verified CC0 or compatible CC-BY assets and never treat
the whole site as one license: [Freesound licensing FAQ](https://freesound.org/help/faq/).
Prefer CC0 for the first release.

## Player controls and accessibility

- Persist master, ambience, boat/sail, weather, and UI volume plus mute.
- Default mix is calm and conservative; protect against sudden sail-snap or
  thunder peaks with headroom and a final limiter/compressor.
- Provide a mono-compatible mix and never make stereo position the sole cue.
- Every audio teaching cue has matching sail motion, telltales, wake/heel or
  text. Deaf or muted players can complete every lesson.
- Reduced motion does not mute the world; it may reduce rapid camera-linked
  panning. Pausing suspends event scheduling without losing settings.

## Fun and immersion playtest

Test beginners and sailors separately. Observe without coaching for the first
five minutes, then ask:

1. Could you make the boat go faster, and what did you change?
2. Could you tell luff from stall without looking at diagnostic text?
3. Did the helm, boom, heel, wake, and sound react when expected?
4. Was there a moment when the boat “came alive”?
5. Did you choose somewhere to sail without being assigned a race or quest?
6. Did any loop, sound, camera motion, or message become tiring?

The playtest gate is met when most beginners discover attached flow in a few
minutes, can intentionally reproduce luff and stall, and voluntarily continue
Free Sail or choose a landmark. Record confusion and fatigue; do not convert
subjective feedback into unsupported physics claims.
