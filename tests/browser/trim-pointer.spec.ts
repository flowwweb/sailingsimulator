import { expect, test, type Page } from "@playwright/test";
async function expectSheetAcrossHud(page: Page, minimum: number, maximum: number) {
  const shell = page.locator(".game-shell"), sheet = page.locator("#hud-sheet");
  for (let update = 0; update < 2; update++) {
    const before = Number(await shell.getAttribute("data-simulation-time"));
    await expect.poll(async () => Number(await shell.getAttribute("data-simulation-time"))).toBeGreaterThan(before + .11);
    const value = Number(await sheet.inputValue());
    expect(value).toBeGreaterThan(minimum);
    expect(value).toBeLessThan(maximum);
    await expect(sheet).toHaveAttribute("aria-valuetext", new RegExp(`${Math.round(value * 100)}% eased$`));
  }
}

test.use({ hasTouch: true });
for (const [name, width, height] of [["desktop",1672,941],["phone",844,390]] as const) {
  test(`native sheet pointer and touch lane at ${name}`, async ({ page }, testInfo) => {
    const clicks: { offset: number; value: string }[] = [];
    await page.setViewportSize({ width, height });
    await page.goto("/"); await expect(page.locator("#boot-loader")).toHaveCount(0);
    await page.locator("#title-free-sail").click();
    await expect(page.locator("#welcome")).toHaveCSS("opacity", "0");
    const sheet = page.locator("#hud-sheet"), box = (await sheet.boundingBox())!;
    const center = box.x + box.width / 2, middle = box.y + box.height / 2;
    expect(box.width).toBeGreaterThanOrEqual(44);
    for (const dx of [-16,0,16]) {
      expect(await page.evaluate(({ x,y }) => document.elementFromPoint(x,y)?.id, { x:center+dx,y:middle })).toBe("hud-sheet");
      await sheet.focus(); await page.keyboard.press("Home");
      await page.mouse.click(center+dx,middle);
      await expect.poll(async () => Number(await sheet.inputValue())).toBeGreaterThan(.35);
      await expect.poll(async () => Number(await sheet.inputValue())).toBeLessThan(.65);
      await expectSheetAcrossHud(page, .35, .65);
      clicks.push({offset:dx,value:await sheet.inputValue()});
    }
    await page.mouse.move(center,middle); await page.mouse.down();
    await page.mouse.move(center,box.y+box.height-10,{steps:10}); await page.mouse.up();
    await expect.poll(async () => Number(await sheet.inputValue())).toBeGreaterThan(.85);
    await expectSheetAcrossHud(page, .85, 1.01);
    const mouseDrag=await sheet.inputValue();
    await page.mouse.click(center,box.y+10);
    await expect.poll(async () => Number(await sheet.inputValue())).toBeLessThan(.15);
    await expectSheetAcrossHud(page, -.01, .15);
    const mouseTop=await sheet.inputValue();
    await page.touchscreen.tap(center,middle);
    await expect.poll(async () => Number(await sheet.inputValue())).toBeGreaterThan(.35);
    await expect.poll(async () => Number(await sheet.inputValue())).toBeLessThan(.65);
    await expectSheetAcrossHud(page, .35, .65);
    const touchTap=await sheet.inputValue();
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type:"touchStart",touchPoints:[{x:center,y:middle}] });
    for(let step=1;step<=10;step++) await session.send("Input.dispatchTouchEvent", { type:"touchMove",touchPoints:[{x:center,y:middle+(box.height/2-10)*step/10}] });
    await session.send("Input.dispatchTouchEvent", { type:"touchEnd",touchPoints:[] });
    await expect.poll(async () => Number(await sheet.inputValue())).toBeGreaterThan(.85);
    await expectSheetAcrossHud(page, .85, 1.01);
    await expect(sheet).toHaveAttribute("aria-valuetext", /eased/);
    const adjacentHit=await page.evaluate(({ x,y })=>document.elementFromPoint(x,y)?.id,{x:box.x-8,y:middle});
    expect(adjacentHit).toBe("lake");
    await testInfo.attach('pointer-receipt',{body:JSON.stringify({viewport:{width,height},box,clicks,mouseDrag,mouseTop,touchTap,cdpTouchDrag:await sheet.inputValue(),adjacentHit}),contentType:'application/json'});
    await page.screenshot({path:`.artifacts/trim-pointer-${name}.png`});
  });
}

test("slow frames retain native sheet targets and a held helm", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => requestFrame(() => {
      window.setTimeout(() => callback(performance.now()), 300);
    });
  });
  await page.goto("/");
  await expect(page.locator("#boot-loader")).toHaveCount(0);
  await page.locator("#title-free-sail").click();
  await expect(page.locator("#welcome")).toBeHidden();
  const sheet = page.locator("#hud-sheet");
  await sheet.focus(); await page.keyboard.press("Home");
  await expectSheetAcrossHud(page, -.01, .01);
  await page.keyboard.press("End");
  await expectSheetAcrossHud(page, .99, 1.01);
  await page.locator("#lake").focus();
  const shell = page.locator(".game-shell");
  const before = Number(await shell.getAttribute("data-simulation-time"));
  await page.keyboard.down("ArrowRight");
  try {
    await expect.poll(async () => Number(await shell.getAttribute("data-simulation-time"))).toBeGreaterThan(before + .25);
    await expect(page.locator("#motion-readout")).not.toContainText("Rudder centered");
  } finally {
    await page.keyboard.up("ArrowRight");
  }
});