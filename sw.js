/* ─────────────────────────────────────────────────────────────────
   Plain Text Editor — sw.js  (Service Worker)
   Network-first strategy for the app shell — always fetches fresh
   files when online, falls back to cache when offline.
   API calls are never cached — always go to network.
   ───────────────────────────────────────────────────────────────── */

'use strict';

const CACHE_NAME = 'pte-v7';

// App shell files to pre-cache on install
const SHELL_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: pre-cache app shell ───────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for shell, network-only for API ───────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache API requests or non-GET requests
  if (event.request.method !== 'GET' || url.pathname.endsWith('api.php')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for app shell: fetch fresh, update cache, fall back to cache offline
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // Offline — serve from cache
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        // Last resort: return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
