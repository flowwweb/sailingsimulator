import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runInNewContext } from "node:vm";

const lesson = readFileSync(new URL("../src/game/first-buoy.ts", import.meta.url), "utf8");
const world = readFileSync(new URL("../src/game/world-definition.ts", import.meta.url), "utf8");
const hud = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const start = hud.indexOf("  const completedManeuver =", hud.indexOf("function updateHud(): void {"));
const end = hud.indexOf("\n}", start);
assert.ok(start >= 0 && end > start);
const status = `function updateStatus() {\n${hud.slice(start, end)}\n} updateStatus();`;

test("first buoy starts about 41m outside the arrival boundary, facing the mark", () => {
  const definition = lesson.match(/export const FIRST_BUOY = (\{[\s\S]*?\}) as const;/);
  const target = world.match(/id: "juniper-buoy",[\s\S]*?x: ([\d.-]+),\s*z: ([\d.-]+)/);
  assert.ok(definition && target);
  const first = runInNewContext(`(${definition[1]})`);
  const dx = Number(target[1]) - first.start.x;
  const dz = Number(target[2]) - first.start.z;
  const distance = Math.hypot(dx, dz);
  assert.ok(distance > 54 && distance < 58);
  assert.ok(distance - first.radiusM > first.minTravelM);
  assert.ok(Math.abs(Math.atan2(dx, dz) * 180 / Math.PI - first.startHeadingDegrees) < 2);
});

test("objective and failure take priority only in the first-buoy lesson", () => {
  for (const [firstBuoy, expected] of [
    [{ failed: false, completed: false }, "Sail to Juniper buoy."],
    [{ failed: true, completed: false }, "Journey failed. Open status to retry."],
    [{ failed: false, completed: true }, "Juniper buoy reached under control. Journey complete."],
    [undefined, "Attached. Flow attached."],
  ]) {
    const elements = { status: { textContent: "Ready" }, statusMessage: { textContent: "" } };
    const context = { elements, firstBuoy, state: { maneuverCount: 0, lastManeuver: "none" },
      lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
      dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
    runInNewContext(status, context);
    assert.equal(elements.status.textContent, expected);
    assert.equal(elements.statusMessage.textContent, expected);
  }
});
