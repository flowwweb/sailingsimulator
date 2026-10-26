import { expect, test } from "vitest";
import { Vector3, Group, Mesh, BoxGeometry, ConeGeometry, BufferGeometry, Float32BufferAttribute, ShaderMaterial } from "three";
import { MeshyBoat, sailPoint, sampleHullWaterMask, deformSailPoint, sailCamberDirection } from "./meshy-boat";

test("deformation pins the three corners while the telltale surface moves", () => {
  for (const side of [-1, 1]) {
    const direction = new Vector3(side * .8, 0, .6);
    for (const [u,v] of [[0,0],[0,1],[1,0]]) expect(deformSailPoint(new Vector3(),u!,v!,7.2,1,1,direction).length()).toBe(0);
    expect(deformSailPoint(new Vector3(),.28,.45,7.2,1,1,direction).length()).toBeGreaterThan(.01);
  }
});

test("camber follows the actual cloth normal downwind on both tacks and reef sizes", () => {
  const tack = new Vector3(.1, 1, .8);
  for (const side of [-1, 1]) for (const height of [1, .65, .025]) {
    const head = tack.clone().add(new Vector3(.06, 5 * height, .02));
    const clew = tack.clone().add(new Vector3(side * 2.1, -.08, -2.1));
    const wind = new Vector3(side * 6, 0, -1);
    const direction = sailCamberDirection(new Vector3(), head, tack, clew, wind);
    expect(direction.dot(head.clone().sub(tack))).toBeCloseTo(0, 10);
    expect(direction.dot(clew.clone().sub(tack))).toBeCloseTo(0, 10);
    expect(direction.dot(wind)).toBeGreaterThan(0);
    expect(Math.sign(direction.x)).toBe(side);
    expect(Math.abs(direction.z)).toBeGreaterThan(.5);
    const belly = deformSailPoint(new Vector3(), .5, .25, 0, 0, 0, direction);
    expect(belly.dot(wind)).toBeGreaterThan(0);
  }
});

test("camber crosses flat continuously at zero normal wind", () => {
  const tack = new Vector3(), head = new Vector3(0, 5, 0), clew = new Vector3(0, 0, -3);
  const offsets = [-.001, 0, .001].map(x => sailCamberDirection(new Vector3(), head, tack, clew, new Vector3(x, 0, 6)));
  expect(offsets[1]!.length()).toBe(0);
  expect(offsets[0]!.x).toBeLessThan(0);
  expect(offsets[2]!.x).toBeGreaterThan(0);
  expect(offsets[0]!.distanceTo(offsets[2]!)).toBeLessThan(.003);
});

test("water-mask sections measure the shell rather than the former boat dimensions", () => {
  const mask = sampleHullWaterMask(new Mesh(new BoxGeometry(2.8, 1.74, 5.42)));
  expect(mask.sections).toHaveLength(8);
  expect(mask.maxWidth).toBeCloseTo(1.4);
  for (const section of mask.sections) { expect(section.y).toBeCloseTo(-.87); expect(section.z).toBeCloseTo(.87); }
  for (const widths of mask.widths) for (const width of widths.toArray()) expect(width).toBeCloseTo(1.4);
});

test("water-mask widths retain a tapered shell instead of its bounding box", () => {
  const geometry = new ConeGeometry(1.3, 5.4, 12);
  geometry.rotateX(Math.PI / 2);
  const mask = sampleHullWaterMask(new Mesh(geometry));
  expect(mask.widths[0]!.y).toBeGreaterThan(mask.widths[7]!.y * 100);
  for (let i = 1; i < mask.widths.length; i++) expect(mask.widths[i]!.y).toBeLessThan(mask.widths[i - 1]!.y);
});

test("cloth keeps its mast anchors and follows the moving clew", () => {
  const head = new Vector3(0, 6, 1), tack = new Vector3(0, 1, 1), clew = new Vector3(3, 1, -2);
  const point = new Vector3();
  expect(sailPoint(point, head, tack, clew, 0, 0, 1, 1).toArray()).toEqual(tack.toArray());
  expect(sailPoint(point, head, tack, clew, 0, 1, 1, 1).toArray()).toEqual(head.toArray());
  expect(sailPoint(point, head, tack, clew, 1, 0, 1, 1).toArray()).toEqual(clew.toArray());
  expect(sailPoint(point, head, tack, clew, 0, 1, .5, .7).toArray()).toEqual([0, 3.5, 1]);
});

test("sheet and rudder poses preserve mast anchors and tiller linkage", () => {
  const root = new Group();
  const add = (name: string, parent = root) => { const obj = new Group(); obj.name = name; parent.add(obj); return obj; };
  const hull = add("HullPose"), rig = add("RigPose"), boom = add("BoomPivot", rig), rudder = add("RudderPivot", hull);
  const shell = new Mesh(new BoxGeometry(2.5, 1.7, 5.5)); shell.name = "HullExterior"; hull.add(shell);
  add("InteriorWood", hull);
  add("Tiller", rudder); add("Pennant", rig);
  const mast = new Mesh(new BoxGeometry(.1, 6, .1)); mast.name = "Mast"; rig.add(mast);
  add("SailHead").position.set(0, 6, 0); add("SailTack").position.set(0, 0, 0); add("SailClewRest").position.set(0, 0, -3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 6, 0, 0, 0, -3], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
  geometry.setIndex([0,1,2]);
  const cloth = new Mesh(geometry); cloth.name = "Mainsail"; rig.add(cloth);
  const asset = new MeshyBoat(root, new ShaderMaterial());
  const hullOwner = new Group(), rigOwner = new Group(), boomOwner = new Group(), rudderOwner = new Group();
  boomOwner.rotation.y = Math.PI / 2; rudderOwner.rotation.y = -.4;
  asset.sync(hullOwner, rigOwner, boomOwner, rudderOwner, 1, 1, new Vector3(0, 0, 6));
  const positions = geometry.getAttribute("position");
  expect([positions.getX(0), positions.getY(0), positions.getZ(0)]).toEqual([0, 0, 0]);
  expect([positions.getX(1), positions.getY(1), positions.getZ(1)]).toEqual([0, 6, 0]);
  expect(positions.getX(2)).toBeCloseTo(-3); expect(positions.getZ(2)).toBeCloseTo(0);
  expect(boom.rotation.y).toBeCloseTo(Math.PI / 2);
  expect(rudder.rotation.y).toBeCloseTo(-.4);
  expect(root.getObjectByName("Tiller")!.parent).toBe(rudder);
  expect(asset.camberDirection.z).toBeCloseTo(1);
  root.rotation.y = Math.PI / 2;
  asset.sync(hullOwner, rigOwner, boomOwner, rudderOwner, .025, 1, new Vector3(-6, 0, 0));
  expect(positions.getY(1)).toBeCloseTo(.15);
  expect(asset.camberDirection.z).toBeCloseTo(-1);
});
