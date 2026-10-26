import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve(".artifacts/title-settings");
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));

for (const [label, width, height] of [
  ["reference", 1672, 941],
  ["desktop", 1440, 900],
  ["app-panel", 976, 790],
  ["phone-landscape", 844, 390],
] as const) {
  test(`title and all Settings tabs at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#welcome")).toBeVisible();
    for (const id of ["set-sail", "title-free-sail", "title-settings"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await page.screenshot({ path: resolve(evidence, `title-${label}.png`) });
    await page.locator("#title-settings").click();
    const settings = page.locator("#conditions-panel");
    await expect(settings).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#welcome")).toBeHidden();
    await expect(settings.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    await expect(page.locator("#boat-select option")).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await expect(settings.locator('[data-ui-tab="weather"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(settings.locator('[data-ui-tab="water"]')).toBeFocused();
    await page.keyboard.press("End");
    await expect(settings.locator('[data-ui-tab="controls"]')).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(settings.locator('[data-ui-tab="boat"]')).toBeFocused();
    for (const section of ["boat", "weather", "water", "sky", "sound", "controls"]) {
      const tab = settings.locator(`[data-ui-tab="${section}"]`);
      await tab.click();
      const tabBox = (await tab.boundingBox())!;
      expect(tabBox.y).toBeGreaterThanOrEqual(0);
      expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(height);
      const panel = settings.locator(`[data-ui-panel="${section}"]`);
      await expect(panel).toBeVisible();
      if (section === "weather") {
        await expect(page.locator("#wind-speed-output")).toHaveText("14.6 kn");
        await expect(page.locator("#wind-direction-output")).toHaveText("90° · East");
        await expect(page.locator('.range-endpoints')).toHaveText('0°359°');
        const valueSize = await page.locator('#wind-speed-output').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        expect(valueSize).toBeCloseTo(height <= 600 ? 24 : Math.min(52, Math.max(24, width * .0311)), 1);
        const fill = await page.locator('#wind-direction').evaluate(el => parseFloat((el as HTMLElement).style.getPropertyValue('--range-fill')));
        expect(fill).toBeCloseTo(90 / 359 * 100, 2);
        await expect(page.locator('.forecast-card')).toHaveCount(0);
        await expect(page.locator('.weather-outlook, #forecast-summary')).toHaveCount(0);
        for (const id of ["wind-speed", "wind-direction"]) {
          const slider = page.locator(`#${id}`);
          const bounds = (await slider.boundingBox())!;
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(bounds.y + bounds.height).toBeLessThan((await page.locator('.settings-footer').boundingBox())!.y);
        }
        await page.locator('#wind-speed').focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#wind-speed')).toHaveValue('7.6');
        await expect(page.locator('#wind-speed-output')).toHaveText('14.8 kn');
        await expect(page.locator('#weather-preset')).toHaveValue('custom');
        await page.locator('#wind-direction').focus();
        await page.keyboard.press('Home');
        await expect(page.locator('#wind-direction-output')).toHaveText('0° · North');
        await page.keyboard.press('End');
        await expect(page.locator('#wind-direction-output')).toHaveText('359° · North');
        await page.locator('#weather-preset').selectOption({label:'Fair winds'});
        await expect(page.locator('#wind-speed')).toHaveValue('7.5');
        await expect(page.locator('#wind-direction')).toHaveValue('90');
        await page.locator('.weather-details summary').click();
        await expect(page.locator('#weather-seed')).toBeVisible();
        await page.locator('#restart-weather').scrollIntoViewIfNeeded();
        await expect(page.locator('#conditions-close')).toBeInViewport();
        await expect(page.locator('#settings-resume')).toBeInViewport();
        await page.screenshot({path:resolve(evidence,`weather-expanded-${label}.png`)});
        await page.locator('.weather-details summary').click();
        await page.locator('.settings-body').evaluate(el=>el.scrollTop=0);
      }
      await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
      await expect(settings.locator('[data-ui-panel]:visible')).toHaveCount(1);
      const panelBox = (await settings.boundingBox())!;
      expect(panelBox.x).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
      expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(height);
      await page.screenshot({ path: resolve(evidence, `settings-${section}-${label}.png`) });
    }
    await expect(settings.locator(".settings-brand")).toHaveCount(0);
    await page.locator("#high-contrast-enabled").check();
    await expect(page.locator(".game-shell")).toHaveClass(/is-high-contrast/);
    await page.locator("#settings-resume").click();
    await expect(page.locator("#title-settings")).toBeFocused();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#title-settings").click();
    await page.locator('[data-ui-tab="controls"]').click();
    await expect(page.locator("#high-contrast-enabled")).toBeChecked();
    expect(errors).toEqual([]);
  });
}

test("unavailable preference storage does not block title or Settings", async ({ page }) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "fair-winds-high-contrast" || key === "fair-winds-on-screen-controls") throw new Error("Storage unavailable");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "fair-winds-high-contrast" || key === "fair-winds-on-screen-controls") throw new Error("Storage unavailable");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-settings").click();
  await page.locator('[data-ui-tab="controls"]').click();
  await page.locator("#high-contrast-enabled").check();
  await expect(page.locator(".game-shell")).toHaveClass(/is-high-contrast/);
  await expect(page.locator("#status")).toContainText("Browser storage is unavailable");
});

test("canceling logbook reset preserves saved progress", async ({ page }) => {
  const saved = JSON.stringify({ version: 1, academyCompleted: true, activities: {}, voyages: 7, distanceSailed: 1234 });
  await page.addInitScript((raw) => localStorage.setItem("fair-winds-progress-v1", raw), saved);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-settings").click();
  await page.locator('[data-ui-tab="controls"]').click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#settings-reset-logbook").click();
  expect(await page.evaluate(() => localStorage.getItem("fair-winds-progress-v1"))).toBe(saved);
});

test("Settings controls update their values and pause/resume sailing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-settings").click();
  await page.locator('[data-ui-tab="weather"]').click();
  await page.locator("#wind-speed").press("Home");
  await expect(page.locator("#wind-speed-output")).toHaveText("1.9 kn");
  await page.locator('[data-ui-tab="water"]').click();
  await page.locator("#wave-mode").selectOption("manual");
  await page.locator("#wave-height").press("Home");
  await expect(page.locator("#wave-height-output")).toHaveText("0.03 m");
  await page.locator('[data-ui-tab="sky"]').click();
  await page.locator("#rain").press("End");
  await expect(page.locator("#rain-output")).toHaveText("100%");
  await page.locator('[data-ui-tab="sound"]').click();
  await page.locator("#master-volume").press("Home");
  await expect(page.locator("#master-volume-output")).toHaveText("0%");
  await page.locator("#settings-resume").click();
  await page.locator("#title-free-sail").click();
  await expect(page.locator(".game-shell")).not.toHaveClass(/is-welcome/);
  await page.locator("#conditions-toggle").click();
  const pausedAt = await page.locator(".game-shell").getAttribute("data-simulation-time");
  await page.waitForTimeout(300);
  await expect(page.locator(".game-shell")).toHaveAttribute("data-simulation-time", pausedAt!);
  await expect(page.locator("#settings-resume")).toHaveText("Resume sailing");
  await expect(page.locator("#settings-main-menu")).toBeVisible();
  await page.locator("#settings-resume").click();
  await expect(page.locator(".game-shell")).not.toHaveAttribute("data-simulation-time", pausedAt!);
});
