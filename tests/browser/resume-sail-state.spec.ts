import { expect,test } from '@playwright/test';
for(const [name,width,height] of [['desktop',1672,941],['phone',844,390]] as const) {
  for(const sailState of ['lowered','docked','sailing'] as const) {
    const docked=sailState==='docked';
    test(`resume preserves ${sailState} guidance at ${name}`,async({page})=>{
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      await page.setViewportSize({width,height});
      // Existing docked preview is a state fixture, not an earned arrival proof.
      await page.goto(docked?'/?preview=game&landmark=juniper-harbor&docked=1':'/');
      await expect(page.locator('#boot-loader')).toHaveCount(0);
      if(!docked) {
        await page.locator('#title-free-sail').click();
        await expect(page.locator('#welcome')).toHaveCSS('opacity','0');
        if(sailState==='lowered'){
          await page.keyboard.press('x');
          await expect(page.locator('#flow-state')).toHaveText('Lowered');
        }
      }
      await page.locator('#conditions-toggle').click();
      await page.locator('#settings-main-menu').click();
      await page.locator('#title-free-sail').click();
      await expect(page.locator('#welcome')).toHaveCSS('opacity','0');
      const expected=docked?'Docked at':sailState==='lowered'?'Sails lowered. Hoist sail':`${await page.locator('#flow-state').textContent()}.`;
      await expect(page.locator('#status')).toContainText(expected);
      await page.waitForTimeout(700);
      await expect(page.locator('#status')).toContainText(expected);
      if(docked)await expect(page.locator('.game-shell')).toHaveAttribute('data-docked-at','juniper-cove-dock');
      expect(errors).toEqual([]);
    });
  }
}
