import { sheetForBoomAngle } from "../sim/model";

export function trimGuide(apparentAngle: number, windSpeed: number, deployment: number, idealBoom: number) {
  if (windSpeed < 0.5 || deployment < 0.24 || Math.abs(apparentAngle) < 42 * Math.PI / 180) return null;
  const tolerance = 5 * Math.PI / 180;
  const target = sheetForBoomAngle(idealBoom);
  const low = sheetForBoomAngle(Math.max(0, idealBoom - tolerance));
  const high = sheetForBoomAngle(idealBoom + tolerance);
  return { target, low, high };
}
