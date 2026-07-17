import { describe, expect, it } from "vitest";
import { createInitialState } from "../sim/model";
import { HARBOR_20, LAKE_34 } from "../sim/boats";
import { buildWaveComponents } from "../weather/waves";
import { DEFAULT_WEATHER } from "../weather/types";
import { sampleBoatWavePose } from "./wave-pose";

describe("boat wave pose sampling", () => {
  it("is deterministic, finite, and sensitive to world position", () => {
    const waves = buildWaveComponents(DEFAULT_WEATHER.waves, 8, 90, 17);
    const state = createInitialState();
    const first = sampleBoatWavePose(state, waves, 12);
    const replay = sampleBoatWavePose(state, waves, 12);
    state.position.x += 11;
    const moved = sampleBoatWavePose(state, waves, 12);

    expect(first).toEqual(replay);
    expect(moved).not.toEqual(first);
    expect(Object.values(first).every(Number.isFinite)).toBe(true);
  });

  it("uses the active hull length and beam as buoyancy sample spacing", () => {
    const waves = buildWaveComponents(
      {
        mode: "manual",
        height: 2.2,
        length: 34,
        steepness: 0.46,
        directionFromDegrees: 250,
      },
      10,
      90,
      313,
    );
    const state = createInitialState();
    state.position = { x: 24, y: -18 };
    const trainer = sampleBoatWavePose(
      state,
      waves,
      11.2,
      HARBOR_20,
    );
    const cruiser = sampleBoatWavePose(
      state,
      waves,
      11.2,
      LAKE_34,
    );

    expect(cruiser).not.toEqual(trainer);
    expect(
      Object.values(cruiser).every(
        (value) =>
          value === undefined || Number.isFinite(value),
      ),
    ).toBe(true);
  });
});
