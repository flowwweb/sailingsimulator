import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const start = source.indexOf("  const renderScene = !webglContextLost");
const end = source.indexOf("\n  if (started) updateCompass", start);
const block = source.slice(start, end);

function fixture() {
  const drawImage = vi.fn();
  const render = vi.fn((..._args: unknown[]) => {});
  return {
    webglContextLost: false, started: false, document: { hidden: false }, titleFrameDirty: true,
    titleFrameContext: { drawImage }, titleFrame: { width: 0, height: 0, hidden: true },
    canvas: { width: 800, height: 450 }, FIRST_BUOY_MARKS: [], firstBuoy: undefined,
    world: { setWorldObjectVisible: vi.fn(), render }, renderPrevious: {}, renderCurrent: {},
    renderDiagnostics: {}, renderHeadsail: {}, renderWeather: {}, accumulator: 0, fixedStep: 1/60,
    simulationPaused: false, frameDt: 1/60, incident: undefined, incidentElapsed: 0,
    progress: { voyages: 0 }, presentationTime: 0, finishBoot: vi.fn(),
    performanceStats: undefined,
  };
}
const frame = (context: ReturnType<typeof fixture>) => runInNewContext(`(() => { ${block} })()`, context);

describe("static title frame", () => {
  it("renders once while stable, invalidates, and resumes rendering for sailing", () => {
    expect(start).toBeGreaterThanOrEqual(0); expect(end).toBeGreaterThan(start);
    const ctx = fixture();
    for (let i = 0; i < 600; i++) frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(1);
    expect(ctx.titleFrameContext.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.titleFrame.hidden).toBe(false);
    ctx.titleFrameDirty = true;
    ctx.document.hidden = true;
    frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(1);
    ctx.document.hidden = false;
    frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(2);
    ctx.webglContextLost = true;
    ctx.titleFrameDirty = true;
    frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(2);
    ctx.webglContextLost = false;
    frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(3);
    ctx.started = true;
    frame(ctx); frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(5);
  });
  it("falls back to drawing a fixed scene when copying is unavailable", () => {
    const ctx = fixture();
    ctx.titleFrameContext.drawImage.mockImplementation(() => { throw new Error("copy failed"); });
    frame(ctx); frame(ctx);
    expect(ctx.world.render).toHaveBeenCalledTimes(2);
    expect(ctx.titleFrame.hidden).toBe(true);
    expect(ctx.world.render.mock.calls[1]?.[6]).toBe(0);
  });
});

