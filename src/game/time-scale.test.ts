import { describe, expect, it } from "vitest";
import {
  FAST_FORWARD_TIME_SCALE,
  NORMAL_TIME_SCALE,
  timeScaleForHold,
} from "./time-scale";

describe("simulation time controls", () => {
  it("runs at 2x only while fast-forward is held", () => {
    expect(timeScaleForHold(false)).toBe(NORMAL_TIME_SCALE);
    expect(timeScaleForHold(true)).toBe(FAST_FORWARD_TIME_SCALE);
    expect(timeScaleForHold(false)).toBe(NORMAL_TIME_SCALE);
  });
});
