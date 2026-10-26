import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BOAT_DEFINITIONS, HARBOR_20 } from "../sim/boats";
import { createInitialState } from "../sim/model";
import { BASTION_ROCK, BASTION_FOOT_ROCKS, LIGHTHOUSE_SOLIDS } from "./town-solids";
import { FAIR_WINDS_WORLD, STONE_QUAY } from "./world-definition";
import { evaluateIncident } from "./hazards";

const town = FAIR_WINDS_WORLD.objects.find(object => object.kind === "town")!;
const world = { ...FAIR_WINDS_WORLD, objects: [town], sampleDepth: () => 100 };
const at = (x: number, z: number, heading = 0) => ({ ...createInitialState(), position: { x, y: z }, heading });
const rock8 = LIGHTHOUSE_SOLIDS[9]!;
const rockWorld = { ...world, objects: [{ ...town, collision: { box: STONE_QUAY, solids: [rock8], response: "hard" as const } }] };

describe("authored lighthouse solids", () => {
  it("uses the exact rendered rock silhouette, including asymmetric detail vertices and finite height", () => {
    const geometry = new THREE.DodecahedronGeometry(BASTION_ROCK.radius, BASTION_ROCK.detail);
    const position = geometry.attributes.position!;
    for (let edge = 0; edge < BASTION_ROCK.footprint.length; edge++) {
      const a = BASTION_ROCK.footprint[edge]!, b = BASTION_ROCK.footprint[(edge + 1) % BASTION_ROCK.footprint.length]!;
      let authoredEdge = false;
      for (let i = 0; i < position.count; i++) {
        const side = (b[0] - a[0]) * (position.getZ(i) - a[1]) - (b[1] - a[1]) * (position.getX(i) - a[0]);
        expect(side).toBeGreaterThanOrEqual(-1e-8);
      }
      for (let i = 0; i < position.count; i += 3) {
        const triangle = [0, 1, 2].map(k => [position.getX(i + k), position.getZ(i + k)]);
        if (triangle.some(p => p[0] === a[0] && p[1] === a[1]) && triangle.some(p => p[0] === b[0] && p[1] === b[1])) authoredEdge = true;
      }
      expect(authoredEdge).toBe(true);
    }
    geometry.computeBoundingBox();
    expect([geometry.boundingBox!.min.y, geometry.boundingBox!.max.y]).toEqual([BASTION_ROCK.minY, BASTION_ROCK.maxY]);
    expect(BASTION_FOOT_ROCKS).toHaveLength(12);
    expect(LIGHTHOUSE_SOLIDS).toHaveLength(13);
    expect(rock8.footprint.length).toBe(14);
  });

  it("catches the retained rock8 hull penetration at the same physical height for every tide", () => {
    const state = at(1099.7379977733585, -453.96022554356216, 3.0040236694018336);
    state.wavePitch = .012617318566769068;
    state.heel = -.11508559711124272;
    for (const tide of [-3, -1.5, -.6, 0, .6, 1.5, 3]) {
      const pose = { ...state, heave: .8047294697656149 - tide };
      const result = evaluateIncident(pose, HARBOR_20, world, tide);
      expect(result.kind).toBe("collision");
      expect(result.point.x).toBeCloseTo(1100.9);
      expect(result.point.z).toBeCloseTo(-449.3693575);
      expect(result.contactPose?.position).toEqual(state.position);
    }
  });

  it("sweeps each individual rock from both sides with all hull sizes and yaw, without tunnelling", () => {
    for (const solid of LIGHTHOUSE_SOLIDS.slice(1)) for (const boat of Object.values(BOAT_DEFINITIONS)) for (const sign of [-1, 1]) {
      const isolated = { ...world, objects: [{ ...town, collision: { box: STONE_QUAY, solids: [solid], response: "hard" as const } }] };
      const x = town.x + solid.x, z = town.z + solid.z;
      const before = at(x - 30 * sign, z, .7), next = at(x + 30 * sign, z, .74);
      const result = evaluateIncident(next, boat, isolated, 0, undefined, before);
      expect(result.kind).toBe("collision");
      expect((result.contactPose!.position.x - before.position.x) * sign).toBeGreaterThan(0);
      expect((result.contactPose!.position.x - x) * sign).toBeLessThan(0);
      expect(result.contactPose!.position.y).toBe(z);
    }
  });

  it("chooses the first solid independent of array order and preserves town rotation", () => {
    for (const yaw of [0, .7, -1.2]) {
      const transform = (x: number, z: number) => at(town.x + x * Math.cos(yaw) + z * Math.sin(yaw), town.z - x * Math.sin(yaw) + z * Math.cos(yaw), yaw + .3);
      const before = transform(-25, 56), next = transform(25, 56);
      const forward = { ...world, objects: [{ ...town, heading: yaw }] };
      const reversed = { ...world, objects: [{ ...town, heading: yaw, collision: { box: STONE_QUAY, solids: [...LIGHTHOUSE_SOLIDS].reverse(), response: "hard" as const } }] };
      const a = evaluateIncident(next, HARBOR_20, forward, 0, undefined, before);
      const b = evaluateIncident(next, HARBOR_20, reversed, 0, undefined, before);
      expect(a.kind).toBe("collision");
      expect([a.contactPose, a.point]).toEqual([b.contactPose, b.point]);
    }
  });

  it("allows height-separated passage and stops a descending hull at the swept height", () => {
    const middle = at(town.x + rock8.x, town.z + rock8.z);
    for (const heave of [-20, 20]) expect(evaluateIncident({ ...middle, heave }, HARBOR_20, rockWorld).kind).toBe("clear");
    const above = { ...middle, heave: 20 }, below = { ...middle, heave: -20 };
    const result = evaluateIncident(below, HARBOR_20, rockWorld, 0, undefined, above);
    expect(result.kind).toBe("collision");
    expect(result.contactPose!.heave).toBeGreaterThan(rock8.maxY);
    expect(result.contactPose!.heave).toBeLessThan(above.heave);
    expect(result.contactPose!.position).toEqual(middle.position);
  });

  it("distinguishes a 2cm approach/retreat at the individual footprint boundary", () => {
    const solid = LIGHTHOUSE_SOLIDS[12]!;
    const isolated = { ...world, objects: [{ ...town, collision: { box: STONE_QUAY, solids: [solid], response: "hard" as const } }] };
    for (const boat of Object.values(BOAT_DEFINITIONS)) {
      const before = at(town.x + solid.x, town.z + solid.z - 15), next = at(town.x + solid.x, town.z + solid.z + 15);
      const contact = evaluateIncident(next, boat, isolated, 0, undefined, before).contactPose!;
      const clear = at(contact.position.x, contact.position.y - .02), inside = at(contact.position.x, contact.position.y + .02);
      expect(evaluateIncident(clear, boat, isolated).kind).toBe("clear");
      expect(evaluateIncident(inside, boat, isolated).kind).toBe("collision");
      expect(evaluateIncident(at(clear.position.x, clear.position.y - .02), boat, isolated, 0, undefined, clear).kind).toBe("clear");
      const crossing = evaluateIncident(inside, boat, isolated, 0, undefined, clear);
      expect(crossing.contactPose!.position.y).toBeCloseTo(contact.position.y, 8);
    }
  });

  it("leaves both sides of the lighthouse and the visitor berth approaches open", () => {
    for (const z of [-557, -454, -427]) {
      const before = at(1050, z, Math.PI / 2), next = at(1070, z, Math.PI / 2);
      expect(evaluateIncident(next, HARBOR_20, world, .6, undefined, before).kind).toBe("clear");
    }
    for (const tide of [-1.5, .6, 1.5]) {
      const dock = FAIR_WINDS_WORLD.objects.find(o => o.id === "juniper-cove-dock")!;
      const state = at(1044, -479, dock.docking!.heading);
      expect(evaluateIncident(state, HARBOR_20, FAIR_WINDS_WORLD, tide).kind).toBe("docking");
    }
  });
});
