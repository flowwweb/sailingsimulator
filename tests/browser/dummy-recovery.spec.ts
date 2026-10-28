import { expect, test } from "@playwright/test";

test("training exercise starts, interrupts and retries without earning completion", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#set-sail").click();
  await page.locator("#start-dummy-recovery").click();
  const shell = page.locator(".game-shell");
  await expect(shell).toHaveAttribute("data-academy-stage", "dummy-depart");
  await expect(page.locator("#lesson-title")).toHaveText("Recover the training dummy");
  await expect(page.locator("#recover-training-dummy")).toBeHidden();
  await page.locator("#conditions-toggle").click();
  await page.locator("#pause-toggle").click();
  await page.locator("#pause-resume").click();
  await expect(shell).toHaveAttribute("data-academy-stage", "dummy-depart");
  await page.locator("#status-toggle").click();
  await expect(page.locator("#lesson-skip")).toHaveText("Retry exercise");
  await page.locator("#lesson-skip").click();
  await expect(shell).toHaveAttribute("data-academy-stage", "dummy-depart");
  const completed = await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v1") ?? "{}").completedDummyRecovery);
  expect(completed).not.toBe(true);
});

test("dummy instructions and retry are visible on a short landscape phone", async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#set-sail").click();
  await page.locator("#start-dummy-recovery").click();
  await page.locator("#status-toggle").click();
  const scroll = (await page.locator("#status-scroll").boundingBox())!;
  for (const id of ["status-objective-detail", "lesson-skip"]) {
    const box = (await page.locator(`#${id}`).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(scroll.y);
    expect(box.y + box.height).toBeLessThanOrEqual(Math.min(scroll.y + scroll.height, 375));
  }
  expect((await page.locator("#lesson-skip").boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
