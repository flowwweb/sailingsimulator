import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const load = (path) => stripTypeScriptTypes(readFileSync(path, "utf8"), { mode: "strip" })
  .replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const random = runInNewContext(load("src/weather/prng.ts") + "\n({createRandom})");
const waves = runInNewContext(load("src/weather/waves.ts") + "\n({buildWaveComponents,sampleWaveHeight,sampleWaves})", random);

test("height-only samples match the full wave model at varied positions and times", () => {
  for (const mode of ["linked", "manual"]) {
    for (const speed of [0, 6, 14]) {
      const components = waves.buildWaveComponents({ mode, height: 2.5, length: 35, directionFromDegrees: 60, steepness: .4 }, speed, 90, 42);
      for (let i = 0; i < 200; i++) {
        const [x, z, time] = [i * 19.13 - 1500, i * -11.7 + 800, i * .71];
        assert.equal(waves.sampleWaveHeight(components, x, z, time), waves.sampleWaves(components, x, z, time).height);
      }
    }
  }
});
