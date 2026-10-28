import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(info.project.name.includes("mobile")
    ? { width: 844, height: 390 } : { width: 1440, height: 900 });
});

test.afterEach(async ({ page }, info) => {
  if (!page.isClosed()) await info.attach("first-buoy-state", {
    body: await page.screenshot(), contentType: "image/png",
  });
});

async function readProgress(page: Page) {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("fair-winds-progress-v1") ?? "{}");
    return {
      version: saved.version,
      activeIntroduction: saved.activeIntroduction,
      firstBuoy: saved.completedIntroductions?.["intro.buoy-1"],
      completedLessons: saved.completedLessons ?? [],
      completedObjectives: saved.completedObjectives ?? [],
    };
  });
}

async function expectFreshJourney(page: Page) {
  const shell = page.locator(".game-shell");
  await expect(shell).toHaveAttribute("data-academy-stage", "intro-buoy-1");
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#lesson-title")).toBeVisible();
  await expect(page.locator("#lesson-title")).toHaveText("Reach the first buoy");
  const approach = page.locator("#status-lesson-progress");
  await expect(approach).toBeVisible();
  await expect(approach).toHaveText(/^Juniper buoy · \d+ m · \d{3}°$/);
  await expect(page.locator("#minimap")).toBeVisible();
  // School Water starts about 362 m from the existing Juniper buoy.
  const distance = Number.parseFloat((await approach.innerText()).split(" · ")[1]!);
  expect(distance).toBeGreaterThan(340);
  expect(distance).toBeLessThan(380);
  if (await page.locator("#status-toggle").getAttribute("aria-expanded") !== "true") {
    await page.locator("#status-toggle").click();
  }
  await expect(page.locator("#status-objective-detail")).toBeVisible();
  await expect(page.locator("#status-objective-detail")).toContainText(/Trim and steer toward Juniper buoy.*Juniper buoy · \d+ m · \d{3}°/);
  await page.locator("#status-close").click();
  const before = Number(await shell.getAttribute("data-simulation-time"));
  await expect.poll(async () => Number(await shell.getAttribute("data-simulation-time"))).toBeGreaterThan(before);
  const saved = await readProgress(page);
  expect(saved.activeIntroduction).toBe("intro.buoy-1");
  expect(saved.firstBuoy).toBeUndefined();
}

test("starting, pausing, retrying and reloading the first journey do not award completion", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#set-sail").click();
  await expect(page.locator("[data-lesson]")).toHaveCount(3);
  await page.locator("#start-first-buoy").click();
  await expectFreshJourney(page);

  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-screen")).toBeVisible();
  const paused = await readProgress(page);
  await page.locator("#pause-logbook").click();
  await expect(page.locator("#pause-logbook-lessons li").first()).toHaveText("Reach the first buoy · Not yet completed");
  expect(await readProgress(page)).toEqual(paused);
  await page.locator("#pause-logbook-back").click();
  await page.locator("#pause-resume").click();
  await expect(page.locator("#pause-screen")).toBeHidden();
  expect((await readProgress(page)).firstBuoy).toBeUndefined();

  await page.locator("#status-toggle").click();
  await expect(page.locator("#lesson-skip")).toHaveText("Retry journey");
  await page.locator("#lesson-skip").click();
  await expectFreshJourney(page);
  expect((await readProgress(page)).completedObjectives).toEqual([]);

  await page.reload();
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  expect((await readProgress(page)).firstBuoy).toBeUndefined();
  await expect(page.locator("#continue-lesson")).toHaveText("Continue journey");
  await page.locator("#continue-lesson").click();
  await expectFreshJourney(page);
  expect((await readProgress(page)).completedLessons).toEqual([]);
  expect(errors).toEqual([]);
});

test("completed legacy drills remain available and do not grant first-journey credit", async ({ page }) => {
  const earnedObjectives = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  await page.addInitScript(objectives => localStorage.setItem("fair-winds-progress-v1", JSON.stringify({
    version: 1, academyCompleted: true, academyObjective: 9, academyLesson: 2,
    completedObjectives: objectives, completedLessons: [0, 1, 2], activities: {}, voyages: 3, distanceSailed: 900,
  })), earnedObjectives);
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-logbook").click();
  const rows = page.locator("#title-logbook-lessons li");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveText("Reach the first buoy · Not yet completed");
  for (let index = 2; index <= 4; index++) await expect(rows.nth(index)).toContainText(" · Complete");
  await page.locator("#title-logbook-close").click();
  await page.locator("#continue-lesson").click();
  await expect(page.locator("#lesson-chooser")).toBeVisible();
  await expect(page.locator("[data-lesson]")).toHaveCount(3);
  await expect(page.locator('[data-lesson="0"]')).toContainText("Trim · Stall · Recover");
  await expect(page.locator('[data-lesson="1"]')).toContainText("Close-hauled · Beam reach · Broad reach");
  await expect(page.locator('[data-lesson="2"]')).toContainText("Tack · Gybe · Reef");
  await page.locator("#start-first-buoy").click();
  await expectFreshJourney(page);
  const saved = await readProgress(page);
  expect(saved.version).toBe(2);
  expect(saved.completedLessons).toEqual([0, 1, 2]);
  expect(saved.completedObjectives).toEqual(earnedObjectives);

  await page.locator("#conditions-toggle").click();
  await page.locator('[data-ui-tab="weather"]').click();
  await page.locator("#wind-speed").press("Home");
  await page.locator("#settings-resume").click();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "free-sail");
  const changedConditions = await readProgress(page);
  expect(changedConditions.activeIntroduction).toBeUndefined();
  expect(changedConditions.firstBuoy).toBeUndefined();
  expect(changedConditions.completedLessons).toEqual(saved.completedLessons);
  expect(changedConditions.completedObjectives).toEqual(saved.completedObjectives);
});
