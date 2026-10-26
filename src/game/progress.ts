import type { ActivityScore } from "./activity-session";

export const PROGRESS_STORAGE_KEY = "fair-winds-progress-v1";

export interface ActivityRecord {
  completions: number;
  bestScore: number;
  lastCompletedAt: string;
}

export interface SailingProgress {
  version: 1;
  academyCompleted: boolean;
  academyObjective?: number;
  completedLessons?: number[];
  completedObjectives?: number[];
  academyLesson?: number;
  academyPaused?: boolean;
  activities: Record<string, ActivityRecord>;
  voyages: number;
  distanceSailed: number;
}

export function createProgress(): SailingProgress {
  return {
    version: 1,
    academyCompleted: false,
    activities: {},
    voyages: 0,
    distanceSailed: 0,
  };
}

export function parseProgress(raw: string | null): SailingProgress {
  if (!raw) return createProgress();
  try {
    const value = JSON.parse(raw) as Partial<SailingProgress>;
    if (
      value.version !== 1 ||
      typeof value.academyCompleted !== "boolean" ||
      !Number.isFinite(value.voyages) ||
      !Number.isFinite(value.distanceSailed) ||
      !value.activities ||
      typeof value.activities !== "object" || Array.isArray(value.activities)
    ) {
      return createProgress();
    }
    const restored: SailingProgress = {
      version: 1,
      academyCompleted: value.academyCompleted,
      voyages: Math.max(0, value.voyages!),
      distanceSailed: Math.max(0, value.distanceSailed!),
      activities: sanitizeRecords(value.activities),
    };
    if (Number.isInteger(value.academyObjective) && value.academyObjective! >= 0 && value.academyObjective! <= 9) restored.academyObjective = value.academyObjective;
    if (Array.isArray(value.completedLessons)) restored.completedLessons = [...new Set(value.completedLessons.filter((lesson) => Number.isInteger(lesson) && lesson >= 0 && lesson <= 2))];
    if (Number.isInteger(value.academyLesson) && value.academyLesson! >= 0 && value.academyLesson! <= 2) restored.academyLesson = value.academyLesson;
    restored.academyPaused = value.academyPaused === true;
    // Legacy cursor position is navigation, never proof of previous targets.
    restored.completedObjectives = Array.isArray(value.completedObjectives)
      ? validObjectives(value.completedObjectives)
      : (value.academyCompleted ? [0, 1, 2] : restored.completedLessons ?? []).flatMap((lesson) => [lesson * 3, lesson * 3 + 1, lesson * 3 + 2]);
    return deriveMastery(restored);
  } catch {
    return createProgress();
  }
}

function validObjectives(objectives: number[]): number[] {
  return [...new Set(objectives.filter((id) => Number.isInteger(id) && id >= 0 && id < 9))].sort((a, b) => a - b);
}

function deriveMastery(progress: SailingProgress): SailingProgress {
  const earned = progress.completedObjectives ?? [];
  const completedLessons = [0, 1, 2].filter((lesson) => [0, 1, 2].every((target) => earned.includes(lesson * 3 + target)));
  return { ...progress, completedLessons, academyCompleted: completedLessons.length === 3 };
}

/** Call only for the objective whose live academy.update just returned true. */
export function recordAcademyObjective(progress: SailingProgress, objective: number): SailingProgress {
  if (!Number.isInteger(objective) || objective < 0 || objective >= 9) return progress;
  return deriveMastery({ ...progress, completedObjectives: validObjectives([...(progress.completedObjectives ?? []), objective]) });
}

export function nextLessonObjective(progress: SailingProgress, lesson: number): number {
  if (!Number.isInteger(lesson) || lesson < 0 || lesson > 2) return 0;
  return [0, 1, 2].map((target) => lesson * 3 + target)
    .find((objective) => !progress.completedObjectives?.includes(objective)) ?? lesson * 3;
}

export function recordActivityCompletion(
  progress: SailingProgress,
  activityId: string,
  score: ActivityScore,
  completedAt = new Date().toISOString(),
): SailingProgress {
  const previous = progress.activities[activityId];
  return {
    ...progress,
    activities: {
      ...progress.activities,
      [activityId]: {
        completions: (previous?.completions ?? 0) + 1,
        bestScore: Math.max(previous?.bestScore ?? 0, score.total),
        lastCompletedAt: completedAt,
      },
    },
  };
}

function sanitizeRecords(
  records: Record<string, ActivityRecord>,
): Record<string, ActivityRecord> {
  const result: Record<string, ActivityRecord> = {};
  for (const [id, record] of Object.entries(records)) {
    if (
      !record ||
      !Number.isFinite(record.completions) ||
      !Number.isFinite(record.bestScore) ||
      typeof record.lastCompletedAt !== "string"
    ) {
      continue;
    }
    result[id] = {
      completions: Math.max(0, Math.floor(record.completions)),
      bestScore: Math.min(100, Math.max(0, Math.round(record.bestScore))),
      lastCompletedAt: record.lastCompletedAt,
    };
  }
  return result;
}
