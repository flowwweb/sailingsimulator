import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createProgress, parseProgress, recordFirstBuoyCompletion, sailingRank } from "./progress";

const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const start = main.indexOf("function syncTitleRank(): void {");
const end = main.indexOf("\nfunction syncTitleState()", start);
const render = main.slice(start, end).replace("function syncTitleRank(): void", "function syncTitleRank()");

describe("title sailing progress", () => {
  it("shows saved earned rank and resets with the logbook", () => {
    const nodes = Object.fromEntries(["name", "xp", "fill", "track"].map((name) => [
      `#title-rank-${name}`, { textContent: "", style: { width: "" }, attributes: {} as Record<string, string>, setAttribute(key: string, value: string) { this.attributes[key] = value; } },
    ]));
    nodes["#settings-rank"] = { textContent: "", style: { width: "" }, attributes: {}, setAttribute(key: string, value: string) { this.attributes[key] = value; } };
    const context = { required: (selector: keyof typeof nodes) => nodes[selector], sailingRank,
      progress: parseProgress(JSON.stringify(recordFirstBuoyCompletion(createProgress()))) };
    runInNewContext(`${render}; syncTitleRank()`, context);
    expect(nodes["#title-rank-name"]!.textContent).toBe("Level 2 · Deckhand");
    expect(nodes["#title-rank-xp"]!.textContent).toBe("100 XP");
    expect(nodes["#settings-rank"].textContent).toBe("Level 2 · Deckhand · 100 XP");
    expect(nodes["#title-rank-track"]!.attributes["aria-valuetext"]).toBe("0 of 100 XP toward level 3");
    context.progress = createProgress();
    runInNewContext(`${render}; syncTitleRank()`, context);
    expect(nodes["#title-rank-name"]!.textContent).toBe("Level 1 · Newcomer");
    expect(nodes["#title-rank-xp"]!.textContent).toBe("0 XP");
  });
});
