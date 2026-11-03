import { describe, expect, it } from "vitest";
import { trimGuide } from "./trim-guide";

const rad = (degrees: number) => degrees * Math.PI / 180;

describe("trim guide", () => {
  it("centres the useful range on the model's ideal boom angle", () => {
    const guide = trimGuide(rad(90), 6, 1, rad(46.8))!;
    expect(guide.low).toBeLessThan(guide.target);
    expect(guide.high).toBeGreaterThan(guide.target);
    expect(guide.high).toBeLessThan(1);
  });

  it("clamps the useful range at the sheet's end", () => {
    const guide = trimGuide(rad(42), 6, 1, rad(12.24))!;
    expect(guide.high).toBeLessThan(1);
    const slack = trimGuide(rad(180), 6, 1, rad(85))!;
    expect(slack.high).toBe(1);
  });

  it("withholds guidance for calm air, lowered sails and the no-go zone", () => {
    expect(trimGuide(rad(90), 0.1, 1, rad(46))).toBeNull();
    expect(trimGuide(rad(90), 6, 0, rad(46))).toBeNull();
    expect(trimGuide(rad(30), 6, 1, rad(5))).toBeNull();
  });
});
