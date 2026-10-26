import { expect, test } from "@playwright/test";
test.use({ hasTouch: true });
for (const [name,width,height] of [["desktop",1672,941],["phone",844,390]] as const) {
  for (const mode of ["arrival","returning","completed"] as const) {
    test(`chooser restores the actual opener at ${name} ${mode}`, async ({ page }, testInfo) => {
      await page.setViewportSize({width,height});
      if (mode !== "arrival") await page.addInitScript(mode => localStorage.setItem("fair-winds-progress-v1", JSON.stringify(mode === "completed" ? {version:1,academyCompleted:true,academyObjective:9,academyLesson:2,completedObjectives:[0,1,2,3,4,5,6,7,8],completedLessons:[0,1,2],activities:{},voyages:3,distanceSailed:900} : {version:1,academyCompleted:false,academyObjective:4,academyLesson:1,completedObjectives:[0,1,2,3],completedLessons:[0],activities:{},voyages:2,distanceSailed:500})),mode);
      await page.goto("/"); await expect(page.locator("#boot-loader")).toHaveCount(0);
      const openers = mode === "completed" ? ["#continue-lesson"] : mode === "returning" ? ["#new-journey"] : ["#set-sail"];
      for (const id of openers) {
        const opener = page.locator(id);
        expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        if (name === "phone") await opener.tap(); else await opener.click();
        await expect(page.locator("#lesson-chooser")).toBeVisible();
        await page.locator("#title-free-sail").dispatchEvent("pointerenter");
        await page.keyboard.press("Escape");
        await expect(opener).toBeFocused();
        const escapeFocus=await page.evaluate(()=>document.activeElement?.id);
        await opener.click();
        await page.locator("#lesson-chooser-close").click();
        await expect(opener).toBeFocused();
        await testInfo.attach('focus-receipt',{body:JSON.stringify({viewport:{width,height},mode,opener:id,activation:name==='phone'?'tap':'click',escapeFocus,backFocus:await page.evaluate(()=>document.activeElement?.id)}),contentType:'application/json'});
      }
      await page.screenshot({path:`.artifacts/chooser-focus-${name}-${mode}.png`});
    });
  }
}
