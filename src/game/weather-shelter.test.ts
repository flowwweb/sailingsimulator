import { describe, expect, it } from "vitest";
import { WeatherShelter, type ShelterObservation } from "./weather-shelter";

const base: ShelterObservation = { dt: 1, x: 0, z: 0, speed: 2, reefed: false, reefSettled: true, attached: 0.8, heelRadians: 0.1, incident: false };

describe("weather shelter exercise", () => {
  it("requires the forecast, controlled reefed sailing and the actual berth", () => {
    const exercise = new WeatherShelter({ x: 200, z: 0 });
    for (let i = 0; i < 12; i++) exercise.update(base);
    expect(exercise.stage).toBe("respond");
    for (let i = 0; i < 5; i++) exercise.update({ ...base, reefed: true, x: i * 2 });
    expect(exercise.stage).toBe("approach");
    for (let i = 5; i <= 98; i++) exercise.update({ ...base, reefed: true, x: i * 2 });
    expect(exercise.update({ ...base, reefed: true, x: 198, dockedAt: "other-dock" })).toBe("approach");
    expect(exercise.update({ ...base, reefed: true, x: 200, dockedAt: "juniper-cove-dock" })).toBe("complete");
  });

  it("rejects poor control, collisions and position jumps rather than awarding arrival", () => {
    const exercise = new WeatherShelter({ x: 200, z: 0 });
    for (let i = 0; i < 12; i++) exercise.update(base);
    for (let i = 0; i < 8; i++) exercise.update({ ...base, reefed: true, attached: 0.1, dockedAt: "juniper-cove-dock" });
    expect(exercise.stage).toBe("respond");
    expect(exercise.update({ ...base, incident: true })).toBe("failed");
    expect(exercise.update({ ...base, dockedAt: "juniper-cove-dock" })).toBe("failed");
    const jump = new WeatherShelter({ x: 200, z: 0 });
    jump.update(base);
    expect(jump.update({ ...base, x: 150 })).toBe("failed");
  });

  it("resets a continuous control hold on interruption", () => {
    const exercise = new WeatherShelter({ x: 200, z: 0 });
    for (let i = 0; i < 12; i++) exercise.update(base);
    for (let i = 0; i < 4; i++) exercise.update({ ...base, reefed: true });
    exercise.interrupt();
    expect(exercise.update({ ...base, reefed: true })).toBe("respond");
  });
});
