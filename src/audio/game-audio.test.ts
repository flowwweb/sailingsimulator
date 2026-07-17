import { describe, expect, it } from "vitest";
import {
  audioEventsNeedRebase,
  audioSeedChanged,
} from "./game-audio";

describe("game audio state transitions", () => {
  it("rebases event deadlines after mute or a background gap", () => {
    expect(audioEventsNeedRebase(true, 12, 12.02)).toBe(true);
    expect(audioEventsNeedRebase(false, 12, 13.2)).toBe(true);
    expect(audioEventsNeedRebase(false, 12, 12.2)).toBe(false);
  });

  it("does not restart seeded ambience for unrelated weather changes", () => {
    expect(audioSeedChanged(8_143, 8_143)).toBe(false);
    expect(audioSeedChanged(8_143, 2_101)).toBe(true);
  });
});
