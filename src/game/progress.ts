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
      typeof value.voyages !== "number" ||
      typeof value.distanceSailed !== "number" ||
      !value.activities ||
      typeof value.activities !== "object"
    ) {
      return createProgress();
    }
    return {
      version: 1,
      academyCompleted: value.academyCompleted,
      voyages: Math.max(0, value.voyages),
      distanceSailed: Math.max(0, value.distanceSailed),
      activities: sanitizeRecords(value.activities),
    };
  } catch {
    return createProgress();
  }
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
      typeof record.completions !== "number" ||
      typeof record.bestScore !== "number" ||
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
