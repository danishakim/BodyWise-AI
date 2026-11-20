// BodyWise service worker: makes the app installable and opens offline.
// - App shell (HTML/CSS/JS/icons): stale-while-revalidate, so updates arrive on the next launch.
// - /api/*: always network, never cached (health data and AI answers stay fresh and private).
// - Cross-origin requests (CDN, Teachable Machine) are left to the browser.
const VERSION = 'bodywise-v10';
const SHELL = [
  '/', '/css/styles.css', '/css/v2.css', '/css/flow.css', '/manifest.webmanifest',
  '/js/main.js', '/js/ui.js', '/js/store.js', '/js/api.js', '/js/theme.js', '/js/avatar.js', '/js/avatar3d.js', '/js/logged.js',
  '/js/views/onboarding.js', '/js/views/home.js', '/js/views/plan.js', '/js/views/snap.js',
  '/js/views/progress.js', '/js/views/coach.js', '/js/views/profile.js', '/js/views/settings.js',
  '/img/logo.svg', '/img/icon-192.png', '/img/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
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

  // Single-page app: every navigation gets the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
