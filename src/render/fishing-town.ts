import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { shoalDistance, type LakeShoal } from "../game/bathymetry";
import { STONE_QUAY, type WorldObject } from "../game/world-definition";
import { LIGHTHOUSE_BASE, BASTION_ROCK, BASTION_FOOT_ROCKS } from "../game/town-solids";
import { createGroundTexture, setMediterraneanGroundColor } from "./scenery";

const TOWN_LAND_RINGS = 32;
const TOWN_LAND_SEGMENTS = 120;

// Short, offset terrace runs leave the olive slopes connected between blocks.
const TOWN_TERRACES = [
  [19, -22, 26, 48, 4.3], [27, 32, 27, 36, 5.2],
  [55, -31, 30, 46, 11], [84, -42, 27, 45, 17],
  [78, 23, 33, 40, 14], [124, 36, 44, 48, 24],
  [153, -7, 36, 35, 26], [162, 71, 33, 32, 28],
  [68, 77, 32, 34, 10.5], [105, 98, 40, 32, 17],
  [145, 103, 30, 36, 23],
  [6, -2, 32, 96, 4.1], // Keep the existing quay apron below its fixed promenade.
] as const;

const GARDEN_TERRACE_RUNS = [
  [44, 50, 108], [82, 49, 64], [82, 100, 124], [134, 52, 78],
  [64, 105, 133], [112, 116, 147], [166, 117, 152],
] as const;

// Town coordinates are local to the existing Juniper object; the visitor berth
// belongs to world.ts and remains west of every mesh authored here.
export function populateFishingTown(
  group: THREE.Group,
  object: WorldObject,
  shoal: LakeShoal | undefined,
  pineMaterial: THREE.Material,
): void {
  const landform = shoal ?? { id: object.id, x: object.x + 50, z: object.z - 30,
    islandRadius: 105, shelfRadius: 150, scaleX: 1, scaleZ: 1, rotation: 0, irregularity: 0, phase: 0 };
  const town = new THREE.Group();
  town.name = "Mediterranean fishing town";
  group.add(town);
  const palette = {
    walls: [0xf4e4c9, 0xeac48d, 0xe9b395, 0xd3d5bf, 0xe3afa0].map(color => material(color)),
    roof: [0xba6545, 0xcc7850, 0xab553b].map(color => material(color)),
    stone: material(0xd6cbb0), trim: material(0xf3e7cb),
    shadow: material(0x435653), shutter: material(0x52796b), wood: material(0x796044),
    iron: material(0x384b48), cream: material(0xf6e8c5), stripe: material(0xd5ac75),
    foliage: material(0x687b47), cypress: material(0x304f38), red: material(0xad4f3a),
    glass: material(0x739d9e), brass: material(0xae8750),
  };
  const batch = new TownBatches(town);
  const plasterGrain = createPlasterGrain();
  for (const wall of palette.walls) {
    wall.map = plasterGrain;
    wall.bumpMap = plasterGrain;
    wall.bumpScale = 0.025;
    wall.vertexColors = true;
  }
  palette.stone.map = plasterGrain;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wallColors: number[] = [];
  const boxPositions = box.getAttribute("position");
  for (let i = 0; i < boxPositions.count; i++) {
    const shade = 0.91 + (boxPositions.getY(i) + 0.5) * 0.09;
    wallColors.push(shade, shade * 0.995, shade * 0.97);
  }
  box.setAttribute("color", new THREE.Float32BufferAttribute(wallColors, 3));
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const arch = archGeometry(1, 0.17, 0.8);
  const opening = archOpening();
  const hip = hipRoofGeometry();
  const tile = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true, 0, Math.PI);
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const crown = new THREE.SphereGeometry(1, 8, 6);
  const crownPositions = crown.getAttribute("position");
  for (let i = 0; i < crownPositions.count; i++) {
    const x = crownPositions.getX(i), y = crownPositions.getY(i), z = crownPositions.getZ(i);
    const lobe = 1 + Math.sin(x * 7 + z * 4) * 0.22 + Math.cos(y * 8 - x * 3) * 0.16;
    crownPositions.setXYZ(i, x * lobe, y * lobe * 0.78 + x * 0.12, z * lobe);
  }
  crown.computeVertexNormals();
  const rock = new THREE.DodecahedronGeometry(BASTION_ROCK.radius, BASTION_ROCK.detail);
  // Overlapping upright foliage lobes share one buried root and one draw batch.
  const scrubLobes = [[-0.33, 0, 0, 0.62, 1, 0.66], [0.38, -0.05, 0.15, 0.58, 0.95, 0.57]].map(([x, y, z, sx, sy, sz]) => {
    const lobe = new THREE.SphereGeometry(1, 5, 4);
    lobe.scale(sx!, sy!, sz!).translate(x!, y!, z!);
    const vertices = lobe.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) if (vertices.getY(i) < -0.99) vertices.setXYZ(i, 0, -1, 0);
    lobe.computeVertexNormals();
    return lobe;
  });
  const scrub = mergeGeometries(scrubLobes);
  scrubLobes.forEach(lobe => lobe.dispose());
  const identity = new THREE.Matrix4();
  const cube = (name: string, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, parent = identity, rx = 0, ry = 0) =>
    batch.add(name, box, mat, [x, y, z], [w, h, d], parent, [rx, ry, 0]);

  const groundMaterial = material(0xffffff);
  groundMaterial.vertexColors = true;
  groundMaterial.map = createGroundTexture();
  groundMaterial.bumpMap = groundMaterial.map;
  groundMaterial.bumpScale = 0.22;
  const land = new THREE.Mesh(createTownLand(object, landform), groundMaterial);
  land.name = "Continuous harbor hillside";
  land.receiveShadow = true;
  town.add(land);
  // Use the actual triangulated surface for plant roots; the analytic height
  // alone can sit above the coarse triangles at the steep shore and terraces.
  const sampleGround = createTownGroundSampler(land.geometry);
  function groundHeight(x: number, z: number): number {
    return sampleGround(x, z) ?? townLandHeight(x, z, object, landform);
  }

  // Four blocks wrap the quay, a civic square and two garden terraces.
  // Slots are x/z, frontage/depth, wall height and frontage rotation.
  const clusters = [
    { wall: 0, houses: [
      [14, -37, 12, 9, 12.8, 0], [19, -24, 14, 10, 15.8, 0],
      [15, -9, 14, 9, 7, 0], [27, 4, 12, 13, 16.8, -0.16],
      [20, 20, 16, 10, 9.6, 0], [30, 36, 14, 11, 6.6, 0.2],
      [18, 48, 10, 8, 13.8, 0.12], [39, -38, 8, 10, 14, -0.1],
    ] },
    { wall: 1, houses: [
      [52, -48, 12, 10, 10, 0], [59, -32, 15, 11, 8, 0.16],
      [49, -14, 10, 10, 13, 0], [78, -57, 9, 12, 15, -0.3],
      [85, -40, 16, 10, 9, 0], [92, -21, 10, 13, 12, 0.22],
      [72, 15, 13, 11, 10, -0.15], [84, 33, 11, 13, 14, 0.25],
    ] },
    { wall: 2, houses: [
      [113, 4, 9, 12, 16, -0.28], [134, -15, 15, 11, 10, 0.1],
      [155, -7, 8, 12, 14, 0], [173, 8, 12, 10, 9, 0.3],
      [161, 68, 15, 11, 10, -0.2], [144, 81, 10, 9, 12, 0.15],
      [113, 70, 12, 10, 8, -0.3],
    ] },
    { wall: 4, houses: [
      [57, 70, 10, 9, 8, -0.22], [71, 85, 14, 11, 10, 0.18],
      [88, 70, 8, 10, 15, 0], [94, 101, 12, 9, 8, -0.3],
      [112, 92, 14, 10, 10, 0.15], [132, 112, 8, 12, 13, 0.35],
      [149, 100, 13, 10, 7, -0.2],
    ] },
  ];
  // Quay-facing homes and shops share footprints, but not a repeated elevation.
  const waterfrontFacades = [
    { floors: 2, bays: [-0.27, 0.23], door: 0, balcony: 1, plainBays: [0], roofRise: 2.3, crossRoof: false, awning: 0, awningCenter: 0 },
    { floors: 3, bays: [-0.29, 0, 0.29], door: 0, balcony: 1, plainBays: [2], roofRise: 1.4, crossRoof: true, awning: 0.46, awningCenter: -0.23 },
    { floors: 1, bays: [-0.28, 0.28], door: 1, balcony: -1, plainBays: [0], roofRise: 1.2, crossRoof: false, awning: 0.82, awningCenter: 0 },
    { floors: 3, bays: [-0.24, 0.24], door: 0, balcony: 1, plainBays: [], roofRise: 3.2, crossRoof: true, awning: 0, awningCenter: 0 },
    { floors: 2, bays: [-0.3, 0, 0.3], door: 1, balcony: 0, plainBays: [2], roofRise: 2, crossRoof: false, awning: 0.42, awningCenter: 0.24 },
    { floors: 1, bays: [-0.3, 0, 0.3], door: 0, balcony: -1, plainBays: [1, 2], roofRise: 1.35, crossRoof: false, awning: 0.86, awningCenter: 0 },
    { floors: 3, bays: [-0.25, 0.25], door: 1, balcony: 0, plainBays: [1], roofRise: 3.1, crossRoof: true, awning: 0, awningCenter: 0 },
  ];
  let houseIndex = 0;
  clusters.forEach((cluster, block) => {
    for (const [x, z, width, depth, height, turn] of cluster.houses) {
      addHouse(x!, z!, width!, depth!, height!, houseIndex++, block, cluster.wall, turn!);
    }
  });

  for (const [x, z0, z1] of GARDEN_TERRACE_RUNS) {
    for (let z = z0; z < z1; z += 5) {
      const end = Math.min(z + 5, z1);
      const middle = (z + end) / 2;
      const edgeX = x + Math.sin((middle - z0) / (z1 - z0) * Math.PI) * 1.8;
      const low = Math.min(groundHeight(edgeX - 2, z), groundHeight(edgeX - 2, end));
      const high = Math.max(groundHeight(edgeX + 2, z), groundHeight(edgeX + 2, end));
      const bottom = low - 0.24;
      if (low < 1.5) continue;
      const top = Math.max(high, bottom + 1.55) + 0.1;
      cube("Garden retaining walls", palette.stone, edgeX, (bottom + top) / 2, middle, 0.8, top - bottom, end - z + 0.16);
      cube("Garden wall coping", palette.trim, edgeX, top, middle, 1.1, 0.2, end - z + 0.24);
      const bedX = edgeX + 3.3;
      const bedY = groundHeight(bedX, middle);
      batch.add("Terraced herb beds", scrub, palette.foliage, [bedX, bedY + 0.42, middle], [2.4, 0.42, 2.1]);
    }
  }

  for (const [x0, z0, x1, z1] of [[29, 7, 63, 7], [66, -6, 91, 7], [96, 36, 122, 36], [153, 89, 181, 89]]) {
    const run = Math.hypot(x1! - x0!, z1! - z0!);
    for (let step = 0; step < 12; step++) {
      const t = (step + 0.5) / 12;
      const x = THREE.MathUtils.lerp(x0!, x1!, t);
      const z = THREE.MathUtils.lerp(z0!, z1!, t);
      cube("Street stair treads", palette.trim, x, groundHeight(x, z) + 0.06, z, run / 12 + 0.2, 0.42, 3.6, identity, 0, -Math.atan2(z1! - z0!, x1! - x0!));
    }
  }

  function foundation(x: number, z: number, width: number, depth: number, turn: number): THREE.Matrix4 {
    const frame = new THREE.Matrix4().makeRotationY(turn);
    frame.setPosition(x, 0, z);
    const contacts: number[] = [];
    for (const dx of [-width / 2, 0, width / 2]) for (const dz of [-depth / 2, 0, depth / 2]) {
      const point = new THREE.Vector3(dx, 0, dz).applyMatrix4(frame);
      contacts.push(groundHeight(point.x, point.z));
    }
    const top = Math.max(4.3, Math.max(...contacts) + 0.16);
    const bottom = Math.min(...contacts) - 0.65;
    cube("Terrace foundations", palette.stone, 0, (top + bottom) / 2, 0, width, top - bottom, depth, frame);
    cube("Limestone promenade", palette.trim, 0, top - 0.1, 0, width + 0.15, 0.2, depth + 0.15, frame);
    frame.setPosition(x, top, z);
    return frame;
  }

  function addHouse(x: number, z: number, width: number, depth: number, height: number, index: number, block: number, wallIndex: number, turn: number): void {
    const frame = foundation(x, z, width + 1.4, depth + 3.8, Math.PI / 2 + turn);
    const frontage = waterfrontFacades[index];
    const colorOffset = index % 4 === 0 ? 1 : index % 5 === 1 ? 2 : 0;
    const wall = palette.walls[(wallIndex + colorOffset) % palette.walls.length]!;
    cube("Stucco houses", wall, 0, height / 2, 0, width, height, depth, frame);
    cube("Facade plinths", palette.stone, 0, 0.45, -depth / 2 - 0.09, width + 0.15, 0.9, 0.25, frame);
    cube("Cornices", palette.trim, 0, height - 0.15, 0, width + 0.55, 0.32, depth + 0.5, frame);
    cube("Cornice shadow lines", palette.stone, 0, height - 0.45, -depth / 2 - 0.11, width + 0.3, 0.13, 0.24, frame);
    const roofRise = frontage?.roofRise ?? (width < 10 ? 3.3 : 1.9 + index % 3 * 0.45);
    const crossRoof = frontage?.crossRoof ?? index % 4 === 1;
    const roofFrame = crossRoof ? frame.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)) : frame;
    addRoof(roofFrame, (crossRoof ? depth : width) + 1.2, (crossRoof ? width : depth) + 1.2, height, roofRise, index);
    const chimneyX = width * (index % 2 ? -0.29 : 0.25);
    cube("Chimneys", wall, chimneyX, height + roofRise + 1.35, 1.6, 1, 2.5, 1.1, frame);
    cube("Chimney caps", palette.trim, chimneyX, height + roofRise + 2.65, 1.6, 1.35, 0.25, 1.4, frame);
    const floors = frontage?.floors ?? THREE.MathUtils.clamp(Math.floor((height - 4.5) / 4.25) + 1, 1, 4);
    const floorRise = frontage && floors > 1 ? (height - 5) / (floors - 1) : 4.25;
    for (let floor = 0; floor < floors; floor++) {
      const wy = 3 + floor * floorRise;
      const columns = frontage?.bays ?? [-0.28, 0, 0.28];
      for (const [column, col] of columns.entries()) {
        if (!frontage && width < 11 && floor > 0 && column === 1) continue;
        const wx = col * width;
        if (floor === 0 && column === (frontage?.door ?? 1)) {
          batch.add("Arched door recesses", opening, palette.shadow, [wx, 1.6, -depth / 2 - 0.02], [1.15, 1.5, 1], frame);
          batch.add("Carved door surrounds", arch, palette.trim, [wx, 1.6, -depth / 2 - 0.18], [1.15, 1.5, 0.7], frame);
          cube("Door timber", palette.wood, wx, 1.1, -depth / 2 - 0.05, 1.7, 2, 0.14, frame);
          continue;
        }
        if (!frontage && floor > 0 && column !== 1 && (index + floor + column - 1) % 5 === 0) continue;
        addWindow(frame, wx, wy, -depth / 2 - 0.06, index,
          frontage ? floor === 1 && column === frontage.balcony : floor > 0 && column === 1 && block < 3 && (index + floor) % 3 !== 1,
          frontage?.plainBays.includes(column) ? "plain" : "shuttered");
      }
    }
    // Side facades remain finished when the boat rounds the harbor.
    for (const side of [-1, 1]) {
      const sideFrame = frame.clone().multiply(new THREE.Matrix4().makeTranslation(side * width / 2, 0, 0))
        .multiply(new THREE.Matrix4().makeRotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2));
      for (let floor = 0; floor < floors; floor++) {
        for (const wx of [-depth * 0.24, depth * 0.24]) addWindow(sideFrame, wx, 3 + floor * floorRise, -0.04, index, false);
      }
    }
    const backFrame = frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, depth / 2))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    for (let floor = 0; floor < floors; floor++) {
      for (const wx of [-width * 0.24, width * 0.24]) addWindow(backFrame, wx, 3 + floor * floorRise, -0.04, index, false);
    }
    const awningWidth = frontage?.awning ?? (((block === 0 && index % 3 !== 1) || (block === 1 && index % 4 === 0)) ? 0.86 : 0);
    if (awningWidth > 0) {
      const aw = width * awningWidth;
      const awningX = width * (frontage?.awningCenter ?? 0);
      const canopyZ = -depth / 2 - 2.2;
      const stripes = index % 2 ? 8 : 10;
      for (let stripe = 0; stripe < stripes; stripe++) {
        const sx = awningX - aw / 2 + aw * (stripe + 0.5) / stripes;
        cube("Striped canvas awnings", stripe % 2 ? palette.cream : palette.stripe, sx, 3.65, canopyZ, aw / stripes, 0.09, 3.9, frame, -0.16);
        cube("Awning valances", stripe % 2 ? palette.cream : palette.stripe, sx, 3.14, canopyZ - 1.92, aw / stripes, 0.48, 0.08, frame);
      }
      for (const side of [-1, 1]) cube("Awning posts", palette.iron, awningX + side * aw * 0.46, 1.7, canopyZ - 1.7, 0.09, 3.4, 0.09, frame);
      for (const tx of frontage ? (aw > 7 ? [awningX - aw * 0.27, awningX + aw * 0.27] : [awningX]) : [-3.5, 3.5]) {
        batch.add("Cafe tabletops", cylinder, palette.wood, [tx, 1.2, canopyZ], [1.6, 0.16, 1.6], frame);
        cube("Cafe table stems", palette.iron, tx, 0.62, canopyZ, 0.12, 1.1, 0.12, frame);
        for (const side of [-1, 1]) {
          cube("Cafe seats", palette.wood, tx + side * 1.2, 0.62, canopyZ, 0.72, 0.14, 0.72, frame);
          cube("Cafe chair backs", palette.wood, tx + side * 1.45, 1.05, canopyZ, 0.12, 0.85, 0.72, frame);
          for (const dz of [-0.25, 0.25]) cube("Cafe chair legs", palette.iron, tx + side * 1.2, 0.3, canopyZ + dz, 0.1, 0.6, 0.1, frame);
        }
      }
    }
  }

  function addWindow(frame: THREE.Matrix4, x: number, y: number, z: number, index: number, balcony: boolean, style: "plain" | "shuttered" = "shuttered"): void {
    cube("Window stone surrounds", palette.trim, x, y, z, 1.95, 2.8, 0.24, frame);
    cube("Recessed windows", palette.shadow, x, y, z - 0.135, 1.5, 2.35, 0.025, frame);
    cube("Window mullions", palette.wood, x, y, z - 0.16, 0.07, 2.35, 0.06, frame);
    cube("Window transoms", palette.wood, x, y + 0.18, z - 0.16, 1.5, 0.07, 0.06, frame);
    cube("Window sills", palette.trim, x, y - 1.39, z - 0.12, 2.2, 0.19, 0.5, frame);
    if (style === "shuttered") for (const side of [-1, 1]) {
      const shutter = index % 4 === 2 ? palette.wood : palette.shutter;
      cube("Timber shutters", shutter, x + side * 1.22, y, z - 0.13, 0.68, 2.4, 0.17, frame, 0, side * 0.14);
      for (const l of [-0.8, 0, 0.8]) cube("Shutter louvers", palette.shadow, x + side * 1.22, y + l, z - 0.245, 0.52, 0.055, 0.045, frame);
    }
    if (balcony) {
      cube("Balcony slabs", palette.trim, x, y - 1.58, z - 0.65, 3.6, 0.26, 1.6, frame);
      cube("Balcony handrails", palette.iron, x, y - 0.35, z - 1.38, 3.6, 0.09, 0.09, frame);
      for (let b = 0; b < 8; b++) cube("Balcony balusters", palette.iron, x - 1.72 + b * 0.49, y - 0.97, z - 1.38, 0.065, 1.24, 0.065, frame);
      for (const side of [-1, 1]) {
        cube("Balcony return rails", palette.iron, x + side * 1.74, y - 0.35, z - 0.69, 0.08, 0.09, 1.4, frame);
        cube("Balcony brackets", palette.stone, x + side * 1.15, y - 1.88, z - 0.42, 0.26, 0.5, 0.8, frame);
      }
      cube("Flower boxes", palette.roof[0]!, x + 0.5, y - 0.55, z - 1.47, 1.3, 0.4, 0.4, frame);
      batch.add("Balcony greenery", sphere, palette.foliage, [x + 0.5, y - 0.22, z - 1.45], [0.85, 0.36, 0.4], frame);
    }
  }

  function addRoof(frame: THREE.Matrix4, w: number, d: number, y: number, rise: number, index: number): void {
    batch.add("Terracotta hip roofs", hip, palette.roof[index % 3]!, [0, y, 0], [w, rise, d], frame);
    // Half-round clay channels follow each roof pitch, including the hipped ends.
    for (const side of [-1, 1]) {
      for (let x = -w / 2 + 0.22; x < w / 2 - 0.12; x += 0.62) {
        const hipFactor = Math.min(1, (w / 2 - Math.abs(x)) / (w * 0.2));
        const run = d / 2 * hipFactor;
        const lift = rise * hipFactor;
        const length = Math.hypot(run, lift);
        const steps = Math.max(1, Math.ceil(length / 1.25));
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps;
          batch.add("Individual clay tiles", tile, palette.roof[(index + s + Math.floor(x + w)) % 3]!,
            [x, y + lift * t + 0.045, side * (d / 2 - run * t)],
            [0.31, length / steps + 0.1, 0.31], frame, [-side * Math.atan2(run, lift), 0, 0]);
        }
      }
    }
    batch.add("Roof ridge caps", cylinder, palette.roof[1]!, [0, y + rise + 0.05, 0], [0.34, w * 0.6, 0.34], frame, [0, 0, Math.PI / 2]);
  }

  // Campanile: actual open belfry, four corner piers and four masonry arches.
  const churchFrame = foundation(142, 40, 15, 20, Math.PI / 2);
  cube("Church nave", palette.walls[3]!, 0, 6.6, 0, 12, 13.2, 16, churchFrame);
  addRoof(churchFrame, 13.2, 17.2, 13.2, 4, 0);
  batch.add("Church portal", opening, palette.shadow, [0, 2.8, -8.02], [1.5, 2.2, 1], churchFrame);
  batch.add("Church portal surround", arch, palette.trim, [0, 2.8, -8.25], [1.5, 2.2, 1], churchFrame);
  batch.add("Church rose window", new THREE.TorusGeometry(1.3, 0.22, 8, 20), palette.trim, [0, 10.1, -8.13], [1, 1, 1], churchFrame);
  const towerFrame = foundation(124, 46, 11, 13, 0);
  cube("Campanile shaft", palette.walls[0]!, 0, 12.6, 0, 7.4, 25.2, 7.4, towerFrame);
  for (const y of [0.5, 16, 23.6, 31.2]) cube("Campanile cornices", palette.trim, 0, y, 0, 8.1, 0.5, 8.1, towerFrame);
  for (const x of [-3.15, 3.15]) for (const z of [-3.15, 3.15]) {
    cube("Belfry corner piers", palette.walls[0]!, x, 27.9, z, 1.1, 6.5, 1.1, towerFrame);
    cube("Campanile pilasters", palette.trim, x, 12, z, 0.6, 23, 0.6, towerFrame);
  }
  for (let side = 0; side < 4; side++) {
    const face = towerFrame.clone().multiply(new THREE.Matrix4().makeRotationY(side * Math.PI / 2));
    batch.add("Open belfry arches", arch, palette.trim, [0, 28, -3.15], [2.55, 2.55, 2], face);
    cube("Belfry lintels", palette.walls[0]!, 0, 30.9, -3.15, 5.3, 0.6, 1.1, face);
    batch.add("Campanile lancets", opening, palette.shadow, [0, 20, -3.72], [0.58, 1.3, 1], face);
    batch.add("Lancet surrounds", arch, palette.trim, [0, 20, -3.81], [0.6, 1.3, 0.8], face);
    cube("Clock face stone", palette.trim, 0, 13.4, -3.75, 2.5, 2.5, 0.12, face);
    cube("Clock hands", palette.iron, 0, 13.8, -3.83, 0.1, 0.95, 0.06, face);
    cube("Clock hands", palette.iron, 0.35, 13.35, -3.84, 0.8, 0.1, 0.06, face);
  }
  const bell = new THREE.LatheGeometry([new THREE.Vector2(0.8, -0.8), new THREE.Vector2(0.72, -0.55), new THREE.Vector2(0.42, 0.35), new THREE.Vector2(0.18, 0.65)], 16);
  batch.add("Bronze harbor bell", bell, palette.brass, [0, 28.6, 0], [1, 1, 1], towerFrame);
  cube("Bell suspension", palette.wood, 0, 29.8, 0, 5, 0.3, 0.3, towerFrame);
  batch.add("Campanile dome", new THREE.SphereGeometry(3.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), palette.roof[0]!, [0, 31.6, 0], [1, 1.2, 1], towerFrame);
  batch.add("Campanile finial", cylinder, palette.brass, [0, 36.4, 0], [0.18, 1.7, 0.18], towerFrame);

  // Stone quay and five fingers retain the original footprint and spacing.
  cube("Terrace foundations", palette.stone, 6, -0.2, -2, 12, 8.8, 82);
  cube("Limestone promenade", palette.trim, 6, 4.1, -2, 12, 0.2, 82);
  cube("Stone quay", palette.stone, STONE_QUAY.x, STONE_QUAY.y, STONE_QUAY.z, STONE_QUAY.width, STONE_QUAY.height, STONE_QUAY.depth);
  cube("Quay coping", palette.trim, -5, 3.22, -2, 11.2, 0.24, 82);
  for (let course = 0; course < 4; course++) {
    for (let z = -42; z < 39; z += 3.9) cube("Quay masonry blocks", (Math.floor(z) + course) % 3 ? palette.stone : palette.trim,
      -10.58, 0.35 + course * 0.74, z + (course % 2) * 1.5, 0.18, 0.66, 3.7);
  }
  for (const z of [-34, -18, -2, 14, 30]) {
    cube("Timber pier decks", palette.wood, -20, 1.35, z, 28, 0.6, 2.8);
    for (let x = -33.7; x < -6; x += 0.85) cube("Pier plank seams", palette.shadow, x, 1.66, z, 0.035, 0.025, 2.8);
    for (const x of [-32, -18, -8]) batch.add("Pier pilings", cylinder, palette.wood, [x, -0.4, z], [0.58, 4.6, 0.58]);
  }
  for (const z of [-37, -21, -5, 11, 27, 37]) {
    batch.add("Quay bollards", cylinder, palette.iron, [-8, 3.64, z], [0.46, 0.7, 0.46]);
    cube("Bollard caps", palette.iron, -8, 3.97, z, 0.8, 0.12, 0.36);
  }
  const rope = new THREE.TorusGeometry(0.53, 0.065, 5, 16);
  for (const z of [-30, 2, 33]) {
    batch.add("Coiled mooring ropes", rope, palette.stripe, [-6, 3.42, z], [1, 1, 1], identity, [Math.PI / 2, 0, 0]);
    cube("Harbor crates", palette.wood, -1, 3.95, z + 2, 1.4, 1.4, 1.4);
    for (const h of [3.6, 4.2]) cube("Crate battens", palette.stripe, -1.72, h, z + 2, 0.08, 0.12, 1.4);
  }
  for (const z of [-35, -5, 25]) {
    batch.add("Quayside lamps", cylinder, palette.iron, [-4, 5.5, z], [0.14, 4.5, 0.14]);
    cube("Lantern frames", palette.iron, -4, 7.9, z, 0.65, 0.8, 0.65);
    cube("Lantern glazing", palette.cream, -4.01, 7.92, z, 0.52, 0.62, 0.52);
    batch.add("Lantern caps", hip, palette.iron, [-4, 8.31, z], [0.8, 0.3, 0.8]);
  }

  // The small light stands on the existing southern shore shelf, not in the channel.
  const light = new THREE.Matrix4().makeTranslation(LIGHTHOUSE_BASE.x, 0, LIGHTHOUSE_BASE.z);
  cube("Lighthouse bastion", palette.stone, 0, LIGHTHOUSE_BASE.y, 0,
    LIGHTHOUSE_BASE.width, LIGHTHOUSE_BASE.height, LIGHTHOUSE_BASE.depth, light);
  cube("Bastion coping", palette.trim, 0, 4.8, 0, 9.5, 0.4, 9.5, light);
  batch.add("Lighthouse tapered shaft", new THREE.CylinderGeometry(1.55, 2.25, 15.6, 20), palette.trim, [0, 12.8, 0], [1, 1, 1], light);
  for (const y of [14, 18.3]) {
    const radius = 2.25 - (y - 5) / 15.6 * 0.7;
    batch.add("Lighthouse red bands", new THREE.CylinderGeometry(radius - 0.03, radius + 0.06, 1.5, 20), palette.red, [0, y, 0], [1, 1, 1], light);
  }
  batch.add("Lighthouse gallery", cylinder, palette.trim, [0, 21, 0], [4.4, 0.5, 4.4], light);
  batch.add("Lighthouse lantern glass", cylinder, palette.glass, [0, 22.3, 0], [2.8, 2, 2.8], light);
  for (let side = 0; side < 10; side++) {
    const angle = side / 10 * Math.PI * 2;
    cube("Lighthouse gallery rails", palette.iron, Math.cos(angle) * 2, 21.8, Math.sin(angle) * 2, 0.07, 1.15, 0.07, light);
    cube("Lighthouse lantern mullions", palette.iron, Math.cos(angle) * 1.4, 22.3, Math.sin(angle) * 1.4, 0.07, 2, 0.07, light);
  }
  batch.add("Lighthouse gallery handrail", new THREE.TorusGeometry(2, 0.07, 5, 20), palette.iron, [0, 22.35, 0], [1, 1, 1], light, [Math.PI / 2, 0, 0]);
  batch.add("Lighthouse red cap", new THREE.ConeGeometry(1.9, 1.5, 20), palette.red, [0, 24, 0], [1, 1, 1], light);
  batch.add("Lighthouse finial", cylinder, palette.iron, [0, 25.25, 0], [0.12, 1.2, 0.12], light);
  batch.add("Lighthouse doorway", opening, palette.shadow, [0, 6.9, -2.12], [0.6, 1.15, 1], light);
  for (const footRock of BASTION_FOOT_ROCKS) {
    batch.add("Bastion foot rocks", rock, palette.stone, [...footRock.position], [...footRock.scale], identity, [0, footRock.rotation, 0]);
  }

  const cypress = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.43, 0.6), new THREE.Vector2(0.7, 1.5),
    new THREE.Vector2(0.87, 2.4), new THREE.Vector2(0.96, 3.3), new THREE.Vector2(0.93, 4.3),
    new THREE.Vector2(0.85, 5.2), new THREE.Vector2(0.74, 6.3), new THREE.Vector2(0.61, 7.3),
    new THREE.Vector2(0.46, 8.3), new THREE.Vector2(0.32, 9.2), new THREE.Vector2(0.16, 10.5),
    new THREE.Vector2(0, 12),
  ], 8);
  const cypressPositions = cypress.getAttribute("position");
  for (let i = 0; i < cypressPositions.count; i++) {
    const x = cypressPositions.getX(i), y = cypressPositions.getY(i), z = cypressPositions.getZ(i);
    const branch = 1 + Math.sin(x * 3 + z * 5 + y * 0.45) * 0.035;
    cypressPositions.setXYZ(i, x * branch + Math.sin(y * 0.28) * y * 0.015, y, z * branch);
  }
  cypress.computeVertexNormals();
  const trees = [[34, -54], [39, 52], [63, -63], [62, 40], [100, -51], [107, 43], [152, 25], [165, 48]];
  trees.forEach(([x, z], i) => {
    batch.add("Harbor cypresses", cypress, palette.cypress, [x!, groundHeight(x!, z!) - 0.3, z!], [1.3, 1.2 + i % 3 * 0.14, 1.3], identity, [0, i * 2.39996, 0]);
  });
  const centerX = (shoal?.x ?? object.x + 50) - object.x;
  const centerZ = (shoal?.z ?? object.z - 30) - object.z;
  const groveOffsets = [
    [-0.56, 0.64], [-0.32, 0.67], [-0.17, 0.73], [-0.06, 0.61],
    [0.11, 0.49], [0.04, 0.75], [-0.22, 0.34], [-0.49, 0.46],
    [-0.69, 0.52], [-0.57, 0.63], [-0.37, 0.69], [-0.57, -0.34], [-0.59, 0.27],
  ] as const;
  const islandRadius = shoal?.islandRadius ?? 105;
  const islandScaleX = shoal?.scaleX ?? 1;
  const islandScaleZ = shoal?.scaleZ ?? 1;
  for (let i = 0; i < groveOffsets.length * 20; i++) {
    const groveIndex = Math.floor(i / 20);
    const [groveX, groveZ] = groveOffsets[groveIndex]!;
    const localIndex = i % 20;
    const a = localIndex * 2.39996 + groveIndex * 0.71;
    const r = 6 + Math.sqrt((localIndex + 0.5) / 20) * (groveIndex === 12 ? 10 : groveIndex < 2 || groveIndex >= 7 ? 18 : 36);
    const x = centerX + groveX * islandRadius * islandScaleX + Math.cos(a) * r * islandScaleX;
    const z = centerZ + groveZ * islandRadius * islandScaleZ + Math.sin(a) * r * islandScaleZ;
    if (x < 16 || (x < 190 && Math.abs(z) < 70 && groveIndex < 8)) continue;
    if (clusters.some(cluster => cluster.houses.some(([hx, hz, width, depth]) =>
      Math.abs(x - hx!) < depth! / 2 + 4 && Math.abs(z - hz!) < width! / 2 + 4,
    ))) continue;
    if (Math.abs(x - 124) < 9 && Math.abs(z - 46) < 10) continue;
    if (Math.abs(x - 142) < 14 && Math.abs(z - 40) < 13) continue;
    const y = groundHeight(x, z);
    if (y < 2) continue;
    if (i % 4 === 0) {
      batch.add("Hillside limestone outcrops", rock, palette.stone, [x, y - 1.1, z], [6 + i % 5, 2.3, 4], identity, [0.1, a, 0.12]);
      const scrubX = x - 5;
      const scrubZ = z + 18;
      const scrubY = groundHeight(scrubX, scrubZ);
      if (scrubY >= 2) batch.add("Hillside scrub", scrub, palette.foliage,
        [scrubX, scrubY + 0.35, scrubZ], [4.3, 3.4, 3.7], identity, [0, a, 0]);
    } else if (i % 3 === 0) batch.add("Hillside cypresses", cypress, palette.cypress, [x, y - 0.3, z], [1.6, 1 + i % 4 * 0.18, 1.6], identity, [0, a, 0]);
    else {
      batch.add("Olive trunks", cylinder, palette.wood, [x, y + 1.95, z], [0.65, 4.5, 0.65]);
      for (const [ox, oy, oz, tilt] of [[-1.6, 2.5, 0, -0.36], [1.4, 2.4, -0.9, 0.3]]) {
        batch.add("Olive branches", box, palette.wood, [x + ox! * 0.48, y + oy!, z + oz! * 0.48], [0.19, 2.5, 0.19], identity, [0, 0, tilt!]);
      }
      for (const [ox, oy, oz] of [[-2, 0, 0], [1.7, 0.15, -1.1], [0.25, 0.8, 1.8]]) {
        batch.add("Olive canopies", crown, i % 2 ? palette.foliage : pineMaterial,
          [x + ox!, y + 4.35 + oy!, z + oz!], [2.5 + i % 3 * 0.3, 2.1 + (i % 3) * 0.3, 2.4], identity, [0, a + oy! * 2, ox! * 0.09]);
      }
    }
    if (localIndex % 5 === 2 && i % 4 !== 0) {
      const scrubX = x - 8;
      const scrubZ = z + 28 + Math.cos(a) * 6;
      const scrubY = groundHeight(scrubX, scrubZ);
      if (scrubY >= 2) batch.add("Hillside scrub", scrub, palette.foliage,
        [scrubX, scrubY + 0.65, scrubZ], [4.8, 3.8, 4.1], identity, [0, a, 0]);
    }
  }
  // Keep the planted bank connected on the narrower physical coast, extending inland.
  for (let row = 0; row < 8; row++) for (let column = 0; column < 21; column++) {
    const x = 38 + column * 9 + Math.sin(row * 1.9 + column) * 2;
    const z = 63 + row * 10 + Math.sin(column * 0.65) * 5;
    if (clusters.some(cluster => cluster.houses.some(([hx, hz, width, depth]) =>
      Math.abs(x - hx!) < depth! / 2 + 5 && Math.abs(z - hz!) < width! / 2 + 5,
    ))) continue;
    if (x > 145 && x < 190 && Math.abs(z - 89) < 5) continue;
    const y = groundHeight(x, z);
    if (y < 2.4) continue;
    const size = 2.4 + (1 + Math.sin(x * 0.17 + z * 0.31)) * 1.2;
    const height = 0.85 + (1 + Math.sin(x * 0.41 - z * 0.23)) * 0.5;
    batch.add("Bank maquis", scrub, palette.foliage, [x, y + height - 0.35, z], [size * 0.75, height, size * 0.65], identity, [0, x + z, 0]);
    // Reuse the outcrop batch for a broken, planted bank rather than a continuous stone rim.
    if ((row * 21 + column) % 4 === 1) {
      batch.add("Hillside limestone outcrops", rock, palette.stone, [x, y - 0.45, z],
        [size * 0.55, 0.8 + column % 3 * 0.15, size * 0.42], identity, [0, x + z, 0]);
    }
  }
  // Original mooring positions: decoration remains behind the same pier envelope.
  const boatHull = skiffGeometry();
  for (const [i, p] of [[-24, -27], [-24, 5], [-25, 22], [-18, 47]].entries()) {
    const frame = new THREE.Matrix4().makeRotationY(Math.PI / 2 + (i - 1) * 0.025);
    frame.setPosition(p[0]!, 0.15, p[1]!);
    batch.add("Moored fishing skiffs", boatHull, i % 2 ? palette.shutter : palette.trim, [0, 0, 0], [1, 1, 1], frame);
    cube("Skiff interiors", palette.wood, 0, 0.53, 0, 5, 0.13, 1.4, frame);
    for (const x of [-1.6, 0, 1.6]) cube("Skiff thwarts", palette.stripe, x, 0.77, 0, 0.36, 0.13, 1.65, frame);
    const mastHeight = 4.4 + i * 0.75;
    cube("Skiff masts", palette.wood, -0.6, 0.1 + mastHeight / 2, 0, 0.1, mastHeight, 0.1, frame);
    cube("Skiff gunwales", palette.wood, 0, 0.95, -0.88, 4.9, 0.12, 0.13, frame);
    cube("Skiff gunwales", palette.wood, 0, 0.95, 0.88, 4.9, 0.12, 0.13, frame);
  }
  batch.finish();
}

function material(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.87 });
}

function createPlasterGrain(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  let seed = 1947;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = i % size;
    const y = Math.floor(i / size);
    const shade = Math.round(246 + (seed >>> 24) % 5 + Math.sin(x * 0.25) * Math.cos(y * 0.19) * 4);
    data.set([shade, shade, shade, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// One draw per repeated geometry/material pair; detail does not create thousands
// of individual Object3Ds. Instances keep their semantic names for raycast tests.
class TownBatches {
  private readonly batches = new Map<string, { name: string; geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
  private readonly transform = new THREE.Object3D();
  constructor(private readonly root: THREE.Group) {}
  add(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, position: [number, number, number], scale: [number, number, number], parent = new THREE.Matrix4(), rotation: [number, number, number] = [0, 0, 0]): void {
    const key = `${name}/${geometry.id}/${mat.uuid}`;
    let entry = this.batches.get(key);
    if (!entry) {
      entry = { name, geometry, material: mat, matrices: [] };
      this.batches.set(key, entry);
    }
    this.transform.position.fromArray(position);
    this.transform.scale.fromArray(scale);
    this.transform.rotation.set(...rotation);
    this.transform.updateMatrix();
    entry.matrices.push(new THREE.Matrix4().multiplyMatrices(parent, this.transform.matrix));
  }
  finish(): void {
    for (const entry of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(entry.geometry, entry.material, entry.matrices.length);
      mesh.name = entry.name;
      entry.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
  }
}

function townLandHeight(x: number, z: number, object: WorldObject, shoal: LakeShoal): number {
  const heading = object.heading ?? 0;
  const distance = shoalDistance(shoal,
    object.x + x * Math.cos(heading) + z * Math.sin(heading),
    object.z - x * Math.sin(heading) + z * Math.cos(heading));
  // Inset the zero-height ring so its straight chords stay inside the physical coast.
  const shore = shoal.islandRadius - 1;
  if (distance >= shore) return -12 * THREE.MathUtils.smootherstep(distance, shoal.islandRadius, shoal.shelfRadius);
  let height = 4.1;
  height += THREE.MathUtils.smoothstep(x - 7 * Math.sin(z * 0.045), 30, 48) * 7;
  height += THREE.MathUtils.smoothstep(x + 12 * Math.sin(z * 0.034), 72, 98) * 8;
  height += THREE.MathUtils.smoothstep(x - 14 * Math.sin(z * 0.037), 120, 152) * 8;
  const inland = 1 - THREE.MathUtils.smoothstep(z, 25, 125);
  height += THREE.MathUtils.smoothstep(x, 188, 320) * (8 + inland * 10);
  const hillside = THREE.MathUtils.smoothstep(x, 185, 250);
  height += hillside * (Math.sin(z * 0.027 + x * 0.012) * 2.8 + Math.sin(z * 0.061 - x * 0.021) * 1.2);
  for (const [tx, tz, depth, width, top] of TOWN_TERRACES) {
    const edge = Math.max(Math.abs(x - tx) - depth / 2, Math.abs(z - tz) - width / 2);
    height = THREE.MathUtils.lerp(height, top, 1 - THREE.MathUtils.smoothstep(edge, -2, 11));
  }
  const surface = height * (1 - THREE.MathUtils.smoothstep(distance / shore, 0.84, 1));
  const gardenBank = THREE.MathUtils.smoothstep(x, 35, 60)
    * (1 - THREE.MathUtils.smoothstep(x, 160, 210)) * THREE.MathUtils.smoothstep(z, 55, 80)
    * THREE.MathUtils.smoothstep(surface, 1.5, 4);
  const tier = (surface - 1.5) / 4;
  const fraction = tier - Math.floor(tier);
  const terrace = 1.5 + Math.floor(tier) * 4 + Math.min(fraction, THREE.MathUtils.smoothstep(fraction, 0.62, 1)) * 4;
  return THREE.MathUtils.lerp(surface, terrace, gardenBank);
}

// Local-space lookup for createTownLand's fixed ring/sector topology.
export function createTownGroundSampler(geometry: THREE.BufferGeometry): (x: number, z: number) => number | undefined {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex()!;
  const point = new THREE.Vector2();
  const sectors = Array.from({ length: TOWN_LAND_SEGMENTS }, (_, segment) => {
    const bounds = new THREE.Box2();
    const cells = Array.from({ length: TOWN_LAND_RINGS }, (_, ring) => {
      const offset = (ring * TOWN_LAND_SEGMENTS + segment) * 6;
      const bounds = new THREE.Box2();
      for (let i = 0; i < 6; i++) {
        const vertex = indices.getX(offset + i);
        bounds.expandByPoint(point.set(positions.getX(vertex), positions.getZ(vertex)));
      }
      // Broad-phase padding only: retain ray/triangle rounding at shared edges.
      bounds.expandByScalar(1e-9);
      return { offset, bounds };
    });
    for (const cell of cells) bounds.union(cell.bounds);
    return { bounds, cells };
  });
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  return (x, z) => {
    point.set(x, z);
    ray.origin.set(x, 200, z);
    let height: number | undefined;
    for (const sector of sectors) {
      if (!sector.bounds.containsPoint(point)) continue;
      for (const cell of sector.cells) {
        if (!cell.bounds.containsPoint(point)) continue;
        for (let i = cell.offset; i < cell.offset + 6; i += 3) {
          a.fromBufferAttribute(positions, indices.getX(i));
          b.fromBufferAttribute(positions, indices.getX(i + 1));
          c.fromBufferAttribute(positions, indices.getX(i + 2));
          if (ray.intersectTriangle(a, b, c, true, hit)) height = Math.max(height ?? -Infinity, hit.y);
        }
      }
    }
    return height;
  };
}

function createTownLand(object: WorldObject, shoal: LakeShoal): THREE.BufferGeometry {
  const radius = shoal.islandRadius;
  const angle = shoal.rotation;
  const heading = object.heading ?? 0;
  const shelf = shoal.shelfRadius - radius;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rings = TOWN_LAND_RINGS;
  const segments = TOWN_LAND_SEGMENTS;
  for (let ring = 0; ring <= rings; ring++) {
    const distance = ring <= rings - 4 ? (radius - 10) * ring / (rings - 4)
      : [radius - 1, radius + shelf * 0.1, radius + shelf * 0.2, radius + shelf / 3][ring - rings + 3]!;
    for (let segment = 0; segment <= segments; segment++) {
      const a = segment / segments * Math.PI * 2;
      const lx = Math.cos(a) * shoal.scaleX;
      const lz = Math.sin(a) * shoal.scaleZ;
      const dx = lx * Math.cos(angle) - lz * Math.sin(angle);
      const dz = lx * Math.sin(angle) + lz * Math.cos(angle);
      const length = distance / shoalDistance(shoal, shoal.x + dx, shoal.z + dz);
      const worldX = shoal.x + dx * length - object.x;
      const worldZ = shoal.z + dz * length - object.z;
      const x = worldX * Math.cos(heading) - worldZ * Math.sin(heading);
      const z = worldX * Math.sin(heading) + worldZ * Math.cos(heading);
      positions.push(x, townLandHeight(x, z, object, shoal), z);
      uvs.push(x / 64, z / 64);
      if (ring < rings && segment < segments) {
        const i = ring * (segments + 1) + segment;
        indices.push(i, i + 1, i + segments + 1, i + 1, i + segments + 2, i + segments + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const colors: number[] = [];
  const color = new THREE.Color();
  const oliveTerrace = new THREE.Color(0x879b59);
  const garden = new THREE.Color(0x697f4b);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const offset = vertex * 3;
    const x = positions[offset]!;
    const y = positions[offset + 1]!;
    const z = positions[offset + 2]!;
    setMediterraneanGroundColor(
      color,
      object.x + x * cos + z * sin,
      object.z - x * sin + z * cos,
      y,
      1 - Math.max(0, normals.getY(vertex)),
    );
    const plantedTerrace = THREE.MathUtils.smoothstep(y, 1, 6)
      * (1 - THREE.MathUtils.smoothstep(1 - normals.getY(vertex), 0.18, 0.5));
    color.lerp(oliveTerrace, plantedTerrace * 0.65);
    let gardenCoverage = 0;
    for (const [pathX, startZ, endZ] of GARDEN_TERRACE_RUNS) {
      const t = THREE.MathUtils.clamp((z - startZ) / (endZ - startZ), 0, 1);
      const centerX = pathX + Math.sin(t * Math.PI) * 1.8 + 6;
      const across = 1 - THREE.MathUtils.smoothstep(Math.abs(x - centerX), 3, 10);
      const along = THREE.MathUtils.smoothstep(z, startZ - 3, startZ + 2)
        * (1 - THREE.MathUtils.smoothstep(z, endZ - 2, endZ + 3));
      gardenCoverage = Math.max(gardenCoverage, across * along);
    }
    color.lerp(garden, gardenCoverage * 0.62);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function archGeometry(radius: number, thickness: number, leg: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-radius - thickness, -leg);
  shape.lineTo(-radius - thickness, 0);
  shape.absarc(0, 0, radius + thickness, Math.PI, 0, true);
  shape.lineTo(radius + thickness, -leg);
  shape.lineTo(radius, -leg);
  shape.lineTo(radius, 0);
  shape.absarc(0, 0, radius, 0, Math.PI, false);
  shape.lineTo(-radius, -leg);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false, curveSegments: 10 });
}

function archOpening(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1, -1);
  shape.lineTo(1, -1);
  shape.lineTo(1, 0);
  shape.absarc(0, 0, 1, 0, Math.PI, false);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 10);
  geometry.rotateY(Math.PI);
  return geometry;
}

function hipRoofGeometry(): THREE.BufferGeometry {
  const corners = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.3, 1, 0], [0.3, 1, 0]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setIndex([0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

function skiffGeometry(): THREE.BufferGeometry {
  const vertices = [
    -3.1, 0.85, 0, -2, 0.95, -0.9, 2, 0.95, -0.9, 3.5, 1.1, 0, 2, 0.95, 0.9, -2, 0.95, 0.9,
    -2.2, 0.1, 0, -1.6, -0.2, -0.35, 1.7, -0.2, -0.35, 2.7, 0.3, 0, 1.7, -0.2, 0.35, -1.6, -0.2, 0.35,
  ];
  const indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6;
    indices.push(i, n, i + 6, n, n + 6, i + 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
