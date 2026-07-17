import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const visualQaDirectory = resolve(".artifacts/visual-qa");

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function beginLesson(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#set-sail")).toBeVisible();
  await page.locator("#set-sail").click();
  await expect(page.locator(".game-shell")).not.toHaveClass(/is-welcome/);
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#flow-state")).toBeVisible();
}

async function setRange(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test.beforeAll(() => mkdirSync(visualQaDirectory, { recursive: true }));

test("cinematic title scene uses the supplied identity and remains animated", async ({
  page,
}, testInfo) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/");
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator(".welcome-brand")).toHaveJSProperty(
    "complete",
    true,
  );
  await expect(page.locator(".title-menu-item")).toHaveCount(4);
  await expect(page.locator("#set-sail")).toHaveClass(/is-selected/);

  const firstFrame = await page.locator("#lake").screenshot();
  await page.waitForTimeout(850);
  const secondFrame = await page.locator("#lake").screenshot();
  expect(firstFrame.equals(secondFrame)).toBe(false);

  const mobile = testInfo.project.name === "mobile-chrome";
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      mobile
        ? "browser-title-mobile-390x844.png"
        : "browser-title-desktop-1440x900.png",
    ),
  });

  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#new-journey")).toHaveClass(/is-selected/);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#set-sail")).toHaveClass(/is-selected/);
  expect(runtimeErrors).toEqual([]);
});

test("desktop launch, sail controls, settings, boats, and persistence stay coherent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  const initialBoom = await page.locator("#boom-readout").textContent();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(550);
  await page.keyboard.up("KeyW");
  await expect(page.locator("#boom-readout")).not.toHaveText(initialBoom ?? "");

  await page.keyboard.press("KeyC");
  await expect(page.locator("#conditions-panel")).toHaveClass(/is-open/);
  await expect(page.locator("#conditions-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.locator("#boat-select").selectOption("coastal-28");
  await expect(page.locator("#sail-plan-label")).toContainText("Main + jib", {
    ignoreCase: true,
  });
  await page.locator("#sea-state").selectOption("rough");
  await page.locator("#conditions-close").click();
  await expect(page.locator("#conditions-panel")).not.toHaveClass(/is-open/);

  await page.reload();
  await expect(page.locator("#boat-select")).toHaveValue("coastal-28");
  await expect(page.locator("#sail-plan-label")).toContainText("Main + jib", {
    ignoreCase: true,
  });
  await page.locator("#set-sail").click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#flow-state")).toBeVisible();

  await page.screenshot({
    path: resolve(visualQaDirectory, "browser-desktop-1440x900.png"),
  });
  expect(runtimeErrors).toEqual([]);
});

test("night, rain, and Storm conditions reach the rendered game", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  await page.locator("#conditions-toggle").click();
  await page.locator("#weather-mode").selectOption("manual");
  await setRange(page, "#wind-speed", "10.5");
  await setRange(page, "#wind-direction", "225");
  await setRange(page, "#gust", "0.3");
  await page.locator("#sea-state").selectOption("storm");
  await setRange(page, "#time-of-day", "22");
  await setRange(page, "#rain", "0.72");
  await setRange(page, "#cloud", "0.76");
  await expect(page.locator("#time-of-day-output")).toHaveText("22:00");
  await expect(page.locator("#rain-output")).toHaveText("72%");
  await expect(page.locator("#wind-speed-output")).toHaveText("10.5 m/s");
  await expect(page.locator("#wind-direction-output")).toHaveText("225°");
  await page.locator("#conditions-close").click();
  await page.waitForTimeout(1_200);

  await page.screenshot({
    path: resolve(visualQaDirectory, "browser-night-storm-1440x900.png"),
  });
  expect(runtimeErrors).toEqual([]);
});

test("mobile touch helm and sheet controls remain usable at 390 by 844", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  const controls = page.locator(".controls [data-control]");
  await expect(controls).toHaveCount(4);
  for (const control of await controls.all()) await expect(control).toBeVisible();

  const ease = page.locator('[data-control="ease"]');
  const box = await ease.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const initialBoom = await page.locator("#boom-readout").textContent();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
  });
  await page.waitForTimeout(550);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator("#boom-readout")).not.toHaveText(initialBoom ?? "");

  await page.locator("#conditions-toggle").tap();
  await expect(page.locator("#conditions-panel")).toHaveClass(/is-open/);
  await page.locator("#conditions-close").tap();
  await expect(page.locator("#conditions-panel")).not.toHaveClass(/is-open/);

  await page.screenshot({
    path: resolve(visualQaDirectory, "browser-mobile-390x844.png"),
  });
  expect(runtimeErrors).toEqual([]);
});
