import { describe, expect, it } from "vitest";
import { FAIR_WINDS_WORLD } from "../game/world-definition";
import { sampleSoundscape } from "./zones";

describe("regional soundscapes", () => {
  it("keeps open water broad and sparse around the sailing school", () => {
    const soundscape = sampleSoundscape(FAIR_WINDS_WORLD, { x: 0, y: -80 });

    expect(soundscape.openWater).toBeGreaterThan(0.95);
    expect(soundscape.shore).toBeLessThan(0.12);
    expect(soundscape.songbirds).toBeLessThan(0.1);
  });

  it("brings woodland and songbirds forward in the north passage", () => {
    const soundscape = sampleSoundscape(FAIR_WINDS_WORLD, {
      x: -330,
      y: 420,
    });

    expect(soundscape.shore).toBeGreaterThan(0.85);
    expect(soundscape.songbirds).toBeGreaterThan(0.8);
    expect(soundscape.shelter).toBeGreaterThan(0.5);
  });

  it("keeps the lighthouse reach exposed and waterbird-led", () => {
    const soundscape = sampleSoundscape(FAIR_WINDS_WORLD, {
      x: 590,
      y: 560,
    });

    expect(soundscape.openWater).toBeGreaterThan(0.9);
    expect(soundscape.waterbirds).toBeGreaterThan(0.7);
    expect(soundscape.shelter).toBeLessThan(0.1);
  });

  it("makes Juniper cove sheltered, wooded, and dock-adjacent", () => {
    const soundscape = sampleSoundscape(FAIR_WINDS_WORLD, {
      x: 810,
      y: -390,
    });

    expect(soundscape.shore).toBeGreaterThan(0.9);
    expect(soundscape.songbirds).toBeGreaterThan(0.7);
    expect(soundscape.shelter).toBeGreaterThan(0.8);
    expect(soundscape.dock).toBeGreaterThan(0.65);
  });

  it("returns to the open-lake bed outside authored regions", () => {
    const soundscape = sampleSoundscape(FAIR_WINDS_WORLD, {
      x: -1_400,
      y: -1_400,
    });

    expect(soundscape.openWater).toBe(1);
    expect(soundscape.shore).toBe(0.04);
    expect(soundscape.dock).toBe(0);
  });
});
