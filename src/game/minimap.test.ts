import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { depthAtTide, isInsideLake, LAKE_RADIUS, sampleLakeDepth } from "./bathymetry";

const source = readFileSync(new URL("./minimap.ts", import.meta.url), "utf8");
const start = source.indexOf("  private paintBackground(): void {");
const end = source.indexOf("\n  }", start) + 4;
const paintSource = stripTypeScriptTypes(source.slice(start, end).replace("  private paintBackground", "function paintBackground"), { mode: "strip" });
const helpers = stripTypeScriptTypes(source.slice(source.indexOf("function crossedContour(")), { mode: "strip" });

function painted(width: number, height: number, minimap: boolean, tide: number,
  sample = (x: number, z: number) => depthAtTide(sampleLakeDepth(x, z), tide)) {
  let calls = 0, image!: { data: Uint8ClampedArray };
  const paint = runInNewContext(`${helpers}\n${paintSource}\npaintBackground`, {
    LAKE_RADIUS, DEPTH_CONTOURS: [2, 5, 10, 20], isInsideLake,
    sampleLakeDepth(x: number, z: number) { calls++; return sample(x, z); },
  });
  paint.call({ canvas: { id: minimap ? "minimap" : "chart" }, background: { width, height,
    getContext: () => ({ createImageData: () => image = { data: new Uint8ClampedArray(width * height * 4) }, putImageData() {} }) } });
  return { data: image.data, calls };
}

// Independent full-grid reference retains every neighbor in double precision.
function reference(width: number, height: number, minimap: boolean, tide: number,
  sample = (x: number, z: number) => depthAtTide(sampleLakeDepth(x, z), tide)): Uint8ClampedArray {
  const depths = new Float64Array(width * height), inside: boolean[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const wx = ((x + 0.5) / width - 0.5) * LAKE_RADIUS * 2;
    const wz = (0.5 - (y + 0.5) / height) * LAKE_RADIUS * 2;
    depths[y * width + x] = sample(wx, wz);
    inside.push(isInsideLake(wx, wz));
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, d = depths[i]!;
    const left = x ? depths[i - 1]! : d, upper = y ? depths[i - width]! : d;
    const color = minimap ? !inside[i] || d <= 0 ? [94, 139, 111]
      : d < 2 ? [190, 181, 133] : d < 5 ? [80, 134, 121] : [3, 67, 99]
      : !inside[i] || d <= 0 ? [226, 216, 184] : d < 2 ? [192, 207, 184]
      : d < 5 ? [176, 215, 208] : d < 10 ? [196, 226, 221] : d < 20 ? [213, 233, 229] : [229, 240, 236];
    const shoreline = (d > 0) !== (left > 0) || (d > 0) !== (upper > 0);
    const contour = !minimap && d > 0 && [2, 5, 10, 20].some(c => (d < c) !== (left < c) || (d < c) !== (upper < c));
    data.set(shoreline ? minimap ? [219, 218, 179] : [48, 83, 88] : contour ? [73, 122, 130] : color, i * 4);
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe("cached chart background depth reuse", () => {
  it("preserves RGBA bytes across row edges, dimensions, contours and tide-adjusted depth samples", () => {
    expect(start).toBeGreaterThanOrEqual(0); expect(end).toBeGreaterThan(start);
    for (const [width, height] of [[1, 1], [1, 7], [7, 1], [2, 3], [17, 13], [88, 88], [126, 126], [189, 189]]) {
      for (const minimap of [false, true]) for (const tide of [-1, 0, 1]) {
        const actual = painted(width!, height!, minimap, tide);
        expect(actual.data).toEqual(reference(width!, height!, minimap, tide));
        expect(actual.calls).toBe(width! * height!);
      }
    }
  });

  it("does not round a neighboring depth across a contour threshold", () => {
    const sample = (x: number) => x > 0 ? 2 + 1e-9 : 2 - 1e-9;
    const actual = painted(2, 2, false, 0, sample);
    expect(actual.data).toEqual(reference(2, 2, false, 0, sample));
    expect(actual.calls).toBe(4);
  });
});
