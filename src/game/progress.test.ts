import { describe, expect, it } from "vitest";
import {
  createProgress,
  parseProgress,
  recordActivityCompletion,
} from "./progress";

describe("sailing progress", () => {
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
