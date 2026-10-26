import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve(".artifacts/approved-menus");
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await page.screenshot({ path: resolve(evidence, `failed-${info.title.replace(/[^a-z0-9]+/gi, "-")}.png`) });
});

for (const scale of [1, 2]) {
  test(`title action anchors match the reference at ${scale}x CSS size`, async ({ page }) => {
    await page.setViewportSize({ width: 826 * scale, height: 432 * scale });
    await page.goto('/');
    await expect(page.locator('#boot-loader')).toHaveCount(0);
    for (const [id, x, y, width, height] of [
      ['set-sail', 94, 227, 213, 46],
      ['title-free-sail', 94, 284, 213, 42],
    ] as const) {
      const bounds = (await page.locator(`#${id}`).boundingBox())!;
      for (const [actual, target] of [[bounds.x, x * scale], [bounds.y, y * scale], [bounds.width, width * scale], [bounds.height, Math.max(44, height * scale)]]) {
        expect(Math.abs(actual - target)).toBeLessThanOrEqual(2);
      }
    }
    await page.screenshot({ path: resolve(evidence, `anchors-${scale}x.png`) });
  });
}

for (const [label, width, height] of [["desktop", 1672, 941], ["phone-landscape", 844, 390]] as const) {
  test(`approved arrival, lesson selection and free sail at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#set-sail")).toHaveText("Learn to sail");
    await expect(page.locator("#continue-lesson")).toBeHidden();
    for (const id of ["set-sail", "title-free-sail", "title-logbook", "title-settings"]) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.mouse.move(width - 2, height - 2);
    await page.screenshot({ path: resolve(evidence, `title-${label}.png`) });
    await page.locator("#title-logbook").click();
    await expect(page.locator("#title-logbook-panel")).toBeVisible();
    await expect(page.locator("#title-logbook-lessons li")).toHaveCount(3);
    await expect(page.locator("#title-logbook-stats")).toContainText("0 voyages");
    await page.keyboard.press("Escape");
    await expect(page.locator("#title-logbook")).toBeFocused();
    await page.locator("#set-sail").click();
    const chooser = page.locator("#lesson-chooser");
    await expect(chooser).toBeVisible();
    await expect(page.locator("[data-lesson]")).toHaveCount(3);
    for (const card of await page.locator("[data-lesson]").all()) {
      const cardBox = (await card.boundingBox())!;
      const imageBox = (await card.locator(".lesson-image").boundingBox())!;
      expect(cardBox.width - imageBox.width).toBeLessThanOrEqual(4);
    }
    await page.locator('[data-lesson="1"]').click();
    await expect(page.locator('[data-lesson="1"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator(".lesson-detail summary").click();
    await expect(page.locator("#chosen-lesson-targets li")).toHaveCount(3);
    await expect(page.locator("#chosen-lesson-targets")).toContainText("Beam reach");
    await page.locator(".lesson-detail summary").click();
    const start = (await page.locator("#start-lesson").boundingBox())!;
    const cards = (await page.locator(".lesson-choices").boundingBox())!;
    expect(start.y - (cards.y + cards.height)).toBeGreaterThan(8);
    expect(start.y + start.height).toBeLessThan(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.mouse.move(width - 2, height - 2);
    await page.screenshot({ path: resolve(evidence, `chooser-${label}.png`) });
    await page.locator("#start-lesson").click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "close-hauled");
    await expect(page.locator("#lesson-eyebrow")).toHaveText("Lesson 2 of 3 · Objective 1 of 3");
    await expect(page.locator('.wind-instrument .label')).toHaveText('Apparent wind');
    await expect(page.locator('#lesson-instruction')).toContainText('wind felt on the moving boat');
    await expect(page.locator("#welcome")).toBeHidden();
    await page.locator("#conditions-toggle").click();
    await page.locator("#settings-main-menu").click();
    await expect(page.locator("#continue-lesson")).toBeVisible();
    await expect(page.locator("#returning-lesson")).toHaveText("Find your course");
    await page.locator("#title-free-sail").click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "free-sail");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v1")!));
    expect(saved.academyCompleted).toBe(false);
    expect(saved.academyObjective).toBe(3);
    expect(errors).toEqual([]);
  });

  test(`returning player resumes stored target and can choose lesson three at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem("fair-winds-progress-v1", JSON.stringify({ version: 1, academyCompleted: false, academyObjective: 4, academyLesson: 1, completedObjectives: [0, 1, 2, 3], completedLessons: [0], activities: {}, voyages: 2, distanceSailed: 540 })));
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#returning-lesson")).toHaveText("Find your course");
    await expect(page.locator("#returning-target")).toHaveText("Target 2 of 3 · Beam reach");
    await expect(page.locator("#set-sail")).toBeHidden();
    for (const id of ["continue-lesson", "new-journey", "title-free-sail", "title-logbook", "title-settings"]) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.mouse.move(width - 2, height - 2);
    await page.screenshot({ path: resolve(evidence, `returning-${label}.png`) });
    await page.locator("#continue-lesson").click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "beam-reach");
    await expect(page.locator("#lesson-eyebrow")).toHaveText("Lesson 2 of 3 · Objective 2 of 3");
    await page.locator("#conditions-toggle").click();
    await page.locator("#settings-main-menu").click();
    await page.locator("#new-journey").click();
    await page.locator('[data-lesson="2"]').click();
    await page.locator("#start-lesson").click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "tack");
    await expect(page.locator("#lesson-eyebrow")).toHaveText("Lesson 3 of 3 · Objective 1 of 3");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v1")!));
    expect(saved.completedLessons).toEqual([0]);
    expect(saved.academyCompleted).toBe(false);
  });
}

