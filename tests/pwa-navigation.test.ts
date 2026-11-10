import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

function harness() {
  let navigationHandler: (event: unknown) => void;
  let installHandler: (event: unknown) => void;
  let skippedWaiting = false;
  let network: Response | Error = new Error("offline");
  const responses = new Map<string, Response>();
  const requests: string[] = [];
  const entries = new Map<string, Response>();
  let writeBarrier: Promise<void> | undefined;
  const keyFor = (request: string | { url: string }) => {
    const url = new URL(typeof request === "string" ? request : request.url, "https://fairwinds.example");
    return url.pathname + url.search;
  };
  const fetchNetwork = async (request: string | { url: string }) => {
    const key = keyFor(request);
    requests.push(key);
    if (network instanceof Error) throw network;
    return (responses.get(key) ?? network).clone();
  };
  const context = createContext({
    URL,
    self: {
      location: { origin: "https://fairwinds.example" },
      skipWaiting: async () => { skippedWaiting = true; },
      addEventListener: (name: string, handler: typeof navigationHandler) => {
        if (name === "fetch") navigationHandler = handler;
        if (name === "install") installHandler = handler;
      },
    },
    caches: {
      open: async () => ({
        match: async (key: string | { url: string }) => entries.get(keyFor(key))?.clone(),
        put: async (key: string | { url: string }, value: Response) => { if (writeBarrier) await writeBarrier; entries.set(keyFor(key), value); },
        addAll: async (urls: string[]) => {
          const loaded = await Promise.all(urls.map(async url => {
            const response = await fetchNetwork(url);
            if (!response.ok) throw new Error(`Failed to precache ${url}`);
            return { key: keyFor(url), response };
          }));
          for (const { key, response } of loaded) entries.set(key, response);
        },
      }),
      match: async (key: string | { url: string }) => entries.get(keyFor(key))?.clone(),
    },
    fetch: fetchNetwork,
  });
  runInContext(readFileSync("public/sw.js", "utf8"), context);
  return {
    online(response: Response) { network = response; },
    serve(path: string, response: Response) { responses.set(path, response); },
    seedCached(path: string, response: Response) { entries.set(path, response); },
    offline() { network = new Error("offline"); },
    get networkRequests() { return requests.length; },
    get rootRequests() { return requests.filter(path => path === "/").length; },
    get didSkipWaiting() { return skippedWaiting; },
    pauseWrites() {
      let release!: () => void;
      writeBarrier = new Promise<void>(resolve => { release = resolve; });
      return () => { writeBarrier = undefined; release(); };
    },
    async install() {
      let installed!: Promise<unknown>;
      installHandler({ waitUntil(promise: Promise<unknown>) { installed = promise; } });
      await installed;
      return skippedWaiting;
    },
    async asset(path: string) {
      let response!: Promise<Response>;
      navigationHandler({
        request: { method: "GET", url: new URL(path, "https://fairwinds.example").href, mode: "cors" },
        respondWith(promise: Promise<Response>) { response = promise; },
      });
      return response;
    },
    async navigate(path = "/") {
      let response!: Promise<Response>;
      navigationHandler({
        request: { method: "GET", url: new URL(path, "https://fairwinds.example").href, mode: "navigate" },
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
const javascript = (body: string) => new Response(body, { headers: { "content-type": "text/javascript" } });
const css = (body: string) => new Response(body, { headers: { "content-type": "text/css" } });
const core = [
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/favicon.svg", "image/svg+xml"],
  ["/brand/fairwinds-icon.svg", "image/svg+xml"],
  ["/brand/fairwinds-app-icon.svg", "image/svg+xml"],
  ["/brand/fairwinds-wordmark.svg", "image/svg+xml"],
  ["/brand/fairwinds-full.svg", "image/svg+xml"],
  ["/brand/fairwinds-icons.svg", "image/svg+xml"],
  ["/brand/fairwinds-approved-menu-board.png", "image/png"],
  ["/brand/first-buoy-concept.png", "image/png"],
  ["/brand/dummy-recovery-concept.png", "image/png"],
  ["/models/fair-winds-boat-v2.glb", "model/gltf-binary"],
  ["/audio/water-hull.wav", "audio/wav"],
  ["/audio/soft-sea-wind.wav", "audio/wav"],
  ["/audio/distant-harbor.wav", "audio/wav"],
  ["/audio/vhf-juniper-33a89e30.mp3", "audio/mpeg"],
  ["/audio/wood-pigeon.ogg", "audio/ogg"],
  ["/audio/loon-calls.ogg", "audio/ogg"],
] as const;
const ranks = ["landlubber", "deckhand", "sailor", "helmsman", "navigator", "skipper", "captain", "sea-legend"];
function serveCore(app: ReturnType<typeof harness>) {
  for (const [path, contentType] of core) {
    app.serve(path, new Response(`asset:${path}`, { headers: { "content-type": contentType } }));
  }
  for (const rank of ranks) {
    app.serve(`/brand/ranks/${rank}.png`, new Response(`icon:${rank}`, { headers: { "content-type": "image/png" } }));
  }
}

describe("offline navigation shell", () => {
  it("keeps the warm shell when a new bundle fails, then commits a recovered upgrade", async () => {
    const app = harness();
    app.online(html('<script src="/assets/old.js"></script>'));
    app.serve("/assets/old.js", javascript("oldBoot();"));
    await app.navigate();
    app.online(html('<link href="/assets/new.css"><script src="/assets/new.js"></script>'));
    app.serve("/assets/new.css", css("body { color: white; }"));
    app.serve("/assets/new.js", new Response("unavailable", { status: 503 }));
    expect(await (await app.navigate()).text()).toContain("/assets/old.js");
    app.offline();
    expect(await (await app.navigate("/?interrupted=1")).text()).toContain("/assets/old.js");
    expect(await (await app.asset("/assets/old.js")).text()).toBe("oldBoot();");
    app.online(html('<link href="/assets/new.css"><script src="/assets/new.js"></script>'));
    app.serve("/assets/new.js", javascript("newBoot();"));
    expect(await (await app.navigate()).text()).toContain("/assets/new.js");
    app.offline();
    expect(await (await app.navigate("/?recovered=1")).text()).toContain("/assets/new.js");
    expect(await (await app.asset("/assets/new.js")).text()).toBe("newBoot();");
    expect(await (await app.asset("/assets/new.css")).text()).toBe("body { color: white; }");
  });

  it("rejects HTTP200 HTML boot fallbacks and poisoned cache hits, then recovers valid JS and CSS", async () => {
    for (const [path, markup, validResponse] of [
      ["/assets/new.js", '<script src="/assets/new.js"></script>', javascript("newBoot();")],
      ["/assets/new.css", '<link href="/assets/new.css">', css("body { color: white; }")],
    ] as const) for (const cached of [false, true]) {
      const app = harness();
      app.online(html('<script src="/assets/old.js"></script>'));
      app.serve("/assets/old.js", javascript("oldBoot();"));
      await app.navigate();
      if (cached) app.seedCached(path, html("<!doctype html>stale fallback"));
      app.online(html(markup)); app.serve(path, html("<!doctype html>missing asset"));
      expect(await (await app.navigate()).text()).toContain("/assets/old.js");
      app.offline(); expect(await (await app.navigate()).text()).toContain("/assets/old.js");
      app.online(html(markup)); app.serve(path, validResponse);
      expect(await (await app.navigate()).text()).toBe(markup);
      app.offline(); expect(await (await app.navigate()).text()).toBe(markup);
      const boot = await app.asset(path);
      expect(boot.headers.get("content-type")).toBe(validResponse.headers.get("content-type"));
      expect(await boot.text()).toBe(await validResponse.clone().text());
    }
  });

  it("uses one root response during install and never activates an incomplete upgrade", async () => {
    const app = harness();
    serveCore(app);
    app.online(html('<script src="/assets/old.js"></script>'));
    app.serve("/assets/old.js", javascript("oldBoot();"));
    await app.navigate();
    app.online(html('<script src="/assets/new.js"></script>'));
    app.serve("/assets/new.js", new Response("missing", { status: 404 }));
    const before = app.rootRequests;
    let failed = false;
    try { await app.install(); } catch { failed = true; }
    expect(failed).toBe(true); expect(app.didSkipWaiting).toBe(false);
    expect(app.rootRequests - before).toBe(1);
    app.offline();
    expect(await (await app.navigate()).text()).toContain("/assets/old.js");
  });

  it("rejects an HTML core asset during install, retaining the working shell until a valid retry", async () => {
    for (const path of ["/models/fair-winds-boat-v2.glb", "/brand/ranks/deckhand.png"]) for (const cached of [false, true]) {
      const app = harness(); serveCore(app);
      app.online(html('<script src="/assets/old.js"></script>'));
      app.serve("/assets/old.js", javascript("oldBoot();")); await app.navigate();
      app.online(html('<script src="/assets/new.js"></script>'));
      app.serve("/assets/new.js", javascript("newBoot();"));
      if (cached) app.seedCached(path, html("<!doctype html>stale core fallback"));
      app.serve(path, html("<!doctype html>missing core asset"));
      let failed = false; try { await app.install(); } catch { failed = true; }
      expect(failed).toBe(true); expect(app.didSkipWaiting).toBe(false);
      app.offline(); expect(await (await app.navigate()).text()).toContain("/assets/old.js");
      expect(await (await app.asset("/assets/old.js")).text()).toBe("oldBoot();");
      serveCore(app); app.online(html('<script src="/assets/new.js"></script>'));
      expect(await app.install()).toBe(true);
      app.offline(); expect(await (await app.navigate()).text()).toContain("/assets/new.js");
      expect((await app.asset(path)).headers.get("content-type")).toBe(path.endsWith(".glb") ? "model/gltf-binary" : "image/png");
    }
  });

  it("does not serve cached core HTML or persist a network fallback, and repairs it when the host recovers", async () => {
    for (const path of ["/models/fair-winds-boat-v2.glb", "/brand/ranks/deckhand.png"]) for (const cached of [false, true]) {
      const app = harness(); serveCore(app); app.online(html("game"));
      if (cached) app.seedCached(path, html("<!doctype html>stale core fallback"));
      app.serve(path, html("<!doctype html>missing core asset"));
      let failed = false; try { await app.asset(path); } catch { failed = true; }
      expect(failed).toBe(true);
      app.offline(); failed = false; try { await app.asset(path); } catch { failed = true; }
      expect(failed).toBe(true);
      serveCore(app); app.online(html("game"));
      const recovered = await app.asset(path);
      expect(recovered.headers.get("content-type")).toBe(path.endsWith(".glb") ? "model/gltf-binary" : "image/png");
      const body = await recovered.text(), beforeOffline = app.networkRequests;
      app.offline(); expect(await (await app.asset(path)).text()).toBe(body);
      expect(app.networkRequests).toBe(beforeOffline);
    }
  });

  it("keeps navigation pending until the new root cache write finishes", async () => {
    const app = harness(); app.online(html("old app")); await app.navigate();
    app.online(html("new app")); const release = app.pauseWrites();
    let finished = false;
    const navigation = app.navigate().then(response => { finished = true; return response; });
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(finished).toBe(false);
    app.offline(); expect(await (await app.navigate()).text()).toBe("old app");
    release(); expect(await (await navigation).text()).toBe("new app");
    expect(await (await app.navigate()).text()).toBe("new app");
  });

  it("installs the boat, lesson media, nonmusic audio and unseen level-up ranks for a fresh offline boot", async () => {
    const app = harness();
    app.online(html('<script src="/assets/game.js"></script>'));
    app.serve("/assets/game.js", new Response("bootGame();", {
      headers: { "content-type": "text/javascript" },
    }));
    serveCore(app);
    expect(await app.install()).toBe(true);
    const beforeOffline = app.networkRequests;
    app.offline();
    for (const [path, contentType] of core) {
      const response = await app.asset(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
      expect(await response.text()).toBe(`asset:${path}`);
    }
    for (const rank of ranks) {
      const icon = await app.asset(`/brand/ranks/${rank}.png`);
      expect(icon.status).toBe(200);
      expect(icon.headers.get("content-type")).toBe("image/png");
      expect(await icon.text()).toBe(`icon:${rank}`);
    }
    expect(await (await app.asset("/assets/game.js")).text()).toBe("bootGame();");
    expect(app.networkRequests).toBe(beforeOffline);
  });

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

  it("keeps valid credits HTML separate from the offline game and accepts root/index query refreshes", async () => {
    const credits = readFileSync("public/credits.html", "utf8");
    for (const path of ["/credits", "/credits.html"]) {
      const app = harness();
      app.online(html("working game"));
      await app.navigate();
      app.online(html(credits));
      expect(await (await app.navigate(path)).text()).toBe(credits);
      app.offline();
      expect(await (await app.navigate("/?offline=1")).text()).toBe("working game");
      app.online(html("refreshed game"));
      await app.navigate("/index.html?revision=2");
      app.offline();
      expect(await (await app.navigate("/?offline=2")).text()).toBe("refreshed game");
    }
  });
});
