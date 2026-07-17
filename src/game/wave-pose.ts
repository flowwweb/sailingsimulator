import type { BoatState, WavePoseTarget } from "../sim/model";
import { HARBOR_20, type BoatDefinition } from "../sim/boats";
import { sampleWaves } from "../weather/waves";
import type { WaveComponent } from "../weather/types";

export function sampleBoatWavePose(
  state: BoatState,
  waves: readonly WaveComponent[],
  time: number,
  boat: BoatDefinition = HARBOR_20,
): WavePoseTarget {
  const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  const starboard = { x: Math.cos(state.heading), z: -Math.sin(state.heading) };
  const at = (forwardOffset: number, starboardOffset: number) =>
    sampleWaves(
      waves,
      state.position.x + forward.x * forwardOffset + starboard.x * starboardOffset,
      state.position.y + forward.z * forwardOffset + starboard.z * starboardOffset,
      time,
    );
  const bowOffset = boat.hull.length * 0.43;
  const sternOffset = -boat.hull.length * 0.39;
  const sideOffset = boat.hull.beam * 0.46;
  const center = at(0, 0);
  const bow = at(bowOffset, 0);
  const stern = at(sternOffset, 0);
  const port = at(0, -sideOffset);
  const starboardSample = at(0, sideOffset);
  const longitudinalSpan = bowOffset - sternOffset;
  const lateralSpan = sideOffset * 2;
  const heave =
    center.height * 0.4 +
    (bow.height + stern.height) * 0.15 +
    (port.height + starboardSample.height) * 0.15;
  const heaveVelocity =
    center.verticalVelocity * 0.4 +
    (bow.verticalVelocity + stern.verticalVelocity) * 0.15 +
    (port.verticalVelocity + starboardSample.verticalVelocity) *
      0.15;

  return {
    heave: heave + 0.11 + boat.hull.length * 0.008,
    pitch: Math.atan2(
      bow.height - stern.height,
      longitudinalSpan,
    ),
    roll: Math.atan2(
      port.height - starboardSample.height,
      lateralSpan,
    ),
    heaveVelocity,
    pitchVelocity:
      (bow.verticalVelocity - stern.verticalVelocity) /
      longitudinalSpan,
    rollVelocity:
      (port.verticalVelocity -
        starboardSample.verticalVelocity) /
      lateralSpan,
  };
}
