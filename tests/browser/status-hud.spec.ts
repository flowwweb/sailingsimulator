import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve(".artifacts/status-hud");
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await page.screenshot({ path: resolve(evidence, `failed-${info.title.replace(/[^a-z0-9]+/gi, "-")}.png`) });
});
for (const [name, width, height] of [["desktop",1440,900],["phone",844,390]] as const) {
  test(`status disclosure and HUD placement at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#set-sail").click();
    await page.locator("#start-lesson").click();
    const toggle = page.locator("#status-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.locator(".top-actions").getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator('[data-ui-tab="controls"]').click();
    await page.locator("#touch-controls-enabled").check();
    await page.locator("#settings-resume").click();
    await expect(page.locator("#conditions-panel")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#conditions-panel")).toHaveCSS("opacity", "0");
    const selectors = ["#status-toggle", ".mini-map-hud", ".trim-instrument", ".lesson-card", ".navigation-hud", ".controls", ".speed-instrument", ".depth-readout"];
    const boxes = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    }
    for (let a=0; a<boxes.length; a++) for (let b=a+1; b<boxes.length; b++) {
      const x=boxes[a]!, y=boxes[b]!;
      expect(x.x+x.width <= y.x || y.x+y.width <= x.x || x.y+x.height <= y.y || y.y+y.height <= x.y, `${selectors[a]} overlaps ${selectors[b]}`).toBe(true);
    }
    // Near-shore visibility fixture checks the layout class used by actual depth updates.
    await page.locator('#depth-panel').evaluate(el=>el.classList.add('is-visible'));
    const depthPanel=(await page.locator('#depth-panel').boundingBox())!;
    for (const value of ['0.0','5.3','39','99+']) {
      await page.locator('#depth-readout').evaluate((el,value)=>{el.textContent=value;},value);
      const depthValue=(await page.locator('#depth-panel strong').boundingBox())!;
      expect(depthValue.y).toBeGreaterThanOrEqual(depthPanel.y);
      expect(depthValue.y+depthValue.height).toBeLessThanOrEqual(depthPanel.y+depthPanel.height);
      expect(depthValue.x+depthValue.width).toBeLessThanOrEqual(depthPanel.x+depthPanel.width);
    }
    await expect(page.locator('.heading-readout strong')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    expect(boxes[0]!.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(boxes[0]!.x + boxes[0]!.width/2 - width/2)).toBeLessThan(1);
    expect(boxes[1]!.x).toBeGreaterThan(width*.7);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y+boxes[1]!.height);
    expect(boxes[3]!.x).toBeGreaterThan(width*.65);
    const sheet = page.locator("#hud-sheet");
    expect((await sheet.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await sheet.focus();
    await page.keyboard.press("Home");
    await expect(sheet).toHaveAttribute("aria-valuetext", /0% eased/);
    await page.keyboard.press("End");
    await expect(sheet).toHaveAttribute("aria-valuetext", /100% eased/);
    await page.screenshot({ path: resolve(evidence, `${name}-closed.png`) });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#status")).toHaveCSS("white-space", "nowrap");
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("#status-message")).not.toBeEmpty();
    await expect(page.locator("#status-details .wind-instrument")).toBeVisible();
    await expect(page.locator("#status-cue")).not.toBeEmpty();
    await page.screenshot({ path: resolve(evidence, `${name}-expanded.png`) });
    // Layout fixture only; this does not credit an earned maneuver.
    await page.clock.pauseAt(new Date());
    await page.locator("#status-message").evaluate(el => { el.textContent = "Gybe complete. The boom crossed with the wind astern; steady the helm and retrim."; });
    const disclosure = (await page.locator("#status-details").boundingBox())!;
    const controls = (await page.locator(".controls").boundingBox())!;
    expect(disclosure.y + disclosure.height).toBeLessThan(controls.y);
    expect(await page.locator('[data-control="starboard"]').evaluate(el => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.right - 4, box.top + 4));
    })).toBe(true);
    await page.locator("#status-scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator("#status-cue")).toBeInViewport();
    await expect(page.locator("#status-close")).toBeInViewport();
    await page.screenshot({ path: resolve(evidence, `${name}-long-message-scrolled.png`) });
    await page.clock.resume();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.locator("#reef-sail").click();
    await expect(page.locator("#reef-sail")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#sail-plan-label")).toHaveText("Reefed mainsail");
    const reefTrim = (await page.locator(".trim-instrument").boundingBox())!;
    const objective = (await page.locator(".lesson-card").boundingBox())!;
    expect(Math.max(objective.x-reefTrim.x-reefTrim.width,reefTrim.x-objective.x-objective.width,objective.y-reefTrim.y-reefTrim.height,reefTrim.y-objective.y-objective.height)).toBeGreaterThan(4);
    await page.screenshot({ path: resolve(evidence, `${name}-reef-controls.png`) });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator("#status-close").click();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
}
