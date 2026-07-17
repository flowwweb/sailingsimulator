import {
  LAKE_RADIUS,
  isInsideLake,
  sampleLakeDepth,
} from "./bathymetry";
import { buoyVisualSpec } from "../render/buoy-visual";
import { worldObjectFeaturePosition } from "./world-definition";
import type {
  RegionPurpose,
  WorldActivity,
  WorldDefinition,
  WorldObject,
} from "./world-definition";
import type { BoatState, Vec2 } from "../sim/model";

const DEPTH_CONTOURS = [2, 5, 10, 20] as const;
const GRID_SPACING = 400;

export class LakeChart {
  private readonly background = document.createElement("canvas");
  private cssSize = 0;
  private pixelRatio = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  render(
    state: BoatState,
    world: WorldDefinition,
    trueWind: Vec2,
    selectedActivity?: WorldActivity,
  ): void {
    this.syncSize();
    const context = this.canvas.getContext("2d");
    if (!context || this.cssSize <= 0) return;

    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.cssSize, this.cssSize);
    context.drawImage(this.background, 0, 0, this.cssSize, this.cssSize);
    this.drawGrid(context);
    this.drawRegions(context, world);
    this.drawRoutes(context, world);
    this.drawObjects(context, world.objects);
    this.drawActivities(context, world.activities, selectedActivity?.id);
    if (selectedActivity) this.drawCourse(context, state, selectedActivity);
    this.drawBoat(context, state);
    this.drawWind(context, trueWind);
    this.drawCompassRose(context);
    this.drawScale(context);

    context.strokeStyle = "rgba(36, 66, 75, 0.72)";
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, this.cssSize - 1, this.cssSize - 1);
  }

  private toMap(x: number, z: number): { x: number; y: number } {
    return {
      x: (x / (LAKE_RADIUS * 2) + 0.5) * this.cssSize,
      y: (0.5 - z / (LAKE_RADIUS * 2)) * this.cssSize,
    };
  }

  private drawGrid(context: CanvasRenderingContext2D): void {
    context.save();
    context.strokeStyle = "rgba(52, 92, 100, 0.13)";
    context.fillStyle = "rgba(36, 70, 79, 0.48)";
    context.lineWidth = 0.7;
    context.font = "500 7px 'DM Sans', sans-serif";
    context.textAlign = "left";
    for (
      let coordinate = -1_600;
      coordinate <= 1_600;
      coordinate += GRID_SPACING
    ) {
      const vertical = this.toMap(coordinate, 0).x;
      const horizontal = this.toMap(0, coordinate).y;
      context.beginPath();
      context.moveTo(vertical, 0);
      context.lineTo(vertical, this.cssSize);
      context.moveTo(0, horizontal);
      context.lineTo(this.cssSize, horizontal);
      context.stroke();
      if (coordinate !== 0 && this.cssSize >= 500) {
        context.fillText(`${Math.abs(coordinate / 1_000).toFixed(1)}`, vertical + 3, 12);
      }
    }
    context.restore();
  }

  private drawRegions(
    context: CanvasRenderingContext2D,
    world: WorldDefinition,
  ): void {
    if (this.cssSize < 240) return;
    context.save();
    context.textAlign = "center";
    for (const region of world.regions) {
      const center = this.toMap(region.centerX, region.centerZ);
      const color = regionColor(region.purpose);
      context.font = "700 7px 'Manrope', sans-serif";
      const label = region.name.toUpperCase();
      const labelWidth = context.measureText(label).width;
      context.fillStyle = "rgba(238, 239, 218, 0.72)";
      context.fillRect(
        center.x - labelWidth * 0.5 - 4,
        center.y - 7,
        labelWidth + 8,
        11,
      );
      context.strokeStyle = color.stroke;
      context.lineWidth = 0.8;
      context.beginPath();
      context.moveTo(center.x - labelWidth * 0.5, center.y + 6);
      context.lineTo(center.x + labelWidth * 0.5, center.y + 6);
      context.stroke();
      context.fillStyle = color.text;
      context.fillText(label, center.x, center.y + 1);
    }
    context.restore();
  }

  private drawRoutes(
    context: CanvasRenderingContext2D,
    world: WorldDefinition,
  ): void {
    context.save();
    context.lineCap = "round";
    for (const route of world.routes) {
      context.strokeStyle = route.kind === "channel"
        ? "rgba(39, 124, 140, 0.88)"
        : "rgba(73, 104, 113, 0.64)";
      context.lineWidth = route.kind === "channel" ? 2 : 1.3;
      context.setLineDash(route.kind === "channel" ? [7, 5] : [3, 5]);
      context.beginPath();
      route.points.forEach((point, index) => {
        const mapped = this.toMap(point.x, point.z);
        if (index === 0) context.moveTo(mapped.x, mapped.y);
        else context.lineTo(mapped.x, mapped.y);
      });
      context.stroke();
    }
    context.restore();
  }

  private drawObjects(
    context: CanvasRenderingContext2D,
    objects: readonly WorldObject[],
  ): void {
    context.save();
    context.textAlign = "left";
    for (const object of objects) {
      const feature = worldObjectFeaturePosition(object);
      const point = this.toMap(feature.x, feature.z);
      drawObjectSymbol(context, object, point.x, point.y);
      if (this.cssSize < 240 || !object.navigation || object.kind === "buoy") continue;
      context.fillStyle = "rgba(29, 58, 67, 0.86)";
      context.font = "600 7px 'DM Sans', sans-serif";
      context.fillText(object.name, point.x + 7, point.y - 5);
    }
    context.restore();
  }

  private drawActivities(
    context: CanvasRenderingContext2D,
    activities: readonly WorldActivity[],
    selectedId?: string,
  ): void {
    context.save();
    context.textAlign = "center";
    activities.forEach((activity, index) => {
      const point = this.toMap(activity.x, activity.z);
      const selected = activity.id === selectedId;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = selected ? "#c78538" : "rgba(255, 252, 235, 0.94)";
      context.strokeStyle = selected ? "#6e4424" : activityColor(activity.kind);
      context.lineWidth = selected ? 2 : 1.2;
      context.fillRect(-5, -5, 10, 10);
      context.strokeRect(-5, -5, 10, 10);
      context.rotate(-Math.PI / 4);
      if (this.cssSize >= 240) {
        context.fillStyle = selected ? "#fffaf0" : "#294f59";
        context.font = "700 6px 'DM Sans', sans-serif";
        context.fillText(String(index + 1), 0, 2.2);
      }
      context.restore();
    });
    context.restore();
  }

  private drawCourse(
    context: CanvasRenderingContext2D,
    state: BoatState,
    activity: WorldActivity,
  ): void {
    const boat = this.toMap(state.position.x, state.position.y);
    const destination = this.toMap(activity.x, activity.z);
    context.save();
    context.strokeStyle = "rgba(179, 112, 47, 0.88)";
    context.lineWidth = 1.4;
    context.setLineDash([6, 4]);
    context.beginPath();
    context.moveTo(boat.x, boat.y);
    context.lineTo(destination.x, destination.y);
    context.stroke();
    context.restore();
  }

  private drawBoat(
    context: CanvasRenderingContext2D,
    state: BoatState,
  ): void {
    const boat = this.toMap(state.position.x, state.position.y);
    context.save();
    context.translate(boat.x, boat.y);
    context.rotate(state.heading);
    context.fillStyle = "#b86f32";
    context.strokeStyle = "#173f49";
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(4.5, 5.5);
    context.lineTo(0, 3.5);
    context.lineTo(-4.5, 5.5);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawWind(
    context: CanvasRenderingContext2D,
    trueWind: Vec2,
  ): void {
    if (this.cssSize < 240) return;
    const windSpeed = Math.hypot(trueWind.x, trueWind.y);
    if (windSpeed <= 0.01) return;
    const windAngle = Math.atan2(trueWind.x, trueWind.y);
    context.save();
    context.translate(28, 29);
    context.rotate(windAngle);
    context.strokeStyle = "rgba(31, 75, 85, 0.82)";
    context.fillStyle = "rgba(31, 75, 85, 0.82)";
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(0, 9);
    context.stroke();
    context.beginPath();
    context.moveTo(0, 11);
    context.lineTo(-3.5, 5);
    context.lineTo(3.5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.fillStyle = "rgba(31, 75, 85, 0.74)";
    context.font = "700 6px 'Manrope', sans-serif";
    context.textAlign = "center";
    context.fillText("WIND TO", 28, 48);
  }

  private drawCompassRose(context: CanvasRenderingContext2D): void {
    if (this.cssSize < 240) return;
    const x = this.cssSize - 29;
    const y = 30;
    context.save();
    context.strokeStyle = "rgba(37, 72, 81, 0.72)";
    context.fillStyle = "rgba(37, 72, 81, 0.84)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 14, 0, Math.PI * 2);
    context.moveTo(x, y - 11);
    context.lineTo(x + 3, y + 5);
    context.lineTo(x, y + 2);
    context.lineTo(x - 3, y + 5);
    context.closePath();
    context.stroke();
    context.fill();
    context.font = "700 7px 'Manrope', sans-serif";
    context.textAlign = "center";
    context.fillText("N", x, y - 18);
    context.restore();
  }

  private drawScale(context: CanvasRenderingContext2D): void {
    if (this.cssSize < 240) return;
    const length = (500 / (LAKE_RADIUS * 2)) * this.cssSize;
    const x = 18;
    const y = this.cssSize - 18;
    context.save();
    context.strokeStyle = "rgba(34, 67, 76, 0.82)";
    context.fillStyle = "rgba(34, 67, 76, 0.82)";
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y);
    context.moveTo(x, y - 3);
    context.lineTo(x, y + 3);
    context.moveTo(x + length, y - 3);
    context.lineTo(x + length, y + 3);
    context.stroke();
    context.font = "600 7px 'DM Sans', sans-serif";
    context.textAlign = "center";
    context.fillText("500 m", x + length / 2, y - 5);
    context.restore();
  }

  private syncSize(): void {
    const size = Math.max(Math.round(this.canvas.clientWidth), 1);
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
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
        const insideLake = isInsideLake(worldX, worldZ);
        const offset = (y * width + x) * 4;
        const color = depthColor(depth, insideLake);
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = 255;

        const leftDepth = x > 0
          ? sampleLakeDepth(
              ((x - 0.5) / width - 0.5) * LAKE_RADIUS * 2,
              worldZ,
            )
          : depth;
        const upperDepth = y > 0
          ? sampleLakeDepth(
              worldX,
              (0.5 - (y - 0.5) / height) * LAKE_RADIUS * 2,
            )
          : depth;
        const wet = depth > 0;
        const shoreline =
          wet !== (leftDepth > 0) || wet !== (upperDepth > 0);
        if (shoreline) {
          image.data[offset] = 48;
          image.data[offset + 1] = 83;
          image.data[offset + 2] = 88;
        } else if (wet && DEPTH_CONTOURS.some((contour) =>
          crossedContour(depth, leftDepth, contour) ||
          crossedContour(depth, upperDepth, contour))) {
          image.data[offset] = 73;
          image.data[offset + 1] = 122;
          image.data[offset + 2] = 130;
        }
      }
    }
    context.putImageData(image, 0, 0);
  }
}

function crossedContour(a: number, b: number, contour: number): boolean {
  return (a < contour && b >= contour) || (b < contour && a >= contour);
}

function depthColor(
  depth: number,
  insideLake: boolean,
): readonly [number, number, number] {
  if (!insideLake || depth <= 0) return [226, 216, 184];
  if (depth < 2) return [192, 207, 184];
  if (depth < 5) return [176, 215, 208];
  if (depth < 10) return [196, 226, 221];
  if (depth < 20) return [213, 233, 229];
  return [229, 240, 236];
}

function regionColor(purpose: RegionPurpose): {
  fill: string;
  stroke: string;
  text: string;
} {
  if (purpose === "lesson") {
    return {
      fill: "rgba(201, 139, 58, 0.06)",
      stroke: "rgba(174, 109, 42, 0.48)",
      text: "rgba(125, 76, 31, 0.78)",
    };
  }
  if (purpose === "weather") {
    return {
      fill: "rgba(70, 111, 133, 0.06)",
      stroke: "rgba(48, 87, 110, 0.46)",
      text: "rgba(39, 71, 91, 0.78)",
    };
  }
  if (purpose === "harbor") {
    return {
      fill: "rgba(79, 126, 102, 0.08)",
      stroke: "rgba(52, 103, 78, 0.5)",
      text: "rgba(41, 82, 63, 0.8)",
    };
  }
  return {
    fill: "rgba(60, 101, 108, 0.035)",
    stroke: "rgba(49, 88, 96, 0.36)",
    text: "rgba(38, 72, 80, 0.72)",
  };
}

function activityColor(kind: WorldActivity["kind"]): string {
  if (kind === "lesson") return "#a8652f";
  if (kind === "mission") return "#2f6c79";
  return "#4e7b66";
}

function drawObjectSymbol(
  context: CanvasRenderingContext2D,
  object: WorldObject,
  x: number,
  y: number,
): void {
  context.save();
  context.translate(x, y);
  context.strokeStyle = object.kind === "rock" ? "#9a5a46" : "#315d66";
  context.fillStyle = "rgba(255, 252, 235, 0.92)";
  context.lineWidth = 1.2;
  if (object.kind === "rock") {
    context.beginPath();
    context.moveTo(-3, -3);
    context.lineTo(3, 3);
    context.moveTo(3, -3);
    context.lineTo(-3, 3);
    context.stroke();
  } else if (object.kind === "buoy") {
    context.beginPath();
    context.arc(0, 0, 2.4, 0, Math.PI * 2);
    context.fillStyle = buoyVisualSpec(object.buoyMark).chartColor;
    context.fill();
    context.stroke();
  } else if (object.kind === "lighthouse") {
    context.beginPath();
    context.arc(0, 0, 4.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(0, -7);
    context.lineTo(0, 7);
    context.moveTo(-7, 0);
    context.lineTo(7, 0);
    context.stroke();
  } else if (object.kind === "dock") {
    context.fillRect(-3, -3, 6, 6);
    context.strokeRect(-3, -3, 6, 6);
  } else {
    context.rotate(Math.PI / 4);
    context.fillRect(-3, -3, 6, 6);
    context.strokeRect(-3, -3, 6, 6);
  }
  context.restore();
}
