import type { WeatherSnapshot } from "./types";

export interface WeatherTrend {
  windDelta: number;
  directionDelta: number;
  rainDelta: number;
  summary: string;
  reefAdvice: "full-sail" | "consider-reef" | "reef-now";
}

export function weatherTrend(
  current: Pick<
    WeatherSnapshot,
    "windSpeed" | "windDirectionFromDegrees" | "rain"
  >,
  future: Pick<
    WeatherSnapshot,
    "windSpeed" | "windDirectionFromDegrees" | "rain"
  >,
): WeatherTrend {
  const windDelta = future.windSpeed - current.windSpeed;
  const directionDelta = shortestDegrees(
    future.windDirectionFromDegrees - current.windDirectionFromDegrees,
  );
  const rainDelta = future.rain - current.rain;
  const reefAdvice =
    future.windSpeed >= 10 || windDelta >= 2.4
      ? "reef-now"
      : future.windSpeed >= 7.5 || windDelta >= 1.3
        ? "consider-reef"
        : "full-sail";
  const windPhrase =
    windDelta > 0.7
      ? `building ${windDelta.toFixed(1)} m/s`
      : windDelta < -0.7
        ? `easing ${Math.abs(windDelta).toFixed(1)} m/s`
        : "holding steady";
  const shiftPhrase =
    Math.abs(directionDelta) >= 8
      ? `, shifting ${directionDelta > 0 ? "clockwise" : "counter-clockwise"} ${Math.round(Math.abs(directionDelta))}°`
      : "";
  const rainPhrase = rainDelta > 0.12 ? ", rain increasing" : "";
  return {
    windDelta,
    directionDelta,
    rainDelta,
    summary: `Wind ${windPhrase}${shiftPhrase}${rainPhrase}`,
    reefAdvice,
  };
}

function shortestDegrees(value: number): number {
  return ((value + 540) % 360) - 180;
}
