import { describe, expect, it } from "vitest";
import { SailingAcademy, type AcademyObservation } from "./academy";

const base: AcademyObservation = {
  attached: 0,
  stall: 0,
  pointOfSail: "Beam reach",
  tackCount: 0,
  gybeCount: 0,
  reefed: false,
  heelRadians: 0,
};

function hold(
  academy: SailingAcademy,
  observation: AcademyObservation,
  seconds = 2,
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) {
    academy.update(0.1, observation);
  }
}

describe("SailingAcademy", () => {
  it("requires observable sail states and points of sail in sequence", () => {
    const academy = new SailingAcademy();
    hold(academy, { ...base, attached: 0.8 });
    expect(academy.view().stage).toBe("stall");
    hold(academy, { ...base, stall: 0.7 });
    expect(academy.view().stage).toBe("recover");
    hold(academy, { ...base, attached: 0.82 });
    expect(academy.view().stage).toBe("close-hauled");
    hold(academy, { ...base, attached: 0.8, pointOfSail: "Close-hauled" });
    expect(academy.view().stage).toBe("beam-reach");
    hold(academy, { ...base, attached: 0.8, pointOfSail: "Beam reach" });
    expect(academy.view().stage).toBe("broad-reach");
    hold(academy, { ...base, attached: 0.8, pointOfSail: "Broad reach" });
    expect(academy.view().stage).toBe("tack");
  });

  it("finishes only after a recovered tack, gybe, and settled reef", () => {
    const academy = new SailingAcademy();
    for (const observation of [
      { ...base, attached: 0.8 },
      { ...base, stall: 0.7 },
      { ...base, attached: 0.82 },
      { ...base, attached: 0.8, pointOfSail: "Close-hauled" },
      { ...base, attached: 0.8, pointOfSail: "Beam reach" },
      { ...base, attached: 0.8, pointOfSail: "Broad reach" },
      { ...base, attached: 0.8, tackCount: 1 },
      { ...base, attached: 0.8, tackCount: 1, gybeCount: 1 },
      {
        ...base,
        attached: 0.8,
        tackCount: 1,
        gybeCount: 1,
        reefed: true,
        heelRadians: 0.2,
      },
    ]) {
      hold(academy, observation);
    }
    expect(academy.view().stage).toBe("complete");
  });

  it("lets the player leave coaching without faking intermediate mastery", () => {
    const academy = new SailingAcademy();
    academy.skip();
    expect(academy.view().stage).toBe("complete");
  });
});
