import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { FirstBuoyJourney, FIRST_BUOY, FIRST_BUOY_COURSE } from "./first-buoy";

const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const lessonStart = source.indexOf("function updateLesson(): void {");
const lessonEnd = source.indexOf("  const lessonView = academy.view();", lessonStart);
const lesson = source.slice(lessonStart, lessonEnd).replace("function updateLesson(): void", "function updateLesson()").replaceAll("required<HTMLButtonElement>", "required") + "}";
const courseStart = source.indexOf("function activeCourse(): WorldActivity | undefined {");
const courseEnd = source.indexOf("\n}", courseStart) + 2;
const course = source.slice(courseStart, courseEnd).replace("function activeCourse(): WorldActivity | undefined", "function activeCourse()");
const hudStart = source.indexOf("  const completedManeuver =", source.indexOf("function updateHud(): void {"));
const hudEnd = source.indexOf("\n}", hudStart);
const hudStatus = `function updateHudStatus() {\n${source.slice(hudStart, hudEnd)}\n}`;

test("failed journey replaces the collapsed destination and offers retry", () => {
  const journey = new FirstBuoyJourney();
  journey.update(1 / 60, { unsafe: true } as never);
  const nodes: Record<string, any> = {};
  const node = (id: string) => nodes[id] ??= { hidden: false, textContent: "", style: {},
    children: id === "#status-pips" ? Array.from({ length: 3 }, () => ({ classList: { toggle() {} } })) : [] };
  const elements = {
    gameShell: { classList: { add() {} }, dataset: {} },
    lessonCard: { hidden: false, classList: { remove() {}, toggle() {} } },
    lessonEyebrow: node("eyebrow"), lessonTitle: node("title"), lessonInstruction: node("instruction"),
    lessonProgress: node("progress"), lessonSkip: node("skip"),
  };
  const context = { firstBuoy: journey, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, state: { position: { x: 0, y: 0 }, velocity: {}, heading: 0 },
    FIRST_BUOY, FIRST_BUOY_COURSE, elements, required: node,
    courseMetrics: () => ({ distance: 100, bearingDegrees: 180 }), formatChartDistance: () => "100 m" };
  runInNewContext(`${lesson}; updateLesson();`, context);
  expect(nodes["#status-lesson-progress"].textContent).toContain("failed");
  expect(nodes["#status-objective-detail"].textContent).toContain("Retry");
  expect(elements.lessonSkip.textContent).toBe("Retry journey");
  expect(elements.lessonSkip.disabled).toBe(false);
  expect(runInNewContext(`${course}; activeCourse();`, context)).toBeUndefined();
});

test.each(["flow", "tack", "gybe"])("failed journey keeps both final status messages after %s", (change) => {
  const journey = new FirstBuoyJourney();
  journey.update(1 / 60, { unsafe: true } as never);
  const elements = { status: { textContent: "Touched a marker. Steer clear and continue." }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
  const context = { elements, firstBuoy: journey, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, state: { maneuverCount: change === "flow" ? 0 : 1, lastManeuver: change === "flow" ? "none" : change },
    lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
  runInNewContext(`${hudStatus}; updateHudStatus();`, context);
  expect(elements.status.textContent).toBe("Journey failed. Open status to retry.");
  expect(elements.statusMessage.textContent).toBe(elements.status.textContent);
});

test("active journey shows the sailing objective instead of flow jargon", () => {
  const elements = { status: { textContent: "Ready" }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
  const context = { elements, firstBuoy: new FirstBuoyJourney(), dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, state: { maneuverCount: 0, lastManeuver: "none" },
    lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
  runInNewContext(`${hudStatus}; updateHudStatus();`, context);
  expect(elements.status.textContent).toBe("Sail to Juniper buoy.");
  expect(elements.statusMessage.textContent).toBe("Sail looks steady. Watch your course and speed.");
});

test.each(["Tack complete. Build speed on the new side and retrim.", "Sound muted.", "Reefed mainsail."])("active journey retains feedback: %s", (message) => {
  const elements = { status: { textContent: message }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
  const context = { elements, firstBuoy: new FirstBuoyJourney(), dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, state: { maneuverCount: 0, lastManeuver: "none" },
    lastManeuverCount: 0, lastFlow: "Attached", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: true, STORAGE_WARNING: "Storage unavailable" };
  runInNewContext(`${hudStatus}; updateHudStatus(); updateHudStatus();`, context);
  expect(elements.status.textContent).toBe("Sail to Juniper buoy. Storage unavailable");
  expect(elements.statusMessage.textContent).toBe(`${message} Storage unavailable`);
});

test("completed journey keeps its completion message after flow changes", () => {
  const elements = { status: { textContent: "Ready" }, statusMessage: { textContent: "" }, statusFeedback: { textContent: "" } };
  const context = { elements, firstBuoy: { completed: true, failed: false }, dummyRecovery: undefined, weatherShelter: undefined, crossing: undefined, state: { maneuverCount: 0, lastManeuver: "none" },
    lastManeuverCount: 0, lastFlow: "Luffing", flow: "Attached", coach: "Flow attached", started: true,
    dockedAt: undefined, storageUnavailable: false, STORAGE_WARNING: "Storage unavailable" };
  runInNewContext(`${hudStatus}; updateHudStatus();`, context);
  expect(elements.status.textContent).toBe("Three buoys reached under control. Journey complete.");
});
