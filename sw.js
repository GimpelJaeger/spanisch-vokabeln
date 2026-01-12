const CACHE_NAME = "vokabeltrainer-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json"
];

// Install: cache core files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: cleanup old caches if needed
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
});

// Fetch: cache-first for static, network for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // KI endpoint: always network (can't be offline)
  if (url.pathname === "/ai-vocab") {
    return;
  }

  // Navigation requests: try network, fallback cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      });
    })
  );
});