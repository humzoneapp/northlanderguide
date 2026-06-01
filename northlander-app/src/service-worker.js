/* ==================================================================
   Service worker for Northlander.app.
   Strategy: precache the app shell on install, cache-first for
   built assets, network-first for navigations so users always get
   the latest HTML when online but fall back to the cached shell
   when they're not.
   ================================================================== */

/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `northlander-${version}`;
const SHELL = [...build, ...files];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Take over immediately so the next page load uses the new SW.
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin only. Don't intercept third-party requests (fonts, etc.)
  // - the browser handles those better than we will.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (err) {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Last-resort fallback so an offline open shows something
          // instead of the browser's blank "no internet" page.
          const fallback = await caches.match('/');
          return fallback || Response.error();
        }
      })()
    );
    return;
  }

  // Build assets + static files: cache first, network as fallback.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Everything else: try the network, fall back to cache if offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Stash a copy of successful same-origin GETs so they're
        // available offline next time.
        if (res && res.ok && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
