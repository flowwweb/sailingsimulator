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
