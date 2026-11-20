// BodyWise service worker: installable app that opens offline.
// - /assets/* (Vite output, content-hashed): cache-first; a new build gets new file names.
// - Navigations: network-first, falling back to the cached app shell.
// - Other same-origin files (icons, manifest): stale-while-revalidate.
// - /api/*: always network, never cached (health data and AI answers stay fresh and private).
// - Cross-origin requests (fonts, Teachable Machine model) are left to the browser.
const VERSION = 'bodywise-react-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/', '/manifest.webmanifest', '/img/logo.svg', '/img/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ error: "You're offline. This needs an internet connection." }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      caches.open(VERSION).then((c) => c.put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  event.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});
