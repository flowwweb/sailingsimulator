import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const start = main.indexOf("function registerServiceWorker(): void {");
const end = main.indexOf("\nfunction createGameState(", start);
assert.ok(start >= 0 && end > start);
const registration = stripTypeScriptTypes(main.slice(start, end), { mode: "strip" }).replace("import.meta.env.PROD", "production");

function fixture({ readyState = "loading", hostname = "fairwinds.web.app", production = true, supported = true, failure = false } = {}) {
  const calls = [];
  const listeners = new Map();
  const document = { readyState };
  const elements = { status: { textContent: "Sail to Juniper buoy." } };
  const serviceWorker = { register(url) { calls.push(url); return failure ? Promise.reject(new Error("registration denied")) : Promise.resolve(); } };
  const context = { document, elements, production, navigator: supported ? { serviceWorker } : {}, window: {
    location: { hostname },
    addEventListener(name, callback, options) { listeners.set(name, { callback, options }); },
  } };
  return {
    calls, listeners, elements,
    bootstrap() { runInNewContext(`${registration}\nregisterServiceWorker();`, context); },
    load() {
      document.readyState = "complete";
      const listener = listeners.get("load");
      if (listener?.options?.once) listeners.delete("load");
      listener?.callback();
    },
  };
}

for (const readyState of ["loading", "interactive"]) {
  test(`early bootstrap waits for one load event from ${readyState}`, () => {
    const page = fixture({ readyState });
    page.bootstrap();
    assert.equal(page.calls.length, 0);
    assert.equal(page.listeners.size, 1);
    assert.equal(page.listeners.get("load").options.once, true);
    page.load(); page.load();
    assert.deepEqual(page.calls, ["/sw.js"]);
    assert.equal(page.listeners.size, 0);
  });
}

test("late bootstrap registers immediately after load has already fired", () => {
  const page = fixture({ readyState: "complete" });
  page.bootstrap();
  assert.deepEqual(page.calls, ["/sw.js"]);
  assert.equal(page.listeners.size, 0);
  assert.equal(page.elements.status.textContent, "Sail to Juniper buoy.");
});

test("registration rejection preserves the existing online-sailing warning without throwing", async () => {
  const page = fixture({ readyState: "complete", failure: true });
  page.bootstrap();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(page.calls, ["/sw.js"]);
  assert.equal(page.elements.status.textContent, "Offline support is unavailable; online sailing is unaffected.");
});

for (const options of [{ hostname: "localhost" }, { hostname: "127.0.0.1" }, { production: false }, { supported: false }]) {
  test(`registration guard retains ${JSON.stringify(options)}`, () => {
    const page = fixture({ readyState: "complete", ...options });
    page.bootstrap();
    assert.equal(page.calls.length, 0);
    assert.equal(page.listeners.size, 0);
    assert.equal(page.elements.status.textContent, "Sail to Juniper buoy.");
  });
}
