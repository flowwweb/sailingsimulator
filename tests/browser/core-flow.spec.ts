import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const visualQaDirectory = resolve(".artifacts/visual-qa");
const externalBrowserRun = Boolean(process.env.PLAYWRIGHT_BASE_URL);

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

test("styled loading screen covers the app until its first rendered frame", async ({
  context,
  page,
}, testInfo) => {
  let releaseBundle!: () => void;
  const bundleGate = new Promise<void>((resolveGate) => {
    releaseBundle = resolveGate;
  });
  await page.route("**/assets/*.js", async (route) => {
    await bundleGate;
    await route.continue();
  });

  await page.goto("/", { waitUntil: "commit" });
  const loader = page.locator("#boot-loader");
  await expect(loader).toBeVisible();
  await expect(page.locator(".boot-spinner")).toBeVisible();
  await expect(loader).toHaveCSS("background-color", "rgb(24, 63, 76)");
  await expect(page.locator(".game-shell")).toHaveCSS("visibility", "hidden");
  const cdp = await context.newCDPSession(page);
  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  writeFileSync(
    resolve(
      visualQaDirectory,
      `loading-screen-${testInfo.project.name}.png`,
    ),
    Buffer.from(capture.data, "base64"),
  );

  releaseBundle();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(loader).toHaveCount(0);
  await expect(page.locator(".game-shell")).toHaveCSS("visibility", "visible");
});

test("core sailing composition matches the visual baseline", async ({
  page,
}, testInfo) => {
  test.skip(externalBrowserRun, "Frozen preview fixtures run against localhost only.");
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

test("live compass tape rotates with helm input", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);
  const tape = page.locator("#heading-tape");
  await expect(tape).toBeVisible();
  const initialTransform = await tape.getAttribute("style");

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyD");
  await expect(tape).not.toHaveAttribute("style", initialTransform ?? "");
  expect(runtimeErrors).toEqual([]);
});

test("Juniper Harbor presents a sheltered visitor berth", async ({
  page,
}, testInfo) => {
  test.skip(externalBrowserRun, "Harbor visual fixture runs against localhost only.");
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?preview=game&freeze=1&landmark=juniper-harbor");
  await expect(page.locator("#lake")).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      `browser-juniper-harbor-${testInfo.project.name}.png`,
    ),
  });
  expect(runtimeErrors).toEqual([]);
});

test("Juniper visitor berth holds a docked boat", async ({ page }) => {
  test.skip(externalBrowserRun, "Docked preview fixture runs against localhost only.");
  await page.goto(
    "/?preview=game&landmark=juniper-harbor&docked=1&freeze=1",
  );
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-docked-at",
    "juniper-cove-dock",
  );
  await expect(page.locator("#destination-name")).toHaveText(
    "Juniper arrival",
  );
});

test("scored docking debrief is written to the local logbook", async ({
  page,
}, testInfo) => {
  test.skip(externalBrowserRun, "Docked scoring fixture runs against localhost only.");
  test.skip(testInfo.project.name !== "desktop-chrome");
  await page.goto(
    "/?preview=game&landmark=juniper-harbor&docked=1",
  );
  await page.locator("#map-toggle").click();
  await page.locator('[data-activity-id="juniper-arrival"]').click();
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-activity-score",
    /\d+/,
  );
  await expect(page.locator("#lesson-instruction")).toContainText("Safety");
  await expect(
    page.locator('[data-activity-id="juniper-arrival"]'),
  ).toHaveClass(/is-complete/);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fair-winds-progress-v1") ?? "{}"),
  );
  expect(stored.activities["juniper-arrival"].completions).toBe(1);
});

test("impact composition keeps the boat and hazard readable", async ({
  page,
}, testInfo) => {
  test.skip(externalBrowserRun, "Frozen preview fixtures run against localhost only.");
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
  await beginLesson(page);
  const gameShell = page.locator(".game-shell");
  await expect(gameShell).toHaveAttribute("data-time-scale", "1");

  await page.keyboard.down("Space");
  await expect(gameShell).toHaveAttribute("data-time-scale", "2");

  await page.keyboard.up("Space");
  await expect(gameShell).toHaveAttribute("data-time-scale", "1");
});

test("live minimap stays visible while sailing", async ({ page }) => {
  await beginLesson(page);
  await expect(page.locator("#minimap")).toBeVisible();
});

test("academy, live activity coaching, and forecast form one learning loop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-academy-stage",
    /trim|stall|recover|close-hauled|beam-reach|broad-reach|tack|gybe|reef|complete/,
  );
  await page.locator("#map-toggle").click();
  await page.locator('[data-activity-id="school-water-tacks"]').click();
  await expect(page.locator(".game-shell")).toHaveAttribute(
    "data-active-activity",
    "school-water-tacks",
  );
  await expect(page.locator("#lesson-title")).toHaveText("Two clean tacks");
  await expect(page.locator("#lesson-instruction")).toContainText("2 clean tacks");
  await page.locator("#chart-close").click();

  await page.locator("#conditions-toggle").click();
  await page.locator('[data-ui-tab="weather"]').click();
  await expect(page.locator("#forecast-summary")).toContainText("Wind");
  await expect(page.locator("#forecast-advice")).not.toBeEmpty();
  expect(runtimeErrors).toEqual([]);
});

test("high contrast and installable shell persist cleanly", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  await beginLesson(page);
  await page.locator("#conditions-toggle").click();
  await page.locator('[data-ui-tab="controls"]').click();
  await page.locator("#high-contrast-enabled").check();
  await expect(page.locator(".game-shell")).toHaveClass(/is-high-contrast/);
  await page.reload();
  await expect(page.locator(".game-shell")).toHaveClass(/is-high-contrast/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transitionDuration = await page
    .locator("#set-sail")
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.01);

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  const serviceWorker = await request.get("/sw.js");
  expect(serviceWorker.ok()).toBe(true);
  expect(await serviceWorker.text()).toContain('url.pathname.startsWith("/music/")');
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
    await expect(page.locator("#reef-sail")).toBeVisible();
    await expect(page.locator("#toggle-sails")).toBeVisible();
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

test("North Light and its trees meet the headland terrain", async ({
  page,
}, testInfo) => {
  test.skip(externalBrowserRun, "Headland visual fixture runs against localhost only.");
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/?preview=game&freeze=1&landmark=north-light");
  await expect(page.locator("#lake")).toBeVisible();
  await page.waitForTimeout(1_200);
  await page.screenshot({
    path: resolve(
      visualQaDirectory,
      `browser-north-light-${testInfo.project.name}.png`,
    ),
  });
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

test("mobile controls are available by default and drive the boat", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome");
  const runtimeErrors = collectRuntimeErrors(page);
  await beginLesson(page);

  const controls = page.locator(".controls [data-control]");
  await expect(controls).toHaveCount(4);
  for (const control of await controls.all()) {
    await expect(control).toBeVisible();
    const target = await control.boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
  }

  await page.locator("#conditions-toggle").tap();
  await page.locator('[data-ui-tab="controls"]').tap();
  await expect(page.locator("#touch-controls-enabled")).toBeChecked();
  await page.locator("#touch-controls-enabled").uncheck();
  await page.locator("#conditions-close").tap();
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

  const starboard = page.locator('[data-control="starboard"]');
  const helmBox = await starboard.boundingBox();
  expect(helmBox).not.toBeNull();
  const helmX = helmBox!.x + helmBox!.width / 2;
  const helmY = helmBox!.y + helmBox!.height / 2;
  const initialMotion = await page.locator("#motion-readout").textContent();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: helmX, y: helmY, radiusX: 8, radiusY: 8, force: 1 },
    ],
  });
  await page.waitForTimeout(550);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator("#motion-readout")).not.toHaveText(
    initialMotion ?? "",
  );

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
  await beginLesson(page);
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
  await beginLesson(page);
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
