import { expect, test } from "vitest";
import { ambientLoopGains } from "./game-audio";
import type { AudioMixTargets } from "./mix";

test("ambient levels follow water motion, wind, and harbor proximity with bounded peaks", () => {
  const quiet = { openWater: 0, hull: 0, wind: 0, dockActivity: 0 } as AudioMixTargets;
  const busy = { openWater: .011, hull: .037, wind: .034, dockActivity: 1 } as AudioMixTargets;
  expect(ambientLoopGains(quiet)).toEqual({ water: .18, wind: 0, harbor: 0 });
  const result = ambientLoopGains(busy);
  expect(result.water).toBe(.7);
  expect(result.wind).toBeCloseTo(.476);
  expect(result.harbor).toBe(.2);
  expect(result.water + result.wind + result.harbor).toBeLessThan(1.4);
});
