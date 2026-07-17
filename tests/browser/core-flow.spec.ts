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

test("core sailing composition matches the visual baseline", async ({
  page,
}, testInfo) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?preview=game&freeze=1");
  await expect(page.locator("#lake")).toBeVisible();
  const frozenAt = await page.locator(".game-shell").getAttribute(
    "data-simulation-time",
  );
  await page.waitForTimeout(900);
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-time",
    frozenAt ?? "0.000",
  );
  await expect(page).toHaveScreenshot(
    `core-sailing-${testInfo.project.name}.png`,
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.015,
      threshold: 0.25,
    },
  );
  expect(runtimeErrors).toEqual([]);
});

test("impact composition keeps the boat and hazard readable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?preview=impact&freeze=1");
  await expect(page.locator("#incident")).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page).toHaveScreenshot("impact-composition-desktop.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.015,
    threshold: 0.25,
  });
  expect(runtimeErrors).toEqual([]);
});

test("Space fast-forwards at 2x only while held", async ({ page }) => {
  await page.goto("/?preview=game");
  const gameShell = page.locator(".game-shell");
  await expect(gameShell).toHaveAttribute("data-time-scale", "1");

  await page.keyboard.down("Space");
  await expect(gameShell).toHaveAttribute("data-time-scale", "2");

  await page.keyboard.up("Space");
  await expect(gameShell).toHaveAttribute("data-time-scale", "1");
});

test("live minimap stays visible while sailing", async ({ page }) => {
  await page.goto("/?preview=game");
  await expect(page.locator("#minimap")).toBeVisible();
});

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
  await expect(page.locator(".title-menu-item")).toHaveCount(3);
  await expect(page.locator("#set-sail")).toHaveClass(/is-selected/);
  await expect(page.locator(".title-audio-note")).toHaveCount(0);
  const titleMute = page.locator("#title-mute");
  await expect(titleMute).toBeVisible();
  await expect(titleMute).toHaveAttribute("aria-label", "Mute sound");
  await titleMute.click();
  await expect(titleMute).toHaveAttribute("aria-pressed", "true");
  await expect(titleMute).toHaveAttribute("aria-label", "Unmute sound");
  await titleMute.click();
  await expect(titleMute).toHaveAttribute("aria-pressed", "false");
  const selectedFontSize = await page.locator("#set-sail").evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize),
  );
  const idleFontSize = await page.locator("#new-journey").evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(selectedFontSize).toBeGreaterThan(idleFontSize);

  const firstFrame = await page.locator("#lake").screenshot();
  await page.waitForTimeout(850);
  const secondFrame = await page.locator("#lake").screenshot();
  expect(firstFrame.equals(secondFrame)).toBe(false);

  await page.locator("#title-settings").click();
  await expect(page.locator("#conditions-panel")).toHaveClass(/is-open/);
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-paused",
    "false",
  );
  const settingsTitleFrame = await page.locator("#lake").screenshot();
  await page.waitForTimeout(850);
  const settingsTitleNextFrame = await page.locator("#lake").screenshot();
  expect(settingsTitleFrame.equals(settingsTitleNextFrame)).toBe(false);
  await page.locator("#conditions-close").click();
  await expect(page.locator("#conditions-panel")).not.toHaveClass(/is-open/);
  await page.waitForTimeout(250);

  const mobile = testInfo.project.name === "mobile-chrome";
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      mobile
        ? "browser-title-mobile-390x844.png"
        : "browser-title-desktop-1440x900.png",
    ),
  });

  await page.locator("#set-sail").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#new-journey")).toHaveClass(/is-selected/);
  await expect(page.locator("#new-journey")).toHaveCSS(
    "outline-style",
    "none",
  );
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#set-sail")).toHaveClass(/is-selected/);
  expect(runtimeErrors).toEqual([]);
});

test("starter dinghy presents as a coherent open mainsail trainer", async ({
  page,
}, testInfo) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);
  await expect(page.locator("#boat-select")).toHaveValue("harbor-20");
  await expect(page.locator("#sail-plan-label")).toHaveText("Mainsail");
  if (testInfo.project.name === "mobile-chrome") {
    await expect(page.locator("#reef-sail")).toBeHidden();
    await expect(page.locator("#toggle-sails")).toBeHidden();
  }
  await page.locator("#conditions-toggle").click();
  await page.locator('[data-ui-tab="weather"]').click();
  await page.locator("#weather-mode").selectOption("manual");
  await page.locator('[data-ui-tab="sky"]').click();
  await setRange(page, "#time-of-day", "15.5");
  await setRange(page, "#cloud", "0.18");
  await page.locator("#conditions-close").click();
  await page.waitForTimeout(1_200);

  const mobile = testInfo.project.name === "mobile-chrome";
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      mobile
        ? "browser-dinghy-mobile-390x844.png"
        : "browser-dinghy-desktop-1440x900.png",
    ),
  });
  expect(runtimeErrors).toEqual([]);
});

test("reefing and lowering sails change the live rig state", async ({
  page,
}, testInfo) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  await page.keyboard.press("KeyQ");
  await expect(page.locator("#reef-sail")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#sail-plan-label")).toContainText("Reefed");
  await page.waitForTimeout(1_350);
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      `browser-reefed-${testInfo.project.name}.png`,
    ),
  });

  await page.keyboard.press("KeyX");
  await expect(page.locator("#toggle-sails")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#toggle-sails")).toHaveAttribute(
    "aria-label",
    "Hoist sails (X)",
  );
  await page.waitForTimeout(1_250);
  await expect(page.locator("#flow-state")).toHaveText("Lowered");
  await expect(page.locator("#sail-plan-label")).toHaveText("Sails down");
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      `browser-sails-lowered-${testInfo.project.name}.png`,
    ),
  });

  await page.keyboard.press("KeyX");
  await expect(page.locator("#toggle-sails")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#flow-state")).toHaveText(
    /Hoisting|Shaking out|Reefing/,
  );
  expect(runtimeErrors).toEqual([]);
});

test("nautical chart exposes accurate lake areas and selectable courses", async ({
  page,
}, testInfo) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  await page.locator("#map-toggle").click();
  const chart = page.locator("#chart-panel");
  await expect(chart).toHaveClass(/is-open/);
  await expect(chart).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-paused",
    "true",
  );
  await expect(page.locator("#lake-chart")).toBeVisible();
  await expect(page.locator(".chart-activity")).toHaveCount(7);
  await expect(page.locator('[data-activity-id="channel-departure"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const bounds = await chart.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);

  await page.locator('[data-activity-id="pine-passage-rounding"]').click();
  await expect(page.locator('[data-activity-id="pine-passage-rounding"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#chart-course-readout")).toContainText(
    "Round Pine Islet",
  );
  await expect(page.locator("#destination-name")).toHaveText("Round Pine Islet");

  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      `browser-chart-${testInfo.project.name}.png`,
    ),
  });

  await page.keyboard.press("KeyN");
  await expect(chart).not.toHaveClass(/is-open/);
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-paused",
    "false",
  );
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
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-paused",
    "true",
  );
  const pausedAt = await page.locator(".game-shell").getAttribute(
    "data-simulation-time",
  );
  await page.waitForTimeout(500);
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-time",
    pausedAt ?? "",
  );

  await page.locator("#boat-select").selectOption("coastal-28");
  await expect(page.locator("#sail-plan-label")).toContainText("Main + jib", {
    ignoreCase: true,
  });
  await page.locator('[data-ui-tab="water"]').click();
  await page.locator("#sea-state").selectOption("rough");
  await page.locator("#conditions-close").click();
  await expect(page.locator("#conditions-panel")).not.toHaveClass(/is-open/);
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-paused",
    "false",
  );
  await page.waitForTimeout(250);
  await expect(page.locator(".game-shell")).not.toHaveAttribute(
    "data-simulation-time",
    pausedAt ?? "",
  );

  await page.reload();
  await expect(page.locator("#boat-select")).toHaveValue("coastal-28");
  await expect(page.locator("#sail-plan-label")).toContainText("Main + jib", {
    ignoreCase: true,
  });
  await page.locator("#set-sail").click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator("#flow-state")).toBeVisible();

  await page.locator("#conditions-toggle").click();
  await page.locator("#settings-main-menu").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator(".game-shell")).toHaveClass(/is-welcome/);
  await page.locator("#set-sail").click();
  await expect(page.locator("#welcome")).toBeHidden();

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
  await page.locator('[data-ui-tab="weather"]').click();
  await page.locator("#weather-mode").selectOption("manual");
  await setRange(page, "#wind-speed", "10.5");
  await setRange(page, "#wind-direction", "225");
  await setRange(page, "#gust", "0.3");
  await page.locator('[data-ui-tab="water"]').click();
  await page.locator("#sea-state").selectOption("storm");
  await page.locator('[data-ui-tab="sky"]').click();
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

test("optional mobile controls can be enabled from settings", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  const controls = page.locator(".controls [data-control]");
  await expect(controls).toHaveCount(4);
  for (const control of await controls.all()) await expect(control).toBeHidden();

  await page.locator("#conditions-toggle").tap();
  await page.locator('[data-ui-tab="controls"]').tap();
  await page.locator("#touch-controls-enabled").check();
  await page.locator("#conditions-close").tap();
  for (const control of await controls.all()) await expect(control).toBeVisible();
  const sailActions = page.locator(".controls [data-sail-action]");
  await expect(sailActions).toHaveCount(2);
  for (const action of await sailActions.all()) await expect(action).toBeVisible();

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

  await page.locator("#reef-sail").tap();
  await expect(page.locator("#reef-sail")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#toggle-sails").tap();
  await expect(page.locator("#toggle-sails")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#toggle-sails").tap();
  await expect(page.locator("#toggle-sails")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#reef-sail").tap();
  await expect(page.locator("#reef-sail")).toHaveAttribute("aria-pressed", "false");

  await page.screenshot({
    path: resolve(visualQaDirectory, "browser-mobile-390x844.png"),
  });
  expect(runtimeErrors).toEqual([]);
});

test("production glass settings surface renders cleanly", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?preview=game&section=weather");
  await page.locator("#conditions-toggle").click();
  const modal = page.locator("#conditions-panel");
  await expect(modal).toBeVisible();
  await page.locator('[data-ui-tab="weather"]').click();
  await expect(page.locator("#settings-weather")).toBeVisible();
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-simulation-paused",
    "true",
  );
  const bounds = await modal.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  await page.screenshot({
    path: resolve(visualQaDirectory, "settings-production-1440x900.png"),
  });

  expect(runtimeErrors).toEqual([]);
});

test("glass settings remain usable on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?preview=game");
  await page.locator("#conditions-toggle").tap();
  await page.locator('[data-ui-tab="sound"]').tap();
  await expect(page.locator("#conditions-panel")).toBeVisible();
  await expect(page.locator("#settings-sound")).toBeVisible();
  await expect(page.locator("#settings-resume")).toBeVisible();
  await page.screenshot({
    path: resolve(visualQaDirectory, "settings-production-mobile-390x844.png"),
  });

  expect(runtimeErrors).toEqual([]);
});
