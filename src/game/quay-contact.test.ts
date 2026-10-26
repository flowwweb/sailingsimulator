import { describe, expect, it } from "vitest";
import { BOAT_DEFINITIONS, HARBOR_20 } from "../sim/boats";
import { createInitialState, wrappedAngle } from "../sim/model";
import { evaluateIncident } from "./hazards";
import { FAIR_WINDS_WORLD, STONE_QUAY } from "./world-definition";
import { LIGHTHOUSE_SOLIDS } from "./town-solids";

const town = FAIR_WINDS_WORLD.objects.find(object => object.kind === "town")!;
const quayWorld = { ...FAIR_WINDS_WORLD, objects: [town], sampleDepth: () => 100 };
const at = (x: number, z: number, heading = Math.PI / 2) => ({ ...createInitialState(), position: { x, y: z }, heading, velocity: { x: 3, y: 0 } });

describe("solid stone quay contact", () => {
  it("shares its authored footprint and catches the exact retained phone penetration", () => {
    expect(town.collision).toEqual({ box: STONE_QUAY, solids: LIGHTHOUSE_SOLIDS, response: "hard" });
    expect([town.x + STONE_QUAY.x - STONE_QUAY.width / 2, town.x + STONE_QUAY.x + STONE_QUAY.width / 2,
      town.z + STONE_QUAY.z - STONE_QUAY.depth / 2, town.z + STONE_QUAY.z + STONE_QUAY.depth / 2]).toEqual([1089.5, 1100.5, -543, -461]);
    const negative = at(1092.8270012627024, -466.71280661767196, 0.5672204330237021);
    for (const tide of [-3, 0, 3]) expect(evaluateIncident(negative, HARBOR_20, FAIR_WINDS_WORLD, tide).kind).toBe("collision");
  });

  it("stops the recorded phone approach before the hull reaches masonry at every tide", () => {
    const path = [
      [1079.8682238207152, -479.14128631409096, .8295482241372267],
      [1081.1753466613604, -477.43529877288984, .9721192820425484],
      [1082.5035831450216, -476.6048827645002, .8330144615417725],
      [1084.2263868807963, -475.36997990731567, .6873612450852801],
      [1085.1777075413365, -473.9023344209684, .8456286113620488],
      [1086.362753965278, -472.3224077191932, .9915832896794019],
      [1092.8270012627024, -466.71280661767196, .5672204330237021],
    ];
    for (const tide of [-3, -.6, 0, .6, 3]) {
      let contact;
      for (let i = 1; i < path.length && !contact; i++) {
        const a = path[i - 1]!, b = path[i]!;
        let previous = at(a[0]!, a[1]!, a[2]!);
        for (let step = 1; step <= 60; step++) {
          const t = step / 60, next = at(a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + wrappedAngle(b[2]! - a[2]!) * t);
          const result = evaluateIncident(next, HARBOR_20, quayWorld, tide, undefined, previous);
          if (result.contactPose) { contact = result.contactPose; break; }
          previous = next;
        }
      }
      expect(contact).toBeDefined();
      const maxX = contact!.position.x + 3.15 * Math.abs(Math.sin(contact!.heading)) + 1.65 * Math.abs(Math.cos(contact!.heading));
      expect(maxX).toBeLessThan(1089.5);
      expect(contact!.position.x).toBeLessThan(1087);
    }
  });

  it("sweeps across the whole box even when both endpoints are clear, with yaw and all hull sizes", () => {
    for (const boat of Object.values(BOAT_DEFINITIONS)) for (const heading of [0, .7, Math.PI / 2, 3.13]) for (const turn of [0, -.04, .04]) {
      const before = at(1045, -500, heading), next = at(1145, -500, wrappedAngle(heading + turn));
      const result = evaluateIncident(next, boat, quayWorld, 3, undefined, before);
      expect(result.kind).toBe("collision");
      expect(result.contactPose!.position.x).toBeGreaterThanOrEqual(before.position.x);
      expect(result.contactPose!.position.x).toBeLessThan(1089.5);
      expect(result.contactPose!.position.y).toBe(-500);
      expect(before.position.x).toBe(1045);
      expect(next.position.x).toBe(1145);
    }
  });

  it("uses the same town rotation as the renderer and leaves water beyond the quay ends clear", () => {
    for (const yaw of [0, .7, -1.2]) {
      const rotated = { ...town, heading: yaw }, world = { ...quayWorld, objects: [rotated] };
      const transform = (x: number, z: number) => at(town.x + x * Math.cos(yaw) + z * Math.sin(yaw), town.z - x * Math.sin(yaw) + z * Math.cos(yaw), Math.PI / 2 + yaw);
      const before = transform(-50, -2), next = transform(30, -2);
      expect(evaluateIncident(next, HARBOR_20, world, 0, undefined, before).kind).toBe("collision");
      for (const z of [-50, 46]) expect(evaluateIncident(transform(30, z), HARBOR_20, world, 0, undefined, transform(-50, z)).kind).toBe("clear");
    }
  });

  it("preserves circular hazard results when a prior motion state is supplied", () => {
    for (const [x, z] of [[210, -310], [-586, 396], [1050, 1160]]) {
      const state = at(x!, z!);
      expect(evaluateIncident(state, HARBOR_20, FAIR_WINDS_WORLD, 0, undefined, at(x! - .02, z!))).toEqual(evaluateIncident(state, HARBOR_20));
    }
  });
});
