import { describe, expect, it } from "vitest";
import {
  compassTicks,
  normalizeHeading,
  unwrapCompassHeading,
} from "./compass-tape";

describe("live compass tape", () => {
  it("builds repeated five-degree ticks with cardinal anchors", () => {
    const ticks = compassTicks(-90, 90);

    expect(ticks).toHaveLength(37);
    expect(ticks.find((tick) => tick.degrees === 0)).toMatchObject({
      kind: "cardinal",
      label: "N",
    });
    expect(ticks.find((tick) => tick.degrees === 45)?.label).toBe("NE");
    expect(ticks.find((tick) => tick.degrees === 30)?.kind).toBe("major");
    expect(ticks.find((tick) => tick.degrees === 25)?.kind).toBe("minor");
  });

  it("unwraps north crossings in the direction the boat actually turned", () => {
    expect(unwrapCompassHeading(358, 2)).toBe(362);
    expect(unwrapCompassHeading(2, 358)).toBe(-2);
    expect(unwrapCompassHeading(181, 179)).toBe(179);
  });

  it("normalizes display headings", () => {
    expect(normalizeHeading(362)).toBe(2);
    expect(normalizeHeading(-2)).toBe(358);
  });
});
