const VERSION = "varada-ems-v8";
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

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || "" }; }
  const title = payload.title || "Varada Nexus EMS";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "You have a new EMS notification.",
    icon: payload.icon || "/new-ems/assets/icons/ems-192.png",
    badge: payload.badge || "/new-ems/assets/icons/ems-192.png",
    tag: payload.tag || "varada-ems-notification",
    renotify: true,
    data: payload.data || { url: "/new-ems/modules/notifications-center/index.html" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/new-ems/modules/notifications-center/index.html", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

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
    // Security releases must not remain waiting behind an older installed PWA.
    // Activation triggers the existing controllerchange reload in pwa.js.
    await self.skipWaiting();
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
