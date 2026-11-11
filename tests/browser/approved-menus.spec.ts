import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve(".artifacts/approved-menus");
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await page.screenshot({ path: resolve(evidence, `failed-${info.title.replace(/[^a-z0-9]+/gi, "-")}.png`) });
});

for (const [width, height] of [[1672, 941], [844, 390], [640, 360], [640, 320], [568, 320]] as const) {
  test(`F title keeps the scene clear and all actions reachable at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('#boot-loader')).toHaveCount(0);
    const menu = (await page.locator('.title-menu').boundingBox())!;
    const logo = (await page.locator('.welcome-brand').boundingBox())!;
    expect(menu.x).toBeGreaterThan(width * .55);
    expect(logo.x + logo.width).toBeLessThan(menu.x);
    const [primary, lessons, sail] = await Promise.all(['set-sail', 'new-journey', 'title-free-sail'].map(id => page.locator(`#${id}`).boundingBox()));
    expect(lessons!.y - primary!.y - primary!.height).toBeGreaterThanOrEqual(8);
    expect(sail!.y - lessons!.y - lessons!.height).toBeGreaterThanOrEqual(8);
    await expect(page.locator('#new-journey')).toHaveText('Lessons');
    await expect(page.locator('#title-logbook')).toHaveAccessibleName('Logbook');
    await expect(page.locator('#title-settings')).toHaveAccessibleName('Settings');
    await page.locator('#title-profile').click();
    const profile = page.locator('#player-profile-panel');
    await expect(profile).toBeVisible();
    await expect(profile).toHaveCSS('border-style', 'none');
    await expect(page.locator('#profile-rank')).toHaveText('Landlubber');
    await expect(page.locator('#profile-total-xp')).toHaveText('0 XP total');
    await expect.poll(() => page.locator('#profile-rank-badge').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(256);
    await expect(page.locator('#player-profile-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#player-profile-close')).toBeFocused();
    await page.screenshot({ path: resolve(evidence, `profile-${width}x${height}.png`) });
    await page.keyboard.press('Escape');
    await expect(profile).toBeHidden();
    await expect(page.locator('#title-profile')).toBeFocused();
    await page.screenshot({ path: resolve(evidence, `title-f-${width}x${height}.png`) });
  });
}

test("compact sailing objective and boat controls have separate hit targets", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  await expect(page.locator('#boot-loader')).toHaveCount(0);
  await page.locator('#new-journey').click();
  await page.locator('#start-dummy-recovery').click();
  await expect(page.locator('#status-toggle')).toContainText('Sail 40 m away');
  const status = (await page.locator('#status-toggle').boundingBox())!;
  const controls = (await page.locator('.sail-actions summary').boundingBox())!;
  expect(status.x).toBeGreaterThanOrEqual(controls.x + controls.width + 6);
  expect(controls.width).toBeGreaterThanOrEqual(44);
  expect(controls.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: resolve(evidence, 'compact-objective-controls.png') });
});

for (const [label, width, height] of [["desktop", 1672, 941], ["phone-landscape", 844, 390], ["small-landscape", 640, 360]] as const) {
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
    await expect(page.locator("#title-logbook-lessons li")).toHaveCount(6);
    await expect(page.locator("#title-logbook-lessons li").first()).toHaveText("Round the buoys · Not yet completed");
    await expect(page.locator("#title-logbook-stats")).toContainText("0 voyages");
    await page.keyboard.press("Escape");
    await expect(page.locator("#title-logbook")).toBeFocused();
    await page.locator("#set-sail").click();
    const chooser = page.locator("#lesson-chooser");
    await expect(chooser).toBeVisible();
    await expect(page.locator("#start-first-buoy")).toBeFocused();
    await expect(chooser).toHaveCSS("border-style", "none");
    await page.keyboard.press("Escape");
    await expect(chooser).toBeHidden();
    await expect(page.locator("#set-sail")).toBeFocused();
    await page.locator("#set-sail").click();
    await expect(page.locator(".lesson-choice")).toHaveCount(6);
    await expect(page.locator(".lesson-choice:disabled")).toHaveCount(0);
    await expect(page.locator("#start-crossing")).toContainText("Crossing traffic");
    await expect(page.locator("#start-lesson")).toHaveCount(0);
    const cards = await page.locator(".lesson-choice").all();
    const boxes = await Promise.all(cards.map(card => card.boundingBox()));
    expect(Math.abs(boxes[0]!.y - boxes[2]!.y)).toBeLessThan(2);
    expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y);
    for (const card of cards) {
      const cardBox = (await card.boundingBox())!;
      const imageBox = (await card.locator(".lesson-image").boundingBox())!;
      expect(cardBox.width - imageBox.width).toBeLessThanOrEqual(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(evidence, `chooser-${label}.png`) });
    await page.locator('[data-lesson="1"]').click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "close-hauled");
    await expect(page.locator("#lesson-eyebrow")).toHaveText("Lesson 2 of 6 · Objective 1 of 3");
    await expect(page.locator('.wind-instrument .label')).toHaveText('Apparent wind');
    await expect(page.locator('#lesson-instruction')).toContainText('wind felt on the moving boat');
    await expect(page.locator("#welcome")).toBeHidden();
    await page.locator("#conditions-toggle").click();
    await page.locator("#settings-main-menu").click();
    await expect(page.locator("#continue-lesson")).toBeVisible();
    await expect(page.locator("#continue-lesson")).toHaveText("Continue");
    await page.locator("#title-free-sail").click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "free-sail");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v2")!));
    expect(saved.academyCompleted).toBe(false);
    expect(saved.academyObjective).toBe(3);
    expect(errors).toEqual([]);
  });

  test(`returning player resumes stored target and can choose lesson three at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem("fair-winds-progress-v1", JSON.stringify({ version: 1, academyCompleted: false, academyObjective: 4, academyLesson: 1, completedObjectives: [0, 1, 2, 3], completedLessons: [0], activities: {}, voyages: 2, distanceSailed: 540 })));
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#continue-lesson")).toHaveText("Continue");
    await expect(page.locator("#title-profile")).toHaveAccessibleName(/Level 2, Deckhand, 100 XP/);
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
    await expect(page.locator("#lesson-eyebrow")).toHaveText("Lesson 2 of 6 · Objective 2 of 3");
    await expect(page.locator("#status-toggle")).toContainText("Settle on a beam reach");
    await page.locator("#conditions-toggle").click();
    await page.locator("#settings-main-menu").click();
    await page.locator("#new-journey").click();
    await page.locator('[data-lesson="2"]').click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "tack");
    await expect(page.locator("#lesson-eyebrow")).toHaveText("Lesson 3 of 6 · Objective 1 of 3");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v2")!));
    expect(saved.completedLessons).toEqual([0]);
    expect(saved.academyCompleted).toBe(false);
  });
}


for (const [width, height] of [[844, 390], [640, 360], [1920, 650]] as const) {
  test(`completed journey title actions fit at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem("fair-winds-progress-v1", JSON.stringify({
      version: 2, activeIntroduction: "intro.buoy-1", completedIntroductions: { "intro.buoy-1": 1, "intro.three-buoy-course": 1 },
      academyCompleted: false, academyObjective: 0, academyLesson: 0, completedObjectives: [], completedLessons: [], activities: {}, voyages: 1, distanceSailed: 400,
    })));
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#continue-lesson")).toHaveText("Continue");
    const logo = (await page.locator(".welcome-brand").boundingBox())!;
    const menu = (await page.locator(".title-menu").boundingBox())!;
    expect(menu.y - logo.y - logo.height).toBeGreaterThanOrEqual(8);
    const ids = ["continue-lesson", "new-journey", "title-free-sail", "title-logbook", "title-settings"];
    const [repeat, choose, sail, logbook, settings] = await Promise.all(ids.map(async id => {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(menu.y);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      return box;
    }));
    expect(choose.y - repeat.y - repeat.height).toBeGreaterThanOrEqual(6);
    expect(sail.y - choose.y - choose.height).toBeGreaterThanOrEqual(6);
    expect(settings.x - logbook.x - logbook.width).toBeGreaterThanOrEqual(6);
    expect(await page.locator("#welcome").evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.locator("#continue-lesson").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#new-journey")).toBeFocused();
  });
}
