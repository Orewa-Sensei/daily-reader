const CACHE = 'daily-reader-shell-v13';
const SHELL = ['./', './index.html', './styles.css?v=20261121-4', './catalogue.js?v=20261123-6', './discovery.js?v=20261123-7', './recommendation-engine.js?v=20261123-6', './app.js?v=20261123-7', './manifest.webmanifest', './icon.svg'];
const META = './__daily_reader_cache_created__';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await cache.put(META, new Response(String(Date.now())));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.startsWith('daily-reader-shell-') && key !== CACHE) await caches.delete(key);
    }
    const cache = await caches.open(CACHE);
    const stamp = await cache.match(META);
    const created = stamp ? Number(await stamp.text()) : 0;
    if (!created || Date.now() - created > MAX_AGE) {
      await caches.delete(CACHE);
      const fresh = await caches.open(CACHE);
      await fresh.addAll(SHELL);
      await fresh.put(META, new Response(String(Date.now())));
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    let cache = await caches.open(CACHE);
    const stamp = await cache.match(META);
    const created = stamp ? Number(await stamp.text()) : 0;
    if (!created || Date.now() - created > MAX_AGE) {
      await caches.delete(CACHE);
      cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await cache.put(META, new Response(String(Date.now())));
        }
        return response;
      } catch (error) {
        return new Response('The 30-day offline cache has expired. Reconnect once to refresh the app and its reading library.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      return new Response('This page is not available offline yet. Reconnect to load it once, then it will be saved for offline reading.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});