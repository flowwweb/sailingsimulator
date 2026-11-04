import { expect, test } from "@playwright/test";
for (const [name, width, height] of [["desktop", 1672, 941], ["phone", 844, 390]] as const) {
  test(`lesson tiles are keyboard accessible at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#set-sail").click();
    await expect(page.locator("#start-first-buoy")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#lesson-chooser-close")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#start-crossing")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#set-sail")).toBeFocused();
    await page.locator("#set-sail").click();
    await page.keyboard.press("Enter");
    await expect(page.locator("#welcome")).toBeHidden();
  });
}
