import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve(".artifacts/pause-menu-options");
test.use({ hasTouch: true });
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await page.screenshot({ path: resolve(evidence, `failed-${info.title.replace(/[^a-z0-9]+/gi, "-")}.png`) });
});

test.beforeEach(async ({ page }, info) => {
  const viewport = info.title.includes("short-phone") ? { width: 812, height: 375 }
    : info.title.includes("phone") ? { width: 844, height: 390 }
    : info.title.includes("panel") ? { width: 895, height: 790 } : { width: 1672, height: 941 };
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    const observed = window as any;
    observed.__THREE_DEVTOOLS__ = new EventTarget();
    observed.__THREE_DEVTOOLS__.addEventListener("observe", (event: any) => {
      if (!event.detail.isWebGLRenderer) return;
      const renderer = event.detail, render = renderer.render.bind(renderer);
      renderer.render = (scene: any, camera: any) => {
        if (camera.fov === 52) observed.pauseScene = scene;
        return render(scene, camera);
      };
    });
  });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-free-sail").click();
  await expect(page.locator("#welcome")).toBeHidden();
  await page.waitForTimeout(1000);
});

async function snapshot(page: any) {
  return page.evaluate(() => {
    const scene = (window as any).pauseScene, boat = scene.getObjectByName("BoatAssetRoot");
    const sail = boat.getObjectByName("Mainsail");
    const water = scene.children.find((object: any) => object.material?.uniforms?.uWaveAmplitude);
    return { time: document.querySelector<HTMLElement>(".game-shell")!.dataset.simulationTime,
      position: boat.getWorldPosition(boat.position.clone()).toArray(), quaternion: boat.quaternion.toArray(),
      sheet: document.querySelector<HTMLInputElement>("#hud-sheet")!.value,
      sailTime: sail.material.uniforms.uTime.value, luff: sail.material.uniforms.uLuff.value, stall: sail.material.uniforms.uStall.value,
      waveTime: water.material.uniforms.uTime.value, tide: water.position.y,
      progress: localStorage.getItem("fair-winds-progress-v1") };
  });
}

for (const [label, width, height] of [["desktop",1672,941],["panel",895,790],["phone",844,390],["short-phone",812,375]] as const) {
  test(`pause freezes sailing, fits and restores keyboard focus at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".top-actions #pause-toggle")).toHaveCount(0);
    await page.locator("#conditions-toggle").click();
    await page.locator("#conditions-panel").evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    expect(await page.locator("#pause-toggle").evaluate(element => getComputedStyle(element).fontSize)).toBe(
      await page.locator("#settings-main-menu").evaluate(element => getComputedStyle(element).fontSize));
    for (const button of await page.locator(".settings-footer button:visible").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    }
    await page.screenshot({ path: resolve(evidence, `${label}-settings-entry.png`) });
    await page.locator("#pause-toggle").click();
    await expect(page.locator("#pause-resume")).toBeFocused();
    const before = await snapshot(page);
    await page.keyboard.press("s");
    await page.keyboard.press("c");
    await page.waitForTimeout(700);
    expect(await snapshot(page)).toEqual(before);
    await expect(page.locator("#conditions-panel")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".sailing-hud")).toBeHidden();
    const bounds = await page.locator("#pause-panel").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    for (const button of await page.locator("#pause-menu button").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    }
    expect(await page.locator("#pause-screen").evaluate(element => getComputedStyle(element).backdropFilter)).toContain("blur(3px)");
    expect(await page.locator("#pause-panel").evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderWidth, shadow: style.boxShadow };
    })).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px", shadow: "none" });
    await page.screenshot({ path: resolve(evidence, `${label}-paused.png`) });
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#pause-main-menu")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#pause-resume")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#pause-screen")).toBeHidden();
    await expect(page.locator("#conditions-toggle")).toBeFocused();
    await expect.poll(async () => Number((await snapshot(page)).time)).toBeGreaterThan(Number(before.time));
    await page.screenshot({ path: resolve(evidence, `${label}-resumed.png`) });
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-screen")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#conditions-toggle")).toBeFocused();
    if (label.includes("phone")) {
      await page.locator("#conditions-toggle").tap();
      await page.locator("#pause-toggle").tap();
      const touchPaused = await snapshot(page);
      await page.waitForTimeout(300);
      expect(await snapshot(page)).toEqual(touchPaused);
      await page.locator("#pause-resume").tap();
      await expect(page.locator("#pause-screen")).toBeHidden();
    }
  });
}

test("pause nested Settings and Logbook return to their opener, then Esc resumes", async ({ page }) => {
  await page.locator("#hud-sheet").fill("0.3");
  await page.keyboard.press("Escape");
  const before = await snapshot(page);
  await page.locator("#pause-settings").click();
  await expect(page.locator("#settings-resume")).toHaveText("Back to pause");
  await page.waitForTimeout(400);
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-settings")).toBeFocused();
  await page.locator("#pause-logbook").click();
  await expect(page.locator("#pause-heading")).toHaveText("Logbook");
  await expect(page.locator("#pause-logbook-lessons li")).toHaveCount(4);
  await expect(page.locator("#pause-logbook-lessons li").first()).toHaveText("Reach the first buoy · Not yet completed");
  await page.locator("#pause-logbook-back").click();
  await expect(page.locator("#pause-logbook")).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-screen")).toBeHidden();
  await page.keyboard.press("Escape");
  await page.locator("#pause-main-menu").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#pause-screen")).toBeHidden();
  await page.locator("#title-free-sail").click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#hud-sheet")).toHaveValue("0.3");
});

