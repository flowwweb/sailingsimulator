import * as THREE from "three";
import type { BoatState } from "../sim/model";
import { BOAT_DEFINITIONS, referencePolarSpeed, type BoatDefinition } from "../sim/boats";
import { sailableRouteHeading, trafficCommand, type TrafficPose } from "./traffic-navigation";

interface TrafficBoat extends TrafficPose {
  root: THREE.Group;
  definition: BoatDefinition;
  route: readonly { x: number; z: number }[];
  waypoint: number;
}

export class AmbientLife {
  readonly root = new THREE.Group();
  private readonly birds: THREE.Group[] = [];
  private readonly fish: THREE.Group[] = [];
  private readonly boats: TrafficBoat[] = [];
  private lastTrafficTime = 0;

  constructor() {
    this.root.name = "Ambient lake life";
    this.createBirds();
    this.createFish();
    this.createBoats();
    this.createShipwrecks();
  }

  update(time: number, player: BoatState, trueWind: { x: number; y: number }): void {
    this.birds.forEach((bird, index) => {
      const phase = time * (0.11 + index * 0.004) + index * 1.73;
      const radius = 170 + (index % 4) * 68;
      bird.position.set(
        Math.sin(phase) * radius + 560,
        25 + (index % 3) * 7 + Math.sin(time * 1.7 + index) * 1.4,
        Math.cos(phase) * radius + 340,
      );
      bird.rotation.y = phase + Math.PI / 2;
      bird.children[0]!.rotation.z = Math.sin(time * 5.2 + index) * 0.35;
      bird.children[1]!.rotation.z = -Math.sin(time * 5.2 + index) * 0.35;
    });

    this.fish.forEach((fish, index) => {
      const cycle = (time * (0.23 + index * 0.012) + index * 0.31) % 1;
      const leap = Math.max(0, Math.sin(cycle * Math.PI));
      fish.visible = cycle < 0.78;
      fish.position.y = -0.2 + leap * (0.55 + (index % 3) * 0.16);
      fish.rotation.z = (cycle - 0.5) * 1.7;
    });

    const dt = Math.min(Math.max(time - this.lastTrafficTime, 0), 0.1);
    this.lastTrafficTime = time;
    const playerPose: TrafficPose = {
      x: player.position.x,
      z: player.position.y,
      heading: player.heading,
      speed: Math.hypot(player.velocity.x, player.velocity.y),
    };
    const windFrom = Math.atan2(-trueWind.x, -trueWind.y);
    const windSpeed = Math.hypot(trueWind.x, trueWind.y);
    this.boats.forEach((boat, index) => {
      const target = boat.route[boat.waypoint]!;
      const dx = target.x - boat.x;
      const dz = target.z - boat.z;
      if (Math.hypot(dx, dz) < 45) boat.waypoint = (boat.waypoint + 1) % boat.route.length;
      const next = boat.route[boat.waypoint]!;
      const directRouteHeading = Math.atan2(next.x - boat.x, next.z - boat.z);
      const routeHeading = sailableRouteHeading(
        directRouteHeading + Math.sin(time * 0.045 + index * 1.9) * 0.07,
        windFrom,
        index % 2 === 0 ? 1 : -1,
      );
      const windAngle = Math.abs(Math.atan2(Math.sin(windFrom - boat.heading), Math.cos(windFrom - boat.heading)));
      const polarSpeed = Math.min(referencePolarSpeed(boat.definition, windAngle, windSpeed), 4.6);
      const command = trafficCommand(boat, playerPose, routeHeading, polarSpeed, dt);
      boat.heading = command.heading;
      boat.speed += (command.speed - boat.speed) * Math.min(dt * 0.7, 1);
      boat.x += Math.sin(boat.heading) * boat.speed * dt;
      boat.z += Math.cos(boat.heading) * boat.speed * dt;
      boat.root.position.set(boat.x, 0.1 + Math.sin(time * 0.8 + index) * 0.04, boat.z);
      boat.root.rotation.y = boat.heading;
      boat.root.rotation.z = Math.sin(time * 0.55 + index * 1.7) * 0.035;
    });
  }

  trafficSnapshot(): TrafficPose[] {
    return this.boats.map(({ x, z, heading, speed }) => ({
      x,
      z,
      heading,
      speed,
    }));
  }

  private createBirds(): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0x26383b,
      side: THREE.DoubleSide,
    });
    const wingGeometry = new THREE.BufferGeometry();
    wingGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1.5, 0.12, 0, 0.15, 0, 0.42], 3),
    );
    wingGeometry.setIndex([0, 1, 2]);
    for (let index = 0; index < 10; index += 1) {
      const bird = new THREE.Group();
      const left = new THREE.Mesh(wingGeometry, material);
      const right = new THREE.Mesh(wingGeometry, material);
      left.rotation.y = Math.PI;
      bird.add(left, right);
      bird.scale.setScalar(0.65 + (index % 4) * 0.12);
      this.birds.push(bird);
      this.root.add(bird);
    }
  }

  private createFish(): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0x526b68,
      roughness: 0.72,
      flatShading: true,
    });
    const positions = [
      [535, 465], [668, 515], [742, 392], [438, 350], [790, 275], [560, 205],
    ] as const;
    positions.forEach(([x, z], index) => {
      const fish = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 6), material);
      body.rotation.z = Math.PI / 2;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.72, 3), material);
      tail.position.x = -0.9;
      tail.rotation.z = -Math.PI / 2;
      fish.add(body, tail);
      fish.position.set(x, 0, z);
      fish.rotation.y = index * 1.1;
      this.fish.push(fish);
      this.root.add(fish);
    });
  }

  private createBoats(): void {
    const definitions = Object.values(BOAT_DEFINITIONS);
    const routes = [
      [{ x: -420, z: -180 }, { x: -80, z: 420 }, { x: 430, z: 260 }, { x: 260, z: -360 }],
      [{ x: 610, z: -280 }, { x: 760, z: 260 }, { x: 280, z: 560 }, { x: 40, z: 60 }],
      [{ x: -720, z: 360 }, { x: -260, z: 720 }, { x: 220, z: 610 }, { x: -80, z: 120 }],
    ] as const;
    definitions.forEach((definition, index) => {
      const root = createNpcBoatModel(definition);
      const start = routes[index]![0];
      const next = routes[index]![1];
      const heading = Math.atan2(next.x - start.x, next.z - start.z);
      const scale = definition.hull.length / 4.65;
      root.scale.setScalar(scale);
      this.boats.push({ root, definition, route: routes[index]!, waypoint: 1, x: start.x, z: start.z, heading, speed: 1.2 + index * 0.35 });
      this.root.add(root);
    });
  }

  private createShipwrecks(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4e382d, roughness: 1, flatShading: true });
    const wrecks = [
      { x: -540, z: 330, heading: 0.5 },
      { x: 760, z: 245, heading: -0.8 },
    ];
    wrecks.forEach(({ x, z, heading }) => {
      const wreck = new THREE.Group();
      wreck.position.set(x, -0.28, z);
      wreck.rotation.y = heading;
      wreck.rotation.z = 0.14;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.3, 2.2), wood);
      hull.geometry.rotateY(0.08);
      const ribs = new THREE.Group();
      for (const offset of [-2.5, -1.2, 0.2, 1.6, 2.8]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 3.2), wood);
        rib.position.x = offset;
        rib.rotation.z = 0.18 + offset * 0.025;
        ribs.add(rib);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 6), wood);
      mast.position.set(0.8, 2.6, 0);
      mast.rotation.z = 0.75;
      wreck.add(hull, ribs, mast);
      this.root.add(wreck);
    });
  }
}

function createNpcBoatModel(definition: BoatDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = `${definition.name} NPC variant`;
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: definition.visual.npcHullColor,
    roughness: 0.68,
    flatShading: true,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: definition.visual.npcTrimColor,
    roughness: 0.74,
  });
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: definition.visual.npcSailColor,
    side: THREE.DoubleSide,
    roughness: 0.82,
  });
  const hull = new THREE.Mesh(createNpcHullGeometry(), hullMaterial);
  root.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 3.55), trimMaterial);
  deck.position.y = 0.38;
  root.add(deck);
  if (definition.id !== "harbor-20") {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.34, 1.05), sailMaterial);
    cabin.position.set(0, 0.62, 0.35);
    root.add(cabin);
  }
  const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x6f5136, roughness: 0.72 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 6.35, 8), mastMaterial);
  mast.position.set(0, 3.45, definition.visual.rigForwardOffset);
  root.add(mast);
  const main = new THREE.Mesh(createNpcSailGeometry(3.25, 5.65), sailMaterial);
  main.position.set(0, 0.62, definition.visual.rigForwardOffset - 0.05);
  root.add(main);
  if (definition.sailPlan.some((sail) => sail.kind === "headsail")) {
    const headsail = new THREE.Mesh(createNpcSailGeometry(1.8, 4.15), sailMaterial);
    headsail.scale.x = -1;
    headsail.position.set(0.02, 0.78, definition.visual.rigForwardOffset + 0.12);
    root.add(headsail);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 3.9), trimMaterial);
  stripe.position.y = 0.05;
  root.add(stripe);
  return root;
}

function createNpcHullGeometry(): THREE.BufferGeometry {
  const stations = [
    { z: 3.12, w: 0.03, top: 0.52, bottom: -0.02 },
    { z: 2.05, w: 0.72, top: 0.42, bottom: -0.38 },
    { z: 0.25, w: 1.04, top: 0.36, bottom: -0.62 },
    { z: -1.42, w: 0.96, top: 0.4, bottom: -0.52 },
    { z: -2.58, w: 0.62, top: 0.48, bottom: -0.25 },
  ];
  const vertices: number[] = [];
  const triangle = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c);
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i]!;
    const b = stations[i + 1]!;
    for (const side of [-1, 1]) {
      triangle([side * a.w, a.top, a.z], [side * a.w, a.bottom, a.z], [side * b.w, b.bottom, b.z]);
      triangle([side * a.w, a.top, a.z], [side * b.w, b.bottom, b.z], [side * b.w, b.top, b.z]);
    }
    triangle([-a.w, a.bottom, a.z], [a.w, a.bottom, a.z], [b.w, b.bottom, b.z]);
    triangle([-a.w, a.bottom, a.z], [b.w, b.bottom, b.z], [-b.w, b.bottom, b.z]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createNpcSailGeometry(chord: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, height, 0, 0, 0.15, -chord], 3),
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
}
