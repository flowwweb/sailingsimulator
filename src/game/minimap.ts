import { LAKE_RADIUS, sampleLakeDepth } from "./bathymetry";
import type { BoatState, Vec2 } from "../sim/model";

export interface MapLandmark {
  name: string;
  x: number;
  z: number;
}

export class LakeMinimap {
  private readonly background = document.createElement("canvas");
  private cssSize = 0;
  private pixelRatio = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  render(state: BoatState, landmarks: readonly MapLandmark[], trueWind: Vec2): void {
    this.syncSize();
    const context = this.canvas.getContext("2d");
    if (!context || this.cssSize <= 0) return;

    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.cssSize, this.cssSize);
    context.drawImage(this.background, 0, 0, this.cssSize, this.cssSize);

    const toMap = (x: number, z: number) => ({
      x: (x / (LAKE_RADIUS * 2) + 0.5) * this.cssSize,
      y: (0.5 - z / (LAKE_RADIUS * 2)) * this.cssSize,
    });

    context.lineWidth = 1;
    context.font = "600 8px 'DM Sans', sans-serif";
    context.textAlign = "center";
    for (const landmark of landmarks) {
      const point = toMap(landmark.x, landmark.z);
      context.fillStyle = "rgba(247, 240, 223, 0.82)";
      context.beginPath();
      context.arc(point.x, point.y, 2.1, 0, Math.PI * 2);
      context.fill();
    }

    const boat = toMap(state.position.x, state.position.y);
    context.save();
    context.translate(boat.x, boat.y);
    context.rotate(state.heading);
    context.fillStyle = "#efbc7b";
    context.strokeStyle = "rgba(8, 33, 40, 0.72)";
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(4, 5);
    context.lineTo(0, 3);
    context.lineTo(-4, 5);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    const windSpeed = Math.hypot(trueWind.x, trueWind.y);
    if (windSpeed > 0.01) {
      const windAngle = Math.atan2(trueWind.x, trueWind.y);
      context.save();
      context.translate(this.cssSize - 14, 14);
      context.rotate(windAngle);
      context.strokeStyle = "rgba(247, 240, 223, 0.7)";
      context.fillStyle = "rgba(247, 240, 223, 0.7)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(0, -6);
      context.lineTo(0, 6);
      context.stroke();
      context.beginPath();
      context.moveTo(0, 7);
      context.lineTo(-3, 2);
      context.lineTo(3, 2);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  private syncSize(): void {
    const size = Math.max(Math.round(this.canvas.clientWidth), 1);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    if (size === this.cssSize && pixelRatio === this.pixelRatio) return;

    this.cssSize = size;
    this.pixelRatio = pixelRatio;
    const pixels = Math.round(size * pixelRatio);
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.background.width = pixels;
    this.background.height = pixels;
    this.paintBackground();
  }

  private paintBackground(): void {
    const context = this.background.getContext("2d");
    if (!context) return;
    const { width, height } = this.background;
    const image = context.createImageData(width, height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const worldX = ((x + 0.5) / width - 0.5) * LAKE_RADIUS * 2;
        const worldZ = (0.5 - (y + 0.5) / height) * LAKE_RADIUS * 2;
        const depth = sampleLakeDepth(worldX, worldZ);
        const offset = (y * width + x) * 4;
        const color = depthColor(depth, Math.hypot(worldX, worldZ) < LAKE_RADIUS);
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = color[3];
      }
    }
    context.putImageData(image, 0, 0);
  }
}

function depthColor(depth: number, insideLake: boolean): readonly [number, number, number, number] {
  if (!insideLake) return [14, 42, 49, 225];
  if (depth < 1) return [129, 132, 105, 235];
  if (depth < 5) return [76, 126, 125, 235];
  if (depth < 15) return [43, 105, 119, 235];
  return [28, 79, 96, 235];
}
