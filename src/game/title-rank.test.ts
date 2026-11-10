import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { describe, expect, it } from "vitest";
import { createProgress, parseProgress, recordFirstBuoyCompletion, sailingRank, rankForXp } from "./progress";

const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const start = main.indexOf("function syncTitleRank(): void {");
const end = main.indexOf("\nfunction syncTitleState()", start);
const render = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" });

describe("title sailing progress", () => {
  it("shows saved earned rank and resets with the logbook", () => {
    const nodes = Object.fromEntries(["title-profile", "title-level", "title-rank-badge", "title-xp-ring", "profile-rank-badge", "profile-level", "profile-rank", "profile-total-xp", "profile-level-xp", "profile-next-rank", "profile-xp-fill", "profile-xp-track", "settings-rank"].map((id) => [
      `#${id}`, { textContent: "", src: "", style: { width: "" }, attributes: {} as Record<string, string>, setAttribute(key: string, value: string) { this.attributes[key] = value; } },
    ]));
    const context = { required: (selector: keyof typeof nodes) => nodes[selector], sailingRank, rankForXp,
      elements: { titleProfile: nodes["#title-profile"] },
      progress: parseProgress(JSON.stringify(recordFirstBuoyCompletion(createProgress()))) };
    runInNewContext(`${render}; syncTitleRank()`, context);
    expect(nodes["#title-level"]!.textContent).toBe("2");
    expect(nodes["#profile-level"]!.textContent).toBe("Level 2");
    expect(nodes["#profile-rank"]!.textContent).toBe("Deckhand");
    expect(nodes["#profile-total-xp"]!.textContent).toBe("100 XP total");
    expect(nodes["#title-rank-badge"]!.src).toBe("/brand/ranks/deckhand.png");
    expect(nodes["#title-profile"]!.attributes["aria-label"]).toBe("Player profile, Level 2, Deckhand, 100 XP");
    expect(nodes["#settings-rank"]!.textContent).toBe("Level 2 · Deckhand · 100 XP");
    expect(nodes["#profile-xp-track"]!.attributes["aria-valuetext"]).toBe("0 of 100 XP toward level 3");
    context.progress = createProgress();
    runInNewContext(`${render}; syncTitleRank()`, context);
    expect(nodes["#title-level"]!.textContent).toBe("1");
    expect(nodes["#profile-rank"]!.textContent).toBe("Landlubber");
    expect(nodes["#profile-total-xp"]!.textContent).toBe("0 XP total");
    expect(nodes["#title-rank-badge"]!.src).toBe("/brand/ranks/landlubber.png");
  });
});
