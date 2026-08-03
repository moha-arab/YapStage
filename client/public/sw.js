// Service worker that deliberately caches NOTHING.
//
// Chrome only offers "install to home screen" when a page registers a service
// worker with a fetch handler, so one has to exist. But this app ships to prod
// several times a day and a caching worker is the classic way to serve someone
// a build from last week with no way to tell them. So this one exists purely to
// satisfy installability: every request goes straight to the network, exactly as
// if the worker were not here.
//
// If offline support is ever wanted, it belongs here — and it needs a real
// versioning story before it caches a single byte.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up after any earlier caching worker so nobody is stuck on stale
      // assets from a previous approach.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through. No cache reads, no cache writes.
  event.respondWith(fetch(event.request));
});
