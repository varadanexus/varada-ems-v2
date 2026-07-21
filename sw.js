const VERSION = "varada-ems-v3";
const STATIC_CACHE = `${VERSION}-static`;

// Only public application-shell files belong here. Authenticated API responses,
// generated documents, storage downloads, and query-string URLs are never cached.
const APP_SHELL = [
  "/new-ems/manifest.webmanifest",
  "/new-ems/assets/css/app.css",
  "/new-ems/assets/css/responsive.css",
  "/new-ems/assets/css/premium.css",
  "/new-ems/assets/css/pwa.css",
  "/new-ems/assets/icons/ems-192.png",
  "/new-ems/assets/icons/ems-512.png",
  "/new-ems/assets/icons/ems-maskable-512.png",
  "/new-ems/shared/pwa.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL);

    // Some static hosts redirect `offline.html` to a clean `/offline` URL.
    // Rebuild the response before caching so offline navigation never receives
    // a redirected response, which browsers may reject for a fetch fallback.
    const response = await fetch("/new-ems/offline.html");
    if (!response.ok) throw new Error("Unable to cache the EMS offline page.");
    const html = await response.text();
    await cache.put("/new-ems/offline.html", new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("varada-ems-") && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/new-ems/offline.html"))
    );
    return;
  }

  const isVersionedStaticFile = url.search === "" &&
    url.pathname.startsWith("/new-ems/") &&
    /\.(?:css|js|png|svg|webp|ico|woff2?|webmanifest)$/i.test(url.pathname);

  if (!isVersionedStaticFile) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
