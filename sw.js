// Service worker: installs the whole app on first visit so it opens and works offline,
// and keeps every hadith chapter you have opened.
const VERSION = "companion-v3";
const HADITH = VERSION + "-hadith";
const FILES = ["./", "index.html", "styles.css", "app.js", "util.js", "content.js", "giving.js", "giving-calc.js", "native.js", "manifest.webmanifest",
  "vendor/adhan-4.4.6.min.js", "vendor/capacitor-core-8.5.3.min.js",
  "data/athkar.json", "data/duas.json", "data/hadith-forty.json", "data/hadith-books.json",
  "fonts/figtree.woff", "fonts/amiri-regular.woff", "fonts/amiri-bold.woff",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    // keep downloaded hadith chapters across app updates: they come from a fixed version that never changes
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && !k.endsWith("-hadith")).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Hadith chapters come from a pinned commit of fawazahmed0/hadith-api, so a saved copy is always current.
const PINNED = url => (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/gh/fawazahmed0/hadith-api@"))
  || (url.hostname === "raw.githubusercontent.com" && url.pathname.startsWith("/fawazahmed0/hadith-api/"));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (PINNED(url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(HADITH).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // App files: latest version when online, saved copy when offline.
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.mode === "navigate" ? "index.html" : req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req.mode === "navigate" ? "index.html" : req, { ignoreSearch: true })));
});
