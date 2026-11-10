const CACHE_VERSION = "fair-winds-shell-v5";
const CORE_SHELL = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/brand/fairwinds-icon.svg",
  "/brand/fairwinds-app-icon.svg",
  "/brand/fairwinds-wordmark.svg",
  "/brand/fairwinds-full.svg",
  "/brand/fairwinds-icons.svg",
  "/brand/fairwinds-approved-menu-board.png",
  "/brand/first-buoy-concept.png",
  "/brand/dummy-recovery-concept.png",
  "/models/fair-winds-boat-v2.glb",
  "/audio/water-hull.wav",
  "/audio/soft-sea-wind.wav",
  "/audio/distant-harbor.wav",
  "/audio/vhf-juniper-33a89e30.mp3",
  "/audio/wood-pigeon.ogg",
  "/audio/loon-calls.ogg",
  "/brand/ranks/landlubber.png",
  "/brand/ranks/deckhand.png",
  "/brand/ranks/sailor.png",
  "/brand/ranks/helmsman.png",
  "/brand/ranks/navigator.png",
  "/brand/ranks/skipper.png",
  "/brand/ranks/captain.png",
  "/brand/ranks/sea-legend.png",
];

function validBootAsset(asset, response) {
  if (!response?.ok) return false;
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (/\.m?js(?:[?#]|$)/.test(asset)) return ["text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(contentType);
  if (/\.css(?:[?#]|$)/.test(asset)) return contentType === "text/css";
  return contentType !== "text/html";
}

async function cacheRootDocument(cache, response) {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Invalid app document");
  const indexMarkup = await response.clone().text();
  const builtAssets = [...indexMarkup.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  const fetchedAssets = await Promise.all(builtAssets.map(async (asset) => {
    if (validBootAsset(asset, await cache.match(asset))) return;
    const assetResponse = await fetch(asset);
    if (!validBootAsset(asset, assetResponse)) throw new Error(`Invalid boot asset: ${asset}`);
    return { asset, response: assetResponse };
  }));
  await Promise.all(fetchedAssets.filter(Boolean).map(({ asset, response: assetResponse }) => cache.put(asset, assetResponse)));
  await cache.put("/", response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(async (cache) => {
        const indexResponse = await fetch("/");
        await cache.addAll(CORE_SHELL);
        await cacheRootDocument(cache, indexResponse);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("fair-winds-shell-") && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/music/")) {
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if ((url.pathname === "/" || url.pathname === "/index.html") && response.ok && response.headers.get("content-type")?.includes("text/html")) {
            try {
              const cache = await caches.open(CACHE_VERSION);
              await cacheRootDocument(cache, response);
            } catch {
              return (await caches.match("/").catch(() => undefined)) ?? response;
            }
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
