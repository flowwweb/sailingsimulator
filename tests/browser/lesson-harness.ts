import { SailingAcademy } from "../../src/game/academy";
import { GameInput } from "../../src/game/input";
import { checkpointLesson, createLessonState, observeLesson, restoreLesson } from "../../src/game/lesson-session";
import { nextLessonObjective, parseProgress, PROGRESS_STORAGE_KEY, recordAcademyObjective } from "../../src/game/progress";
import { computeSailAerodynamics, degrees, stepBoat } from "../../src/sim/model";
const academy = new SailingAcademy();
let progress = parseProgress(localStorage.getItem(PROGRESS_STORAGE_KEY));
restoreLesson(academy, progress);
const wind = { x: -6, y: 0 };
let state = createLessonState(Math.min(academy.objectiveIndex(), 8), wind);
let sail = computeSailAerodynamics(state, { trueWind: wind });
const input = new GameInput();
let active = false;
let paused = false;
let accumulator = 0;
let then = performance.now();
let simulationTime = 0;
let controls = { rudder: 0, sheetRate: 0 };
const $ = (id: string) => document.getElementById(id)!;
function save() { progress = checkpointLesson(progress, academy); localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress)); }
function prepare() {
  state = createLessonState(Math.min(academy.objectiveIndex(), 8), wind);
  sail = computeSailAerodynamics(state, { trueWind: wind });
  input.releaseAll(); accumulator = 0; active = true; paused = false;
  academy.update(1 / 60, observeLesson(state, sail, controls));
  save(); render();
}
document.querySelectorAll<HTMLButtonElement>("[data-lesson]").forEach((button) => button.onclick = () => {
  academy.restoreObjective(nextLessonObjective(progress, Number(button.dataset.lesson)));
  prepare();
});
$("continue").onclick = () => { academy.resume(state); prepare(); };
$("free").onclick = () => { academy.skip(); input.releaseAll(); active = true; save(); render(); };
$("pause").onclick = () => { paused = !paused; academy.interrupt(); accumulator = 0; input.releaseAll(); render(); };
document.addEventListener("visibilitychange", () => { academy.interrupt(); input.releaseAll(); accumulator = 0; then = performance.now(); });
window.addEventListener("blur", () => { academy.interrupt(); input.releaseAll(); accumulator = 0; });
function render() {
  const view = academy.view();
  $("eyebrow").textContent = view.eyebrow; $("title").textContent = view.title;
  $("instruction").textContent = view.instruction; $("feedback").textContent = view.feedback;
  ($("hold") as HTMLProgressElement).value = view.progress;
  $("earned").textContent = `Earned targets: ${(progress.completedObjectives ?? []).join(", ") || "none"}. Completed lessons: ${(progress.completedLessons ?? []).map((n) => n + 1).join(", ") || "none"}.`;
  $("pause").textContent = paused ? "Resume" : "Pause";
  const snapshot = {
    stage: view.stage, objective: academy.objectiveIndex(), lesson: view.lesson, progress: view.progress,
    active, paused, simulationTime, x: state.position.x, z: state.position.y,
    angle: sail.apparentWindAngle * 180 / Math.PI, heading: state.heading, sheet: state.sheet,
    idealSheet: Math.max(0, Math.min(1, (Math.abs(sail.idealBoomAngle) - degrees(5)) / degrees(80))),
    luff: sail.luff, stall: sail.stall, attached: sail.attached,
    speed: Math.hypot(state.velocity.x, state.velocity.y), forwardSpeed: observeLesson(state, sail, controls).forwardSpeed,
    driveForce: sail.driveForce, yaw: state.yawRate, boom: state.boomAngle, desiredBoom: sail.desiredBoomAngle,
    heel: state.heel, reef: state.reefLevel, deployment: state.sailDeployment, sailsRaised: state.sailsRaised,
    tacks: state.tackCount, gybes: state.gybeCount, controls, earned: progress.completedObjectives ?? [], completedLessons: progress.completedLessons ?? [],
  };
  $("telemetry").textContent = JSON.stringify(snapshot, (_k, v) => typeof v === "number" ? Math.round(v * 10000) / 10000 : v, 2);
  document.body.dataset.stage = view.stage;
}
function frame(now: number) {
  const dt = (now - then) / 1000; then = now;
  const scale = input.isFastForwarding() ? 2 : 1;
  if (dt > 5 / 60 || document.hidden || paused || !active) { accumulator = 0; academy.interrupt(); }
  else {
    if (input.consumeReef()) state = { ...state, reefLevel: state.reefLevel === 0 ? 1 : 0 };
    if (input.consumeSails()) state = { ...state, sailsRaised: !state.sailsRaised };
    controls = input.read(); accumulator += dt * scale;
    while (accumulator >= 1 / 60) {
      const result = stepBoat(state, controls, { trueWind: wind }, 1 / 60); state = result.state; sail = result.sail;
      simulationTime += 1 / 60;
      const objective = academy.objectiveIndex();
      if (academy.update(1 / 60 / scale, observeLesson(state, sail, controls))) { progress = recordAcademyObjective(progress, objective); save(); }
      accumulator -= 1 / 60;
    }
  }
  render(); requestAnimationFrame(frame);
}
render(); requestAnimationFrame(frame);
