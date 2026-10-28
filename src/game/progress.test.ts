import { describe, expect, it } from "vitest";
import {
  createProgress,
  parseProgress,
  recordActivityCompletion,
  recordAcademyObjective,
  nextLessonObjective,
  recordFirstBuoyCompletion,
} from "./progress";
import { FIRST_BUOY } from "./first-buoy";

describe("sailing progress", () => {
  it("migrates v1 drills as practice without awarding a new introduction", () => {
    const saved = parseProgress(JSON.stringify({ ...createProgress(), version: 1, academyCompleted: true,
      completedIntroductions: { [FIRST_BUOY.id]: 1 }, activeIntroduction: FIRST_BUOY.id, voyages: 3, distanceSailed: 900 }));
    expect(saved.version).toBe(2);
    expect(saved.academyCompleted).toBe(true);
    expect(saved.completedIntroductions).toBeUndefined();
    expect(saved.activeIntroduction).toBeUndefined();
    expect([saved.voyages, saved.distanceSailed]).toEqual([3, 900]);
  });
  it("persists versioned introduction credit independently from selection and legacy drills", () => {
    const selected = { ...createProgress(), activeIntroduction: FIRST_BUOY.id };
    expect(parseProgress(JSON.stringify(selected)).completedIntroductions).toBeUndefined();
    const earned = recordFirstBuoyCompletion(selected);
    expect(recordFirstBuoyCompletion(earned)).toEqual(earned);
    expect(parseProgress(JSON.stringify(earned)).completedIntroductions).toEqual({ [FIRST_BUOY.id]: FIRST_BUOY.revision });
    expect(earned.academyCompleted).toBe(false);
    for (const revision of [0, 2, "1", null]) {
      expect(parseProgress(JSON.stringify({ ...selected, completedIntroductions: { [FIRST_BUOY.id]: revision } })).completedIntroductions).toBeUndefined();
    }
  });
  it("records only observed targets and requires all three before marking a lesson", () => {
    let progress = createProgress();
    progress = recordAcademyObjective(progress, 8);
    expect(progress.completedLessons).toEqual([]);
    expect(nextLessonObjective(progress, 2)).toBe(6);
    progress = recordAcademyObjective(progress, 6);
    progress = recordAcademyObjective(progress, 7);
    expect(progress.completedLessons).toEqual([2]);
    expect(progress.academyCompleted).toBe(false);
    expect(progress.completedObjectives).toEqual([6, 7, 8]);
    expect(recordAcademyObjective(progress, 8)).toEqual(progress);
    for (const objective of [0, 1, 2, 3, 4, 5]) progress = recordAcademyObjective(progress, objective);
    expect(progress.academyCompleted).toBe(true);
    expect(parseProgress(JSON.stringify(progress))).toMatchObject(progress);
  });
  it("a legacy selection cursor never implies prior completion", () => {
    for (const academyObjective of [3, 6, 9]) {
      const saved = parseProgress(JSON.stringify({ ...createProgress(), academyObjective }));
      expect(saved.completedObjectives).toEqual([]);
      expect(saved.academyCompleted).toBe(false);
    }
  });
  it("migrates explicit legacy completion and derives new mastery from valid objective IDs", () => {
    expect(parseProgress(JSON.stringify({ ...createProgress(), completedLessons: [1] })).completedObjectives).toEqual([3, 4, 5]);
    const saved = parseProgress(JSON.stringify({ ...createProgress(), academyCompleted: true, completedLessons: [0, 1, 2], completedObjectives: [6, 6, 7, 8, 9, -1, "0"] }));
    expect(saved.completedObjectives).toEqual([6, 7, 8]);
    expect(saved.completedLessons).toEqual([2]);
    expect(saved.academyCompleted).toBe(false);
  });
  it("rejects invalid objective IDs and non-finite stored numbers", () => {
    const progress = createProgress();
    for (const id of [-1, 9, NaN, Infinity, 1.5]) expect(recordAcademyObjective(progress, id)).toBe(progress);
    expect(parseProgress('{"version":1,"academyCompleted":false,"voyages":1e309,"distanceSailed":0,"activities":{}}')).toEqual(progress);
    expect(parseProgress(JSON.stringify({ ...progress, activities: [] }))).toEqual(progress);
  });
  it("restores valid lesson progress and discards invalid or duplicate lesson records", () => {
    const restored = parseProgress(JSON.stringify({ ...createProgress(), academyObjective: 4, completedLessons: [0, 0, 2, -1, 3, "1"] }));
    expect(restored.academyObjective).toBe(4);
    expect(restored.completedLessons).toEqual([0, 2]);
    for (const academyObjective of [-1, 10, 1.5, "4"]) {
      expect(parseProgress(JSON.stringify({ ...createProgress(), academyObjective })).academyObjective).toBeUndefined();
    }
  });
  it("rejects corrupt or unversioned storage", () => {
    expect(parseProgress("{broken")).toEqual(createProgress());
    expect(parseProgress('{"version":2}')).toEqual(createProgress());
  });

  it("preserves the best score while counting repeat mastery", () => {
    let progress = createProgress();
    progress = recordActivityCompletion(
      progress,
      "school-water-tacks",
      {
        total: 88,
        control: 90,
        trim: 86,
        safety: 100,
        efficiency: 70,
        summary: "Secure",
      },
      "2026-01-01T00:00:00.000Z",
    );
    progress = recordActivityCompletion(
      progress,
      "school-water-tacks",
      {
        total: 81,
        control: 80,
        trim: 80,
        safety: 100,
        efficiency: 60,
        summary: "Secure",
      },
      "2026-01-02T00:00:00.000Z",
    );
    expect(progress.activities["school-water-tacks"]).toEqual({
      completions: 2,
      bestScore: 88,
      lastCompletedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});
