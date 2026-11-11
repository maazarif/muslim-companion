// Service worker: installs the whole app on first visit so it opens and calculates offline.
const VERSION = "companion-v1";
const FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "vendor/adhan-4.4.6.min.js",
  "fonts/figtree.woff", "fonts/amiri-regular.woff", "fonts/amiri-bold.woff",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Latest version when online, saved copy when offline.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.mode === "navigate" ? "index.html" : req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req.mode === "navigate" ? "index.html" : req, { ignoreSearch: true })));
});
