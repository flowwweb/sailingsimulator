const CACHE_VERSION = "fair-winds-shell-v4";
const CORE_SHELL = [
  "/",
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(async (cache) => {
        await cache.addAll(CORE_SHELL);
        const indexResponse = await fetch("/");
        const indexMarkup = await indexResponse.clone().text();
        const builtAssets = [
          ...indexMarkup.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
        ].map((match) => match[1]);
        if (builtAssets.length > 0) await cache.addAll(builtAssets);
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
        .then((response) => {
          if ((url.pathname === "/" || url.pathname === "/index.html") && response.ok && response.headers.get("content-type")?.includes("text/html")) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put("/", copy));
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
