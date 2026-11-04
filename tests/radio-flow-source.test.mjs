import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
function functionSource(name) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  return stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });
}

test("radio controls do not disable the sailing helm", () => {
  const context = { bootComplete: true, started: true, incident: undefined,
    document: { hidden: false }, window: { matchMedia: () => ({ matches: false }) },
    isSimulationPaused: () => false, elements: { statusDetails: { hidden: true } } };
  assert.equal(runInNewContext(`${functionSource("canControlBoat")}\ncanControlBoat()`, context), true);
  context.incident = {};
  assert.equal(runInNewContext(`${functionSource("canControlBoat")}\ncanControlBoat()`, context), false);
});

test("incident cancels radio before showing incident controls", () => {
  const calls = [];
  const element = () => ({ textContent: "", dataset: {}, classList: { add() {} }, hidden: true });
  const context = { resetRadio: () => calls.push("radio reset"), interruptLessonAttempt: () => calls.push("interrupt"),
    incident: undefined, incidentElapsed: 0, activeBoat: { name: "Dinghy" },
    elements: { gameShell: element(), incident: element(), incidentTitle: element(), incidentBody: element(), status: element() },
    requestAnimationFrame: (callback) => callback() };
  runInNewContext(`${functionSource("beginIncident")}\nbeginIncident({ kind: 'collision', severity: 'impact' });`, context);
  assert.deepEqual(calls, ["radio reset", "interrupt"]);
  assert.equal(context.elements.incident.hidden, false);
});
