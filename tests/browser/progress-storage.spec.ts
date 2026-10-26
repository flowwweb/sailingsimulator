import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(info.project.name.includes("mobile") ? { width: 844, height: 390 } : { width: 1440, height: 900 });
});

const warning = "Browser storage is unavailable. Progress may not survive reload.";
const saved = { version: 1, academyCompleted: false, activities: {}, voyages: 2, distanceSailed: 200,
  academyObjective: 3, academyLesson: 1, completedObjectives: [0, 1, 2], completedLessons: [0] };

async function expectFrames(page: Page) {
  const shell = page.locator(".game-shell");
  const before = await shell.getAttribute("data-simulation-time");
  await expect(shell).not.toHaveAttribute("data-simulation-time", before!);
}

for (const mode of ["getter", "methods", "quota"] as const) {
  const denyReads = mode !== "quota";
  test(`${mode} storage failure preserves boot, Start/Continue and menu navigation`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ failure, raw }) => {
      if (failure === "getter") Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new Error("Storage denied"); },
      });
      else if (failure === "methods") Storage.prototype.getItem = function () { throw new Error("Storage denied"); };
      else localStorage.setItem("fair-winds-progress-v1", raw);
      Storage.prototype.setItem = function () { throw new Error("Storage unavailable"); };
    }, { failure: mode, raw: JSON.stringify(saved) });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    if (denyReads) {
      await page.locator("#set-sail").click();
      await page.locator("#start-lesson").click();
    } else await page.locator("#continue-lesson").click();
    await expect(page.locator("#welcome")).toBeHidden();
    await expectFrames(page);
    await expect(page.locator("#status")).toContainText(warning);
    await page.locator("#conditions-toggle").click();
    await page.locator("#settings-main-menu").click();
    await page.locator("#title-logbook").click();
    await expect(page.locator("#title-logbook-stats")).toContainText(denyReads ? "1 voyages" : "3 voyages");
    await expect(page.locator("#title-logbook-stats")).toContainText(warning);
    await page.keyboard.press("Escape");
    await page.locator("#continue-lesson").click();
    await expect(page.locator("#welcome")).toBeHidden();
    await expectFrames(page);
    if (!denyReads) {
      await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "close-hauled");
      await page.locator("#conditions-toggle").click();
      await page.locator("#settings-main-menu").click();
      await page.locator("#new-journey").click();
      await page.locator("#start-lesson").click();
      await expect(page.locator("#welcome")).toBeHidden();
      await expectFrames(page);
      await page.locator("#conditions-toggle").click();
      await page.locator('[data-ui-tab="weather"]').click();
      await page.locator("#wind-speed").press("Home");
      await page.locator("#settings-resume").click();
      await expectFrames(page);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v1")!))).toEqual(saved);
    }
    expect(errors).toEqual([]);
  });
}

test("earned-objective save failure keeps subsequent frames and session mastery", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "fair-winds-progress-v1") {
        document.documentElement.dataset.attemptedProgress = value;
        throw new Error("Quota exceeded");
      }
      setItem.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await page.locator("#set-sail").click();
  await page.locator("#start-lesson").click();
  await expect(page.locator("#welcome")).toBeHidden();
  const held = new Set<string>();
  const start = Date.now();
  try {
    while (Date.now() - start < 90_000) {
      if (await page.locator(".game-shell").getAttribute("data-academy-stage") !== "trim") break;
      const controls = await page.evaluate(() => {
        const angle = parseFloat((document.querySelector("#wind-arrow") as HTMLElement).style.transform.replace("rotate(", ""));
        const sheet = parseFloat((document.querySelector("#trim-marker") as HTMLElement).style.top) / 100;
        const target = parseFloat((document.querySelector("#trim-target") as HTMLElement).style.top) / 100;
        return { angle, sheet, target };
      });
      const wanted = new Set([
        controls.angle > 103 ? "KeyD" : controls.angle < 97 ? "KeyA" : "",
        controls.target - controls.sheet > .018 ? "KeyW" : controls.target - controls.sheet < -.018 ? "KeyS" : "",
      ].filter(Boolean));
      for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      await page.waitForTimeout(50);
    }
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
  await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "stall");
  const attempted = await page.evaluate(() => JSON.parse(document.documentElement.dataset.attemptedProgress!));
  expect(attempted.completedObjectives).toContain(0);
  await expectFrames(page);
  await page.locator("#conditions-toggle").click();
  await page.locator("#settings-main-menu").click();
  await page.locator("#continue-lesson").click();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "stall");
  await expectFrames(page);
  expect(await page.evaluate(() => localStorage.getItem("fair-winds-progress-v1"))).toBeNull();
  expect(errors).toEqual([]);
});
