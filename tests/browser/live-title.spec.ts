import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve(".artifacts/live-title");
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: resolve(evidence, `failed-${info.title.replace(/[^a-z0-9]+/gi, "-")}.png`) });
  }
});

for (const [label, width, height] of [["app-panel",976,790],["desktop",1440,900],["phone",844,390]] as const) {
  test(`live title and single-line actions at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const posters: string[] = [];
    page.on("request", request => { if (/fairwinds-(title|return)-harbor\.png/.test(request.url())) posters.push(request.url()); });
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#title-artwork")).toHaveCount(0);
    const first = await page.locator("#lake").screenshot();
    await page.waitForTimeout(1200);
    const second = await page.locator("#lake").screenshot();
    expect(first.equals(second)).toBe(false);
    expect(posters).toEqual([]);
    for (const id of ["set-sail", "title-free-sail", "title-logbook", "title-settings"]) {
      const button = page.locator(`#${id}`);
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      await expect(button).toHaveCSS("white-space", "nowrap");
      expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: resolve(evidence, `title-${label}.png`) });
    await page.locator("#set-sail").click();
    await expect(page.locator("#lesson-chooser")).toBeVisible();
    for (const label of await page.locator(".lesson-name, .lesson-targets").all()) {
      expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: resolve(evidence, `chooser-${label}.png`) });
  });
}

test("portrait pauses the active lesson and landscape resumes it", async ({ page }) => {
  await page.setViewportSize({ width:844, height:390 });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#set-sail").click();
  await page.locator("#start-lesson").click();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "trim");
  await page.setViewportSize({ width:390, height:844 });
  await expect(page.locator(".orientation-gate")).toBeVisible();
  await expect.poll(() => page.locator(".game-shell").evaluate(element => element.inert)).toBe(true);
  const time = await page.locator(".game-shell").getAttribute("data-simulation-time");
  const saved = await page.evaluate(() => localStorage.getItem("fair-winds-progress-v1"));
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(800);
  await expect(page.locator(".game-shell")).toHaveAttribute("data-simulation-time", time!);
  expect(await page.evaluate(() => localStorage.getItem("fair-winds-progress-v1"))).toBe(saved);
  await page.screenshot({ path: resolve(evidence, "portrait-paused.png") });
  await page.keyboard.up("ArrowRight");
  await page.setViewportSize({ width:844, height:390 });
  await expect(page.locator(".orientation-gate")).toBeHidden();
  await expect.poll(async () => Number(await page.locator(".game-shell").getAttribute("data-simulation-time"))).toBeGreaterThan(Number(time));
  await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "trim");
});

test("sailing starts while music loading is delayed", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/music/*.mp3", async route => {
    await gate;
    await route.abort();
  });
  try {
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#title-free-sail").click();
    await expect(page.locator("#welcome")).toBeHidden();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "free-sail");
    await page.locator("#conditions-toggle").click();
    await expect(page.locator("#conditions-panel")).toHaveAttribute("aria-hidden", "false");
  } finally {
    release();
  }
});

test("a later title gesture retries blocked music playback", async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    sessionStorage.setItem("test-block-music", "true");
    HTMLMediaElement.prototype.play = function () {
      if (sessionStorage.getItem("test-block-music")) {
        return Promise.reject(new DOMException("First gesture blocked", "NotAllowedError"));
      }
      return play.call(this);
    };
  });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-settings").click();
  await page.locator('[data-ui-tab="sound"]').click();
  await expect(page.locator("#music-playback-status")).toContainText("Tap Play to resume");
  await page.evaluate(() => sessionStorage.removeItem("test-block-music"));
  await page.keyboard.press("Escape");
  await page.locator("#title-settings").click();
  await page.locator('[data-ui-tab="sound"]').click();
  await expect(page.locator("#music-playback-status")).toContainText("Playing");
});

test("arrival and return presentation sails use their current wind", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const observed = window as typeof window & { __THREE_DEVTOOLS__: EventTarget; titleScene?: any };
    observed.__THREE_DEVTOOLS__ = new EventTarget();
    observed.__THREE_DEVTOOLS__.addEventListener("observe", event => {
      const object = (event as CustomEvent).detail;
      if (!object.isWebGLRenderer) return;
      const render = object.render.bind(object);
      object.render = (scene: any, camera: any) => {
        if ((camera.fov === 44 || camera.fov === 30)) observed.titleScene = scene;
        return render(scene, camera);
      };
    });
  });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  for (const scene of ["arrival", "return"]) {
    if (scene === "return") {
      await page.locator("#title-free-sail").click();
      await expect(page.locator("#welcome")).toBeHidden();
      await page.locator("#conditions-toggle").click();
      await page.locator("#settings-main-menu").click();
      await expect(page.locator("#welcome")).toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => {
      const root = (window as any).titleScene?.getObjectByName("BoatAssetRoot");
      const flow: number[] = [];
      root?.traverse((object: any) => {
        if (!object.isMesh || !object.material?.uniforms?.uLuff) return;
        for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
        flow.push(object.material.uniforms.uLuff.value, object.material.uniforms.uStall.value);
      });
      return flow.length ? Math.max(...flow) : Infinity;
    })).toBeLessThan(0.1);
    await page.screenshot({ path: resolve(evidence, `wind-consistent-${scene}.png`) });
  }
  expect(errors).toEqual([]);
});
