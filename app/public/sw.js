// Waypoint One service worker: app shell works offline (drivers lose signal on rural roads).
const CACHE = "waypoint-one-v16";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  // Live data never comes from the cache: offline, the app works from its own outbox and last confirmed copy.
  if (u.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  // Network first, so a new version shows straight away; the saved copy is used only without signal.
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cache.match(req))
    )
  );
});
