import { describe, expect, it } from "vitest";
import { Group, LatheGeometry, Mesh } from "three";
import { createTrainingBuoy } from "./training-buoy";

describe("training buoy", () => {
  it("has a waterline-sized inflatable body and no numbered topmark", () => {
    const buoy = createTrainingBuoy(0xd78935);
    expect(buoy).toBeInstanceOf(Group);
    expect(buoy.children.map((part) => part.name)).toEqual([
      "Inflatable orange body", "Reflective band", "Base seam",
    ]);
    const body = buoy.children[0] as Mesh<LatheGeometry>;
    expect(body.geometry).toBeInstanceOf(LatheGeometry);
    body.geometry.computeBoundingBox();
    expect(body.geometry.boundingBox!.min.y).toBeCloseTo(-0.35);
    expect(body.geometry.boundingBox!.max.y).toBeCloseTo(1.64);
    expect(body.geometry.boundingBox!.max.x).toBeLessThan(0.7);
  });
});
