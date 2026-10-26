import { test, expect } from "@playwright/test";

for (const failure of ["missing", "corrupt", "interrupted"] as const) {
  test(`boat load ${failure} exposes recovery instead of an endless loader`, async ({ page }) => {
    await page.route("**/models/fair-winds-boat-v2.glb", route => failure === "interrupted"
      ? route.abort("failed") : route.fulfill({ status: failure === "missing" ? 404 : 200,
        contentType: "model/gltf-binary", body: "invalid model" }));
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#fatal-error")).toBeVisible();
    await expect(page.locator("#fatal-error")).toContainText("reload");
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "false");
    await page.screenshot({ path: `.artifacts/boat-${failure}.png` });
    await page.unroute("**/models/fair-winds-boat-v2.glb");
    await page.reload();
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await expect(page.locator("#fatal-error")).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
    await expect(page.locator("#set-sail")).toBeVisible();
  });
}
