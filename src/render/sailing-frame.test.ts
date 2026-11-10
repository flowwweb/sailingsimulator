import { expect, test } from "vitest";
import * as THREE from "three";
import { getSailingQuaternion, SAILING_TO_RENDER } from "./sailing-frame";

test("the scene basis preserves height while restoring the boat's proper sailing rotation", () => {
  const frame = new THREE.Group();
  frame.applyMatrix4(SAILING_TO_RENDER);
  const boat = new THREE.Group(), rig = new THREE.Group();
  frame.add(boat); boat.add(rig);
  boat.scale.setScalar(1.3);
  rig.rotation.set(.2, -.4, -.35);
  for (const heading of [0, Math.PI / 2, 155 * Math.PI / 180, Math.PI, 3 * Math.PI / 2]) {
    boat.rotation.y = heading;
    boat.position.set(82, 1.4, -27);
    const expected = boat.quaternion.clone().multiply(rig.quaternion);
    const actual = getSailingQuaternion(rig, new THREE.Quaternion(), new THREE.Matrix4());
    expect(actual.angleTo(expected)).toBeLessThan(1e-7);
    const render = boat.getWorldPosition(new THREE.Vector3());
    expect(render.distanceTo(new THREE.Vector3(82, 1.4, 27))).toBeLessThan(1e-10);
  }
});
