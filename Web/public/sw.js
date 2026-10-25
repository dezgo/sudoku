// Service worker for /play/. Keeps the app usable offline:
//  - page loads: network first, falling back to the cached shell, so a new
//    deploy shows up on the next launch rather than a version later;
//  - built assets (hashed filenames), sounds, icons: cache first — a hashed
//    file never changes, so a cached copy is always correct;
//  - the API (/v1/*): never cached here. The app keeps its own offline copies
//    (daily cache, pending scores) in localStorage.

const CACHE = 'sudoku-crew-v1';
const SHELL = ['/play/', '/play/manifest.webmanifest', '/play/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/play/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put('/play/', copy));
          return resp;
        })
        .catch(() => caches.match('/play/')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        }),
    ),
  );
});
