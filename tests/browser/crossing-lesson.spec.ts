import { expect, test } from "@playwright/test";
for (const [label, width, height] of [["desktop", 1440, 900], ["landscape phone", 844, 390]] as const) {
  test(`crossing starts and retries without unearned XP at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#set-sail").click();
    await page.locator("#start-crossing").click();
    await expect(page.locator("#welcome")).toBeHidden();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "crossing-build-speed");
    await expect(page.locator("#lesson-instruction")).toContainText("045°");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fair-winds-progress-v1")!));
    expect(saved.completedCrossing).not.toBe(true);
    await page.locator("#reset").click();
    await expect(page.locator(".game-shell")).toHaveAttribute("data-academy-stage", "crossing-build-speed");
  });
}
