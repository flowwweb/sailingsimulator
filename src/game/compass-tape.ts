export interface CompassTick {
  degrees: number;
  kind: "minor" | "major" | "cardinal";
  label?: string;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function compassTicks(
  minimum = -720,
  maximum = 720,
): CompassTick[] {
  const ticks: CompassTick[] = [];
  for (let degrees = minimum; degrees <= maximum; degrees += 5) {
    const normalized = normalizeHeading(degrees);
    const cardinalIndex = normalized % 45 === 0 ? normalized / 45 : -1;
    ticks.push({
      degrees,
      kind:
        cardinalIndex >= 0
          ? "cardinal"
          : normalized % 15 === 0
            ? "major"
            : "minor",
      label: cardinalIndex >= 0 ? CARDINALS[cardinalIndex] : undefined,
    });
  }
  return ticks;
}

export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function unwrapCompassHeading(
  previousUnwrapped: number,
  nextHeading: number,
): number {
  const previousHeading = normalizeHeading(previousUnwrapped);
  const next = normalizeHeading(nextHeading);
  const shortestDelta = ((next - previousHeading + 540) % 360) - 180;
  let unwrapped = previousUnwrapped + shortestDelta;
  if (unwrapped > 540) unwrapped -= 360;
  if (unwrapped < -540) unwrapped += 360;
  return unwrapped;
}
