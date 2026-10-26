import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const evidence=resolve('.artifacts/product-lessons');
const stages=[['trim','stall','recover'],['close-hauled','beam-reach','broad-reach'],['tack','gybe','reef']];
const wrap=(v:number)=>((v+540)%360)-180;
async function read(page:Page){return page.evaluate(()=>{
 const text=(s:string)=>document.querySelector(s)!.textContent!;
 const style=(s:string)=> (document.querySelector(s) as HTMLElement).style;
 const saved=JSON.parse(localStorage.getItem('fair-winds-progress-v1')??'{}');
 return {stage:(document.querySelector('.game-shell') as HTMLElement).dataset.academyStage,
 angle:parseFloat(style('#wind-arrow').transform.replace('rotate(','')),
 heading:-parseFloat(style('#heading-tape').transform.replace('translate3d(',''))/2,
 sheet:parseFloat(style('#trim-marker').top)/100,idealSheet:parseFloat(style('#trim-target').top)/100,
 speed:parseFloat(text('#speed'))/1.94384,flow:text('#flow-state'),instruction:text('#lesson-instruction'),
 progress:parseFloat(style('#lesson-progress').width),time:Number((document.querySelector('.game-shell') as HTMLElement).dataset.simulationTime),
 saved,wind:text('#wind-readout')};
});}
for(const [label,width,height] of [['desktop',1440,900],['phone',844,390]] as const){
 test(`all nine objectives through actual ${label} game controls`,async({page},info)=>{
  test.setTimeout(900000);mkdirSync(evidence,{recursive:true});const trace:unknown[]=[];const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});
  const cdp=label==='phone'?await page.context().newCDPSession(page):undefined;
  if(cdp)await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const held=new Set<string>();const controlNames:Record<string,string>={KeyA:'port',KeyD:'starboard',KeyW:'ease',KeyS:'sheet'};
  const setControls=async(keys:string[])=>{
   const wanted=new Set(keys.filter(Boolean));if([...wanted].sort().join() === [...held].sort().join())return;
   if(cdp){
    if(held.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const touchPoints=[];let id=1;
    for(const key of wanted){const b=(await page.locator(`[data-control="${controlNames[key]}"]`).boundingBox())!;touchPoints.push({x:b.x+b.width/2,y:b.y+b.height/2,id:id++,radiusX:4,radiusY:4,force:1});}
    if(touchPoints.length)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
   }else{
    for(const key of held)if(!wanted.has(key))await page.keyboard.up(key);
    for(const key of wanted)if(!held.has(key))await page.keyboard.down(key);
   }
   held.clear();for(const key of wanted)held.add(key);
  };
  try{
   await page.goto('/');await page.locator('#boot-loader').waitFor({state:'detached'});
   trace.push({event:'build',url:page.url(),asset:await page.locator('script[type="module"]').getAttribute('src'),viewport:{width,height},initialSaved:(await read(page)).saved});
   if(cdp){await page.locator('#title-settings').click();await page.locator('[data-ui-tab="controls"]').click();await page.locator('#touch-controls-enabled').check();await page.locator('#settings-resume').click();}
   for(let lesson=0;lesson<3;lesson++){
    await page.locator(lesson===0?'#set-sail':'#continue-lesson').click();await page.locator(`[data-lesson="${lesson}"]`).click();await page.locator('#start-lesson').click();await expect(page.locator('#welcome')).toBeHidden();
    for(const [offset,stage] of stages[lesson]!.entries()){
     await setControls([]);await expect(page.locator('.game-shell')).toHaveAttribute('data-academy-stage',stage);
     const initial=await read(page);trace.push({event:'initial',stage,snapshot:initial});
     await page.waitForTimeout(1700);const invalid=await read(page);expect(invalid.stage).toBe(stage);expect(invalid.progress).toBe(0);
     trace.push({event:'invalid-no-input',snapshot:invalid});
     let previous=invalid,readyToTack=false,gybePhase=0,reefed=false,retries=0,attemptStart=Date.now();const start=Date.now();
     while(Date.now()-start<110000){
      const s=await read(page);if(s.stage!==stage)break;
      if(Date.now()-attemptStart>55000 && s.progress===0 && retries<1){
        await setControls([]);await page.locator('#conditions-toggle').click();
        await page.locator('[data-ui-tab="boat"]').click();await page.locator('#settings-reset-boat').click();
        await page.locator('#settings-resume').click();
        trace.push({event:'reset-current-attempt',snapshot:s});retries++;attemptStart=Date.now();
        readyToTack=false;gybePhase=0;reefed=false;previous=await read(page);continue;
      }
      const dt=s.time-previous.time;const yaw=dt>0?wrap(s.heading-previous.heading)*Math.PI/180/dt:0;
      let target=stage==='close-hauled'?48:stage==='beam-reach'?92:stage==='broad-reach'?128:100;
      if(stage==='tack'){readyToTack ||= s.speed>0.8;target=readyToTack?-50:50;}
      if(stage==='gybe'){if(Math.abs(s.angle)>130)gybePhase=1;target=(initial.angle<0?-1:1)*140*(gybePhase?-1:1);}
      if(stage==='reef')target=initial.angle<0?-140:140;
      const command=wrap(s.angle-target)*0.06-yaw*2.5;
      const steer=command>0.13?'KeyD':command< -0.13?'KeyA':'';
      const sheetTarget=stage==='stall'||(stage==='recover'&&s.instruction.startsWith('Sheet in to find'))?0.12
        :stage==='trim'&&s.instruction.startsWith('Ease until')?1:s.idealSheet;
      const trim=sheetTarget-s.sheet>0.018?'KeyW':sheetTarget-s.sheet< -0.018?'KeyS':'';
      if(stage==='reef'&&!reefed){
        await setControls([]);
        if(cdp) await page.locator('#reef-sail').click();
        else await page.keyboard.press('KeyQ');
        reefed=true;
      }
      await setControls([steer,trim]);trace.push({event:'controls',wallTime:Date.now(),keys:[...held],snapshot:s});previous=s;
      if(trace.length%30===0)writeFileSync(resolve(evidence,`${label}-live.json`),JSON.stringify(trace));
      if(trim){
        await page.waitForTimeout(Math.min(80,Math.max(20,(Math.abs(sheetTarget-s.sheet)-0.01)/0.3*1000)));
        await setControls([steer]);
      }else await page.waitForTimeout(100);
     }
     await setControls([]);const earned=await read(page);trace.push({event:'earned',snapshot:earned});
     await page.screenshot({path:resolve(evidence,`${label}-${stage}.png`)});
     expect(earned.stage,JSON.stringify(earned)).not.toBe(stage);expect(earned.saved.completedObjectives).toContain(lesson*3+offset);
     await page.reload();await page.locator('#boot-loader').waitFor({state:'detached'});
     const reloaded=await read(page);expect(reloaded.saved.completedObjectives).toContain(lesson*3+offset);trace.push({event:'reload',snapshot:reloaded});
     if(offset<2){await page.locator('#continue-lesson').click();await expect(page.locator('#welcome')).toBeHidden();}
     else{expect(reloaded.saved.completedLessons).toEqual(Array.from({length:lesson+1},(_,n)=>n));expect(reloaded.saved.academyCompleted).toBe(lesson===2);await expect(page.locator('.title-menu').getByRole('button',{name:'Choose lesson',exact:true})).toHaveCount(1);}
    }
   }
   expect((await read(page)).saved.completedObjectives).toEqual([0,1,2,3,4,5,6,7,8]);expect(errors).toEqual([]);
   await page.locator('#continue-lesson').click();await expect(page.locator('#lesson-chooser')).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.locator('#continue-lesson')).toBeFocused();
  }finally{
   await setControls([]);writeFileSync(resolve(evidence,`${label}-trace.json`),JSON.stringify({trace,errors},null,2));await page.screenshot({path:resolve(evidence,`${label}-final.png`)});
  }
 });
}
test('Free sail pauses and resumes the selected target without mastery',async({page})=>{
 await page.goto('/');await page.locator('#boot-loader').waitFor({state:'detached'});await page.locator('#set-sail').click();await page.locator('[data-lesson="2"]').click();await page.locator('#start-lesson').click();
 await expect(page.locator('.game-shell')).toHaveAttribute('data-academy-stage','tack');
 await page.locator('#status-toggle').click();await page.locator('#lesson-skip').click();await expect(page.locator('.game-shell')).toHaveAttribute('data-academy-stage','free-sail');
 expect((await read(page)).saved.completedObjectives??[]).toEqual([]);await page.locator('#lesson-skip').click();await expect(page.locator('.game-shell')).toHaveAttribute('data-academy-stage','tack');
 expect((await read(page)).saved.completedLessons??[]).toEqual([]);
});

