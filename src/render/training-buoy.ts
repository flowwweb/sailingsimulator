import * as THREE from "three";

/** Inflatable course mark; the origin is at the calm-water line. */
export function createTrainingBuoy(color: number): THREE.Group {
  const buoy = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.08, roughness: 0.65,
  });
  const light = new THREE.MeshStandardMaterial({ color: 0xffe9bf, roughness: 0.8 });
  const seam = new THREE.MeshStandardMaterial({ color: 0xa34e18, roughness: 0.85 });
  const profile: [number, number][] = [
    [0, -0.35], [0.38, -0.31], [0.53, -0.16], [0.57, 0.08],
    [0.56, 0.72], [0.50, 1.08], [0.37, 1.38], [0.19, 1.58], [0, 1.64],
  ];
  const outline = profile.map(([radius, height]) => new THREE.Vector2(radius, height));
  const body = new THREE.Mesh(new THREE.LatheGeometry(outline, 16), orange);
  body.name = "Inflatable orange body";
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.563, 0.568, 0.12, 16, 1, true), light);
  band.position.y = 0.55;
  band.name = "Reflective band";
  const baseSeam = new THREE.Mesh(new THREE.TorusGeometry(0.552, 0.025, 5, 16), seam);
  baseSeam.rotation.x = Math.PI / 2;
  baseSeam.position.y = 0.08;
  baseSeam.name = "Base seam";
  buoy.add(body, band, baseSeam);
  return buoy;
}
