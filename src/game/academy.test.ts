import { describe, expect, it } from "vitest";
import { SailingAcademy, type AcademyObservation } from "./academy";
import { createLessonState, observeLesson, checkpointLesson, restoreLesson } from "./lesson-session";
import { createProgress, recordAcademyObjective, parseProgress } from "./progress";
import { computeSailAerodynamics, stepBoat, degrees } from "../sim/model";
import { FAIR_WINDS_WORLD } from "./world-definition";
const base: Required<AcademyObservation> = {
  attached: 0.9, stall: 0, pointOfSail: "Beam reach", tackCount: 0, gybeCount: 0,
  reefed: false, heelRadians: 0.1, luff: 0, sailDeployment: 1, sailsRaised: true,
  forwardSpeed: 1, driveForce: 100, sheet: 0.6, sheetRate: 0, rudder: 0,
  apparentWindAngle: degrees(90), yawRate: 0, boomAngle: -0.8, desiredBoomAngle: -0.8,
};
function hold(a: SailingAcademy, o: AcademyObservation, seconds = 2, scale = 1) {
  for (let step = 0; step < Math.round(seconds * 60 * scale); step++) a.update(1 / 60 / scale, o);
}
function enter(index: number, initial: AcademyObservation = base) {
  const a = new SailingAcademy(); a.restoreObjective(index, initial); a.update(1 / 60, initial); return a;
}
const luff = { ...base, attached: 0, luff: 1, sheet: 1 };
const trim = { ...base, sheet: 0.55, sheetRate: -1 };
const stall = { ...base, attached: 0, stall: 0.8, sheet: 0.15, sheetRate: -1 };
const recover = { ...base, sheet: 0.6, sheetRate: 1 };
// Controlled observations test the assessor; browser tests separately drive the real model.
describe("observed lesson performance", () => {
  it("requires luff, sheet travel and loaded forward sailing for Trim", () => {
    const a = enter(0); hold(a, trim); expect(a.view().stage).toBe("trim"); a.update(1 / 60, luff);
    for (const invalid of [{ ...trim, sailsRaised: false }, { ...trim, sailDeployment: 0 }, { ...trim, forwardSpeed: 0 }, { ...trim, driveForce: 0 }]) {
      hold(a, invalid); expect(a.view().progress).toBe(0);
    }
    hold(a, trim); expect(a.view().stage).toBe("stall");
  });
  it("requires over-sheeting, excludes luff/no-go, carries witnessed stall into Recover and stops at lesson end", () => {
    const a = enter(1);
    for (const invalid of [{ ...stall, luff: 1 }, { ...stall, pointOfSail: "No-go zone" }, { ...stall, sailDeployment: 0 }]) {
      hold(a, invalid); expect(a.view().stage).toBe("stall");
    }
    hold(a, stall, 0.8); expect(a.view().stage).toBe("recover");
    hold(a, { ...recover, sheetRate: 0 }); expect(a.view().stage).toBe("recover");
    hold(a, recover); expect(a.view().stage).toBe("lesson-complete"); expect(a.view().lesson).toBe(0);
    hold(a, base); expect(a.objectiveIndex()).toBe(3);
  });
  it("a resumed Recover needs a current-attempt stall", () => {
    const a = enter(2); hold(a, recover); expect(a.view().stage).toBe("recover");
    a.update(1 / 60, stall); hold(a, recover); expect(a.view().stage).toBe("lesson-complete");
  });
  it("close-hauled requires heading up and inward trim, retaining both actions after release", () => {
    const initial = { ...base, apparentWindAngle: degrees(70), sheet: 0.6 };
    const reached = { ...base, pointOfSail: "Close-hauled", apparentWindAngle: degrees(48), rudder: 0.2 };
    for (const sheet of [{ sheet: 0.6, sheetRate: 0 }, { sheet: 0.7, sheetRate: 1 }]) {
      const a = enter(3, initial);
      hold(a, { ...reached, ...sheet });
      expect(a.objectiveIndex()).toBe(3);
    }
    const noSteering = enter(3, initial);
    hold(noSteering, { ...reached, rudder: 0, sheet: 0.55, sheetRate: -1 });
    expect(noSteering.objectiveIndex()).toBe(3);
    const a = enter(3, initial);
    a.update(1 / 60, { ...reached, sheet: 0.55, sheetRate: -1 });
    hold(a, { ...reached, sheet: 0.55, sheetRate: 0, rudder: 0 });
    expect(a.objectiveIndex()).toBe(4);
  });
  it.each([[4, "Beam reach", 90, 48], [5, "Broad reach", 128, 90]])("target %i needs course and easing changes", (index, point, angle, entryAngle) => {
    const a = enter(Number(index), { ...base, apparentWindAngle: degrees(Number(entryAngle)), sheet: 0.2 });
    const reached = { ...base, pointOfSail: String(point), apparentWindAngle: degrees(Number(angle)), sheet: 0.6 };
    hold(a, reached); expect(a.objectiveIndex()).toBe(Number(index));
    hold(a, { ...reached, rudder: 0.2, sheetRate: 1 }); expect(a.objectiveIndex()).toBe(Number(index) + 1);
  });
  it.each([[6, "tackCount"], [7, "gybeCount"]] as const)("target %i rejects old counters and an unsettled boom", (index, counter) => {
    const old = { ...base, tackCount: 8, gybeCount: 12 }; const a = enter(index, old);
    hold(a, { ...old, rudder: 1 }); expect(a.objectiveIndex()).toBe(index);
    const fresh = { ...old, [counter]: old[counter] + 1, rudder: 0.3 };
    hold(a, { ...fresh, boomAngle: 0.8 }); expect(a.objectiveIndex()).toBe(index);
    hold(a, fresh); expect(a.objectiveIndex()).toBe(index + 1);
  });
  it("requires a new reef and controlled heel", () => {
    const a = enter(8, { ...base, reefed: true }); hold(a, { ...base, reefed: true }); expect(a.objectiveIndex()).toBe(8);
    a.update(1 / 60, base); hold(a, { ...base, reefed: true, heelRadians: degrees(24) }); expect(a.objectiveIndex()).toBe(8);
    hold(a, { ...base, reefed: true }); expect(a.view().stage).toBe("lesson-complete");
  });
  it("invalid samples reset consecutive time; catch-up clears action evidence", () => {
    const a = enter(0, luff); hold(a, trim, 0.8); a.update(1 / 60, { ...trim, attached: 0 }); hold(a, trim, 0.8);
    expect(a.view().stage).toBe("trim"); a.update(5, trim); hold(a, trim); expect(a.view().stage).toBe("trim");
    for (const dt of [NaN, Infinity, -1, 0]) a.update(dt, trim); expect(a.view().progress).toBe(0);
  });
  it("pause, hidden time and recovery cannot bank an attempt", () => {
    const a = enter(6); hold(a, { ...base, tackCount: 1, rudder: 1 }, 0.25); a.interrupt();
    hold(a, { ...base, tackCount: 1, rudder: 1 }); expect(a.objectiveIndex()).toBe(6);
    a.skip(); hold(a, { ...base, tackCount: 2, rudder: 1 }); expect(a.view().stage).toBe("free-sail");
    a.resume({ ...base, tackCount: 2 }); hold(a, { ...base, tackCount: 2, rudder: 1 }); expect(a.view().stage).toBe("tack");
  });
  it("1x and 2x require equal active wall-clock holds", () => {
    for (const scale of [1, 2]) { const a = enter(0, luff); hold(a, trim, 1, scale); expect(a.view().stage).toBe("trim"); hold(a, trim, 0.2, scale); expect(a.view().stage).toBe("stall"); }
  });
  it("missing telemetry fails closed and invalid restore targets restart safely", () => {
    const a = enter(0, luff); hold(a, { ...trim, driveForce: undefined }); expect(a.view().progress).toBe(0);
    for (const index of [-1, 10, 1.5, NaN, Infinity]) { a.restoreObjective(index); expect(a.objectiveIndex()).toBe(0); }
  });
});
describe("lesson setup and persistence", () => {
  const wind = { x: -6, y: 0 };
  it("restores an explicit legacy academy completion without restarting an unearned target", () => {
    const academy = new SailingAcademy();
    restoreLesson(academy, parseProgress(JSON.stringify({ ...createProgress(), academyCompleted: true })));
    expect(academy.view().stage).toBe("lesson-complete");
    expect(academy.view().lesson).toBe(2);
  });
  it("does not imply earlier targets were earned from a legacy or sparse cursor", () => {
    for (const completedObjectives of [undefined, [4]]) {
      const academy = new SailingAcademy();
      restoreLesson(academy, parseProgress(JSON.stringify({ ...createProgress(), academyObjective: 5, completedObjectives })));
      expect(academy.objectiveIndex()).toBe(3);
      expect(academy.view().stage).toBe("close-hauled");
    }
  });
  it("starts in deep water with real luff/attached/stall diagnostics and no seeded speed", () => {
    for (let index = 0; index < 9; index++) {
      const state = createLessonState(index, wind); expect(FAIR_WINDS_WORLD.sampleDepth(state.position.x, state.position.y)).toBeGreaterThan(3);
      expect(state.velocity).toEqual({ x: 0, y: 0 }); expect(state.tackCount + state.gybeCount).toBe(0); expect(state.reefLevel).toBe(0);
      const sail = computeSailAerodynamics(state, { trueWind: wind });
      if (index === 0) expect(sail.luff).toBeGreaterThan(0.9); else if (index === 2) expect(sail.stall).toBeGreaterThan(0.9); else expect(sail.attached).toBeGreaterThan(0.9);
      const result = stepBoat(state, { rudder: 0, sheetRate: -1 }, { trueWind: wind }, 1 / 60);
      expect(observeLesson(result.state, result.sail, { rudder: 0, sheetRate: -1 }).sheet).toBe(result.state.sheet);
    }
  });
  it("round trips partial target and free-sail pause without earlier mastery", () => {
    const a = enter(4); a.skip(); const saved = parseProgress(JSON.stringify(checkpointLesson(recordAcademyObjective(createProgress(), 3), a)));
    const restored = new SailingAcademy(); restoreLesson(restored, saved); expect(restored.view().stage).toBe("free-sail"); expect(restored.objectiveIndex()).toBe(4);
    expect(saved.completedLessons).toEqual([]); restored.resume(base); expect(restored.view().stage).toBe("beam-reach"); expect(restored.view().progress).toBe(0);
  });
  it("persists lesson-end boundaries without claiming unplayed lessons", () => {
    for (const lesson of [0, 1, 2]) { const a = new SailingAcademy(); a.restoreLessonComplete(lesson); let progress = createProgress();
      for (const target of [0, 1, 2]) progress = recordAcademyObjective(progress, lesson * 3 + target);
      const saved = parseProgress(JSON.stringify(checkpointLesson(progress, a))); restoreLesson(a, saved);
      expect(a.view().stage).toBe("lesson-complete"); expect(a.view().lesson).toBe(lesson); expect(saved.completedLessons).toEqual([lesson]); expect(saved.academyCompleted).toBe(false);
    }
  });
});
