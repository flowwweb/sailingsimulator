import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

function harness() {
  let navigationHandler: (event: unknown) => void;
  let network: Response | Error = new Error("offline");
  const entries = new Map<string, Response>();
  const context = createContext({
    URL,
    self: {
      location: { origin: "https://fairwinds.example" },
      addEventListener: (name: string, handler: typeof navigationHandler) => {
        if (name === "fetch") navigationHandler = handler;
      },
    },
    caches: {
      open: async () => ({ put: async (key: string, value: Response) => { entries.set(key, value); } }),
      match: async (key: string) => entries.get(key)?.clone(),
    },
    fetch: async () => {
      if (network instanceof Error) throw network;
      return network.clone();
    },
  });
  runInContext(readFileSync("public/sw.js", "utf8"), context);
  return {
    online(response: Response) { network = response; },
    offline() { network = new Error("offline"); },
    async navigate() {
      let response!: Promise<Response>;
      navigationHandler({
        request: { method: "GET", url: "https://fairwinds.example/", mode: "navigate" },
        respondWith(promise: Promise<Response>) { response = promise; },
      });
      const result = await response;
      await new Promise<void>(resolve => setImmediate(resolve));
      return result;
    },
  };
}

const html = (body: string, status = 200) => new Response(body, {
  status, headers: { "content-type": "text/html; charset=utf-8" },
});

describe("offline navigation shell", () => {
  it("caches a successful document for normal offline launch", async () => {
    const app = harness();
    app.online(html("working app"));
    expect(await (await app.navigate()).text()).toBe("working app");
    app.offline();
    const cached = await app.navigate();
    expect(cached.status).toBe(200);
    expect(await cached.text()).toBe("working app");
  });

  it.each([404, 503])("preserves a working shell through HTTP%s and later recovery", async status => {
    const app = harness();
    app.online(html("working app"));
    await app.navigate();
    app.online(html("outage", status));
    expect((await app.navigate()).status).toBe(status);
    app.offline();
    expect(await (await app.navigate()).text()).toBe("working app");
    app.online(html("recovered app"));
    await app.navigate();
    app.offline();
    expect(await (await app.navigate()).text()).toBe("recovered app");
  });

  it("does not replace the application shell with a non-document response", async () => {
    const app = harness();
    app.online(html("working app"));
    await app.navigate();
    app.online(new Response('{"status":"ok"}', { headers: { "content-type": "application/json" } }));
    await app.navigate();
    app.offline();
    expect(await (await app.navigate()).text()).toBe("working app");
  });
});
