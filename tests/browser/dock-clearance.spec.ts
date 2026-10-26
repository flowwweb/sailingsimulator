import { expect, test } from "@playwright/test";
import { buildWaveComponents } from "../../src/weather/waves";
import { DEFAULT_WEATHER } from "../../src/weather/types";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const observed = window as any;
    observed.__THREE_DEVTOOLS__ = new EventTarget();
    observed.__THREE_DEVTOOLS__.addEventListener("observe", (event: any) => {
      if (!event.detail.isWebGLRenderer) return;
      const renderer = event.detail, render = renderer.render.bind(renderer);
      renderer.render = (scene: any, camera: any) => {
        if (camera.fov === 30) observed.dockScene = scene;
        return render(scene, camera);
      };
    });
  });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.waitForFunction(() => Boolean((window as any).dockScene));
});

test("visitor deck clears high tide and strong linked waves with supported fingers", async ({ page }) => {
  const dock = await page.evaluate(() => {
    const root = (window as any).dockScene.getObjectByName("juniper-cove-dock");
    const surfaces: any[] = [], pilings: any[] = [];
    for (const mesh of root.children) {
      if (!mesh.name.startsWith("Visitor dock")) continue;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const bounds = { name: mesh.name, x: mesh.position.x, z: mesh.position.z,
        minX: box.min.x + mesh.position.x, maxX: box.max.x + mesh.position.x,
        minZ: box.min.z + mesh.position.z, maxZ: box.max.z + mesh.position.z,
        bottom: box.min.y + mesh.position.y, top: box.max.y + mesh.position.y };
      (mesh.name.endsWith("piling") ? pilings : surfaces).push(bounds);
    }
    return { position: root.position.toArray(), heading: root.rotation.y, surfaces, pilings };
  });
  expect(dock.position).toEqual([1040, 0, -480]);
  expect(dock.heading).toBeCloseTo(Math.PI * 0.44);
  expect(dock.surfaces).toHaveLength(4);
  for (const speed of [7.5, 12]) {
    const waves = buildWaveComponents(DEFAULT_WEATHER.waves, speed * (1 + DEFAULT_WEATHER.wind.gustStrength), 90, DEFAULT_WEATHER.seed);
    const crest = DEFAULT_WEATHER.tide.range / 2 + waves.reduce((sum, wave) =>
      sum + wave.amplitude + 0.5 * wave.steepness * (2 * Math.PI / wave.wavelength) * wave.amplitude ** 2, 0);
    for (const surface of dock.surfaces) expect(surface.top - crest).toBeGreaterThan(0.1);
  }
  const deck = dock.surfaces.find(surface => surface.name.endsWith("deck"));
  for (const [actual, expected] of [[deck.minX, -11], [deck.maxX, 11], [deck.minZ, -1.3], [deck.maxZ, 1.3]]) expect(actual).toBeCloseTo(expected);
  for (const surface of dock.surfaces) expect(surface.top).toBeCloseTo(deck.top);
  for (const finger of dock.surfaces.filter(surface => surface.name.endsWith("finger"))) {
    expect(Math.abs(finger.x)).toBeCloseTo(7.2);
    expect(finger.z).toBeCloseTo(4.8);
    expect(finger.maxX - finger.minX).toBeCloseTo(1.5);
    expect(finger.maxZ - finger.minZ).toBeCloseTo(9.5);
    expect(dock.pilings.some(piling => Math.abs(piling.x - finger.x) < 0.1 && Math.abs(piling.z - finger.maxZ) < 1)).toBeTruthy();
  }
  const landing = dock.surfaces.find(surface => surface.name.endsWith("landing"));
  expect(landing.x).toBeCloseTo(-8.2);
  expect(landing.z).toBeCloseTo(-3.2);
  expect(landing.maxX - landing.minX).toBeCloseTo(5.5);
  expect(landing.maxZ - landing.minZ).toBeCloseTo(6.4);
  for (const x of [landing.minX, landing.maxX]) expect(dock.pilings.some(piling => Math.abs(piling.x - x) < 0.5 && Math.abs(piling.z - landing.minZ) < 0.5)).toBeTruthy();
  for (const piling of dock.pilings) {
    expect(piling.bottom).toBeLessThanOrEqual(-1.59);
    expect(piling.top).toBeGreaterThan(deck.top);
  }
});

test("cloud texture has transparent borders and a visible interior", async ({ page }) => {
  const alpha = await page.evaluate(() => {
    const clouds = (window as any).dockScene.children.find((object: any) => object.children.length === 14 && object.children.every((child: any) => child.isSprite));
    const canvas = clouds.children[0].material.map.image;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let border = 0, interior = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const value = data[(y * canvas.width + x) * 4 + 3];
      if (x === 0 || x === canvas.width - 1) border = Math.max(border, value);
      else interior = Math.max(interior, value);
    }
    return { border, interior };
  });
  expect(alpha.border).toBe(0);
  expect(alpha.interior).toBeGreaterThan(100);
});
