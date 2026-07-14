import "./style.css";
import {
  clamp,
  computeSailAerodynamics,
  createInitialState,
  pointOfSail,
  radiansToDegrees,
  sheetForBoomAngle,
  stepBoat,
  type BoatState,
  type SailDiagnostics,
  type Vec2,
} from "./sim/model";

const canvas = document.querySelector<HTMLCanvasElement>("#lake")!;
if (!canvas) throw new Error("Missing lake canvas");
const context = canvas.getContext("2d")!;
if (!context) throw new Error("Canvas 2D is unavailable");

const elements = {
  pointOfSail: required("#point-of-sail"),
  wind: required("#wind-readout"),
  speed: required("#speed"),
  heel: required("#heel"),
  flow: required("#flow-state"),
  coach: required("#coach"),
  marker: required("#trim-marker"),
  target: required("#trim-target"),
  status: required("#status"),
};

const environment = { trueWind: { x: -8, y: 0 } };
const keys = new Set<string>();
let state = createInitialState();
let diagnostics = computeSailAerodynamics(state, environment);
state.sheet = sheetForBoomAngle(diagnostics.idealBoomAngle);
let previousTime = performance.now();
let accumulator = 0;
const fixedStep = 1 / 60;
const trail: Vec2[] = [];
let lastSpokenState = "";

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyR") reset();
  keys.add(event.code);
}, { passive: false });
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", resize);

resize();
requestAnimationFrame(loop);

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function reset(): void {
  state = createInitialState();
  const initial = computeSailAerodynamics(state, environment);
  state.sheet = sheetForBoomAngle(initial.idealBoomAngle);
  trail.length = 0;
}

function resize(): void {
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
  canvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function loop(time: number): void {
  const frameDelta = Math.min((time - previousTime) / 1_000, 0.1);
  previousTime = time;
  accumulator = Math.min(accumulator + frameDelta, fixedStep * 5);

  while (accumulator >= fixedStep) {
    const rudder =
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"));
    const sheetRate =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"));
    const result = stepBoat(state, { rudder, sheetRate }, environment, fixedStep);
    state = result.state;
    diagnostics = result.sail;
    if (trail.length === 0 || distance(trail.at(-1)!, state.position) > 0.12) {
      trail.push({ ...state.position });
      if (trail.length > 260) trail.shift();
    }
    accumulator -= fixedStep;
  }

  draw(state, diagnostics, time / 1_000);
  updateHud(state, diagnostics);
  requestAnimationFrame(loop);
}

function draw(boat: BoatState, sail: SailDiagnostics, time: number): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#376f82");
  gradient.addColorStop(0.55, "#1a526a");
  gradient.addColorStop(1, "#10384d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  drawWater(width, height, boat, time);
  drawTrail(width, height, boat);
  drawWind(width, height);
  drawBoat(width / 2, height / 2, boat, sail, time);
}

function drawWater(width: number, height: number, boat: BoatState, time: number): void {
  const spacing = 78;
  const offsetX = ((-boat.position.x * 12) % spacing + spacing) % spacing;
  const offsetY = ((boat.position.y * 12) % spacing + spacing) % spacing;
  context.lineWidth = 1;
  for (let y = -spacing + offsetY; y < height + spacing; y += spacing) {
    context.beginPath();
    for (let x = -spacing; x < width + spacing; x += 18) {
      const wave = Math.sin(x * 0.018 + time * 0.65 + y * 0.006) * 5;
      if (x === -spacing) context.moveTo(x + offsetX, y + wave);
      else context.lineTo(x + offsetX, y + wave);
    }
    context.strokeStyle = "rgba(171, 222, 224, 0.11)";
    context.stroke();
  }
}

function drawWind(width: number, height: number): void {
  context.save();
  context.strokeStyle = "rgba(217, 238, 230, 0.23)";
  context.fillStyle = "rgba(217, 238, 230, 0.23)";
  context.lineWidth = 2;
  for (let y = 120; y < height; y += 150) {
    for (let x = 80; x < width; x += 230) {
      context.beginPath();
      context.moveTo(x + 30, y);
      context.lineTo(x - 30, y);
      context.lineTo(x - 20, y - 6);
      context.moveTo(x - 30, y);
      context.lineTo(x - 20, y + 6);
      context.stroke();
    }
  }
  context.restore();
}

function drawTrail(width: number, height: number, boat: BoatState): void {
  if (trail.length < 2) return;
  context.beginPath();
  trail.forEach((point, index) => {
    const x = width / 2 + (point.x - boat.position.x) * 12;
    const y = height / 2 - (point.y - boat.position.y) * 12;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "rgba(217, 238, 230, 0.25)";
  context.lineWidth = 3;
  context.stroke();
}

function drawBoat(
  x: number,
  y: number,
  boat: BoatState,
  sail: SailDiagnostics,
  time: number,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(boat.heading);

  context.fillStyle = "#e9e0c9";
  context.strokeStyle = "#102f40";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, -34);
  context.lineTo(13, 22);
  context.lineTo(7, 34);
  context.lineTo(-7, 34);
  context.lineTo(-13, 22);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#bb5b32";
  context.fillRect(-7, -3, 14, 11);

  const windSide = Math.sign(sail.apparentWindAngle || 1);
  const boomDirection = Math.PI + windSide * sail.boomAngle;
  const mast = { x: 0, y: -7 };
  const boomLength = 39;
  const flutter = sail.luff * Math.sin(time * 17) * 5;
  const clew = {
    x: mast.x + Math.sin(boomDirection) * boomLength,
    y: mast.y - Math.cos(boomDirection) * boomLength,
  };
  context.strokeStyle = sail.stall > 0.55 ? "#b66d3f" : "#f4ebd5";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(mast.x, mast.y);
  const segments = 5;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const offset = Math.sin(time * 20 + index * 1.7) * flutter * (1 - t);
    context.lineTo(
      mast.x + (clew.x - mast.x) * t + Math.cos(boomDirection) * offset,
      mast.y + (clew.y - mast.y) * t + Math.sin(boomDirection) * offset,
    );
  }
  context.stroke();
  context.strokeStyle = "#263f48";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(mast.x, mast.y);
  context.lineTo(clew.x, clew.y);
  context.stroke();
  context.restore();
}

function updateHud(boat: BoatState, sail: SailDiagnostics): void {
  const speedKnots = Math.hypot(boat.velocity.x, boat.velocity.y) * 1.94384;
  const windKnots = sail.apparentWindSpeed * 1.94384;
  const windAngle = Math.round(Math.abs(radiansToDegrees(sail.apparentWindAngle)));
  const flow = sail.luff > 0.55 ? "Luffing" : sail.stall > 0.55 ? "Stalled" : "Attached";
  const coach =
    flow === "Luffing"
      ? "Sheet in or bear away"
      : flow === "Stalled"
        ? "Ease a little"
        : "Hold this trim";
  elements.pointOfSail.textContent = pointOfSail(sail.apparentWindAngle);
  elements.wind.textContent = `${windKnots.toFixed(1)} kn · ${windAngle}°`;
  elements.speed.textContent = speedKnots.toFixed(1);
  elements.heel.textContent = `Heel ${Math.round(Math.abs(radiansToDegrees(boat.heel)))}°`;
  elements.flow.textContent = flow;
  elements.flow.dataset.state = flow.toLowerCase();
  elements.coach.textContent = coach;
  elements.marker.style.left = `${boat.sheet * 100}%`;
  elements.target.style.left = `${sheetForBoomAngle(sail.idealBoomAngle) * 100}%`;
  if (flow !== lastSpokenState) {
    elements.status.textContent = `${flow}. ${coach}.`;
    lastSpokenState = flow;
  }
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
