import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
const load = path => stripTypeScriptTypes(readFileSync(`src/${path}`, "utf8"), { mode: "strip" }).replace(/^import\s*\{[\s\S]*?\}\s*from\s*[^;]+;\s*/gm, "").replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
const weather = runInNewContext(load("weather/types.ts") + "\n({DEFAULT_WEATHER,cloneWeatherConfig})");
const world = runInNewContext(load("game/bathymetry.ts") + "\n" + load("game/town-solids.ts") + "\n" + load("game/world-definition.ts") + "\n({FAIR_WINDS_WORLD,depthAtTide})");
const sim = runInNewContext(load("sim/boats.ts") + "\n" + load("sim/model.ts") + "\n" + load("game/lesson-session.ts") + "\n" + load("game/crossing-encounter.ts") + "\n({stepBoat,computeSailAerodynamics,sheetForBoomAngle,createLessonState,createLessonWeather,CrossingEncounter,HARBOR_20,wrappedAngle})", { ...weather, ...world });
const docking = runInNewContext(load("game/docking.ts") + "\n({evaluateDocking})");
const hazards = runInNewContext(load("game/hazards.ts") + "\n({evaluateIncident})", { ...world, ...docking, HARBOR_20: sim.HARBOR_20, wrappedAngle: sim.wrappedAngle });
const random = runInNewContext(load("weather/prng.ts") + "\n({createRandom})");
const waves = runInNewContext(load("weather/waves.ts") + "\n({buildWaveComponents,sampleWaves})", random);
const pose = runInNewContext(load("game/wave-pose.ts") + "\n({sampleBoatWavePose})", { ...waves, HARBOR_20: sim.HARBOR_20 });
function sail(turn) {
  const environment = { trueWind: { x: 0, y: -6 }, boat: sim.HARBOR_20 };
  const config = sim.createLessonWeather(); config.wind.directionFromDegrees = 0; config.seed = 24001;
  const components = waves.buildWaveComponents(config.waves, config.wind.speed, 0, config.seed);
  const encounter = new sim.CrossingEncounter();
  let state = sim.createLessonState(3, environment.trueWind, { x: 250, z: 50 }); state.heading = Math.PI / 4;
  let sail = sim.computeSailAerodynamics(state, environment), crossingTick = -1, minimumDepth = Infinity, unsafe = false;
  for (let tick = 0; tick < 9000 && !["failed", "complete"].includes(encounter.stage); tick++) {
    if (encounter.stage === "crossing" && crossingTick < 0) crossingTick = tick;
    const heading = Math.PI / 4 + (turn && crossingTick >= 0 && tick > crossingTick ? Math.PI / 2 : 0);
    const error = Math.atan2(Math.sin(heading - state.heading), Math.cos(heading - state.heading));
    const rudder = Math.max(-1, Math.min(1, error * 4 - state.yawRate * 8));
    const sheetTarget = sim.sheetForBoomAngle(sail.idealBoomAngle);
    const previous = state, time = tick / 60;
    const wavePose = pose.sampleBoatWavePose(previous, components, time, sim.HARBOR_20);
    const result = sim.stepBoat(state, { rudder, sheetRate: Math.sign(sheetTarget - state.sheet), sheetTarget }, { ...environment, wavePose }, 1 / 60);
    state = result.state; sail = result.sail;
    const tide = Math.sin(((time / 600 + config.tide.phaseHours) / config.tide.periodHours) * Math.PI * 2) * config.tide.range * .5;
    unsafe ||= hazards.evaluateIncident(state, sim.HARBOR_20, world.FAIR_WINDS_WORLD, tide, undefined, previous).severity !== "none";
    encounter.update(1 / 60, { x: state.position.x, z: state.position.y, heading: state.heading, velocityX: state.velocity.x, velocityZ: state.velocity.y, rudder, unsafe, sailsRaised: state.sailsRaised, sailSide: state.sailSide });
    minimumDepth = Math.min(minimumDepth, world.FAIR_WINDS_WORLD.sampleDepth(state.position.x, state.position.y));
    if (encounter.other) {
      minimumDepth = Math.min(minimumDepth, world.FAIR_WINDS_WORLD.sampleDepth(encounter.other.x, encounter.other.z));
      const other = { ...state, position: { x: encounter.other.x, y: encounter.other.z }, heading: encounter.other.heading };
      unsafe ||= hazards.evaluateIncident(other, sim.HARBOR_20, world.FAIR_WINDS_WORLD, tide).severity !== "none";
    }
  }
  return { encounter, minimumDepth, unsafe };
}
test("real-physics witness with waves, tide and hazards fails without alteration and clears with an early turn", () => {
  const unchanged = sail(false), avoiding = sail(true);
  assert.equal(unchanged.encounter.stage, "failed");
  assert.equal(avoiding.encounter.stage, "complete");
  assert.ok(avoiding.encounter.closest > 15);
  assert.ok(Math.min(unchanged.minimumDepth, avoiding.minimumDepth) > 3);
  assert.equal(unchanged.unsafe || avoiding.unsafe, false);
});
