import * as THREE from "three";

// Sailing uses east/+X and north/+Z; Three's +Y-up view needs north/-Z.
export const SAILING_TO_RENDER = new THREE.Matrix4().makeScale(1, 1, -1);

/** Extract the proper sailing rotation before decomposing a reflected world matrix. */
export function getSailingQuaternion(object: THREE.Object3D, target: THREE.Quaternion, scratch: THREE.Matrix4): THREE.Quaternion {
  object.updateWorldMatrix(true, false);
  scratch.copy(object.matrixWorld).premultiply(SAILING_TO_RENDER);
  scratch.extractRotation(scratch);
  return target.setFromRotationMatrix(scratch);
}
