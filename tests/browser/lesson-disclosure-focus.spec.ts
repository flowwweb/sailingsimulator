import { expect, test } from "@playwright/test";

for (const [name, width, height] of [["desktop", 1672, 941], ["phone", 844, 390]] as const) {
  test(`lesson targets remain in the keyboard loop at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#set-sail").click();
    const start = page.locator("#start-lesson");
    const back = page.locator("#lesson-chooser-close");
    const details = page.locator("#lesson-chooser .lesson-detail");
    const summary = details.locator("summary");

    await start.focus();
    await page.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Space");
    await expect(details).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(start).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#set-sail")).toBeFocused();
  });
}
