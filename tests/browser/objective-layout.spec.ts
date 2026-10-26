import { expect,test } from '@playwright/test';
for(const [name,width,height] of [['phone',844,390],['short-phone',812,375],['app-panel',895,790]] as const){
  test(`objective titles stay clear of right HUD at ${name}`,async({page},info)=>{
    await page.setViewportSize({width,height});await page.goto('/');
    await expect(page.locator('#boot-loader')).toHaveCount(0);
    await page.locator('#title-free-sail').click();
    await expect(page.locator('#welcome')).toHaveCSS('opacity','0');
    await page.clock.pauseAt(new Date());
    const observations=[];
    for(const title of ['Trim','Juniper arrival complete','Hold a steady course through the channel']){
      // Text-only layout fixtures; no activity or lesson credit is written.
      await page.locator('#lesson-title').evaluate((el,title)=>{el.textContent=title;},title);
      const objective=(await page.locator('.lesson-card').boundingBox())!;
      const clearances=[];
      for(const selector of ['.trim-scale span:last-child','#hud-sheet','.mini-map-hud','.navigation-hud']){
        const box=(await page.locator(selector).boundingBox())!;
        const gap=Math.max(objective.x-box.x-box.width,box.x-objective.x-objective.width,objective.y-box.y-box.height,box.y-objective.y-objective.height);
        expect(gap,`${title} overlaps ${selector}`).toBeGreaterThanOrEqual(7);
        clearances.push({selector,gap});
      }
      expect(objective.y).toBeGreaterThanOrEqual(0);
      expect(objective.y+objective.height).toBeLessThanOrEqual(height);
      expect(objective.x+objective.width).toBeLessThanOrEqual(width);
      await expect(page.locator('#lesson-title')).toHaveText(title);
      observations.push({title,objective,clearances});
      await page.screenshot({path:`.artifacts/objective-${name}-${observations.length}.png`});
    }
    await info.attach('objective-layout-receipt',{body:JSON.stringify({viewport:{width,height},observations}),contentType:'application/json'});
  });
}
