import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
type Snapshot = {stage:string;objective:number;lesson:number;progress:number;angle:number;sheet:number;idealSheet:number;speed:number;yaw:number;tacks:number;gybes:number;reef:number;earned:number[];[key:string]:unknown};
const read = async (page: Page): Promise<Snapshot> => JSON.parse((await page.locator("#telemetry").textContent())!);
test.beforeEach(({}, info) => test.skip(info.config.metadata.lessonHarness !== true, "Diagnostic source harness requires its dedicated config; this is not product acceptance."));
const stages = [["trim","stall","recover"],["close-hauled","beam-reach","broad-reach"],["tack","gybe","reef"]];
function wrap(deg:number) { return ((deg + 540) % 360) - 180; }
async function release(page:Page) { for (const key of ["KeyA","KeyD","KeyW","KeyS"]) await page.keyboard.up(key); }
for (const lesson of [0,1,2]) test(`lesson ${lesson + 1}: three real-control targets and reload`, async ({page}, info) => {
  test.setTimeout(360000);
  const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  const trace:unknown[]=[];
  try {
    await page.goto("/tests/browser/lesson-harness.html");
    await page.locator(`[data-lesson="${lesson}"]`).click();
    for (const stage of stages[lesson]!) {
      await release(page);
      const initial=await read(page); expect(initial.stage).toBe(stage);
      trace.push({event:"initial",wallTime:Date.now(),snapshot:initial});
      await page.screenshot({path:info.outputPath(`${stage}-initial.png`)});
      await page.waitForTimeout(1700);
      const invalid=await read(page); expect(invalid.stage).toBe(stage); expect(invalid.progress).toBe(0);
      trace.push({event:"invalid-no-input",wallTime:Date.now(),snapshot:invalid});
      let gybePhase=0;
      let readyToTack=false;
      let reefed=false;
      const held=new Set<string>();
      const start=Date.now();
      while (Date.now()-start<90000) {
        const s=await read(page); if(s.stage!==stage) break;
        let target=stage==="close-hauled"?48:stage==="beam-reach"?92:stage==="broad-reach"?128:100;
        if(stage==="tack") { readyToTack ||= s.speed>0.8; target=readyToTack?-50:50; }
        if(stage==="gybe") {
          
          if (Math.abs(s.angle)>130) gybePhase=1;
          target=(initial.angle<0?-1:1)*140*(gybePhase?-1:1);
        }
        if(stage==="reef") target=initial.angle<0?-140:140;
        const command=wrap(s.angle-target)*0.06-s.yaw*2.5;
        const steer=command>0.13?"KeyD":command< -0.13?"KeyA":"";
        
        const sheetTarget=stage==="stall"?0.12:s.idealSheet;
        const trim=sheetTarget-s.sheet>0.018?"KeyW":sheetTarget-s.sheet< -0.018?"KeyS":"";
        const wanted=new Set([steer,trim].filter(Boolean));
        for(const key of held) if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
        for(const key of wanted) if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
        if(stage==="reef"&&!reefed){await page.getByRole("button",{name:"Reef",exact:true}).click();reefed=true;}
        trace.push({event:"control",wallTime:Date.now(),keys:[...wanted],snapshot:s}); if(trace.length%20===0) writeFileSync(info.outputPath("live-trace.json"),JSON.stringify(trace));
        await page.waitForTimeout(100);
      }
      await release(page);
      const earned=await read(page);
      trace.push({event:"result",wallTime:Date.now(),snapshot:earned});
      await page.screenshot({path:info.outputPath(`${stage}-result.png`)});
      expect(earned.stage,JSON.stringify(earned)).not.toBe(stage);
      expect(earned.earned).toContain(initial.objective);
      // Reload every objective via actual saved progress; restart physics without replay credit.
      if (process.env.LESSON_CONTINUOUS !== "1" || earned.stage === "lesson-complete") await page.reload();
      const reloaded=await read(page); expect(reloaded.earned).toContain(initial.objective);
      expect(reloaded.stage).toBe(earned.stage);
      trace.push({event:process.env.LESSON_CONTINUOUS === "1" && earned.stage!=="lesson-complete" ? "continuous-next" : "reload",wallTime:Date.now(),snapshot:reloaded});
      if (earned.stage!=="lesson-complete" && process.env.LESSON_CONTINUOUS !== "1") await page.getByRole("button",{name:"Continue lesson",exact:true}).click();
    }
    expect((await read(page)).stage).toBe("lesson-complete");
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("fair-winds-progress-v1")!));
    expect(saved.completedLessons).toEqual([lesson]); expect(saved.academyCompleted).toBe(false);
    await page.getByRole("button",{name:"Free sail",exact:true}).click();
    await page.keyboard.down("KeyD"); await page.waitForTimeout(1000); await release(page);
    await page.reload(); expect((await read(page)).stage).toBe("free-sail");
    expect((await read(page)).earned).toHaveLength(3);
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(info.outputPath("performance-trace.json"),JSON.stringify(trace,null,2));
    await page.screenshot({path:info.outputPath("final-state.png")});
  }
});






