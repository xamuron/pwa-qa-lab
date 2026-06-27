const APP_VERSION = '1.2.5';
const APP_CACHE = `qa-pwa-lab-app-${APP_VERSION}`;
const API_CACHE = `qa-pwa-lab-api-${APP_VERSION}`;
const IMAGE_CACHE = `qa-pwa-lab-images-${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-168.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './screenshots/desktop-wide.png',
  './screenshots/mobile.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('qa-pwa-lab-') && ![APP_CACHE, API_CACHE, IMAGE_CACHE].includes(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (url.origin === 'https://dummyjson.com' && url.pathname.startsWith('/products')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  if (url.origin === 'https://cdn.dummyjson.com' && event.request.destination === 'image') {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clientsList.find((item) => item.url.includes(self.location.origin));
    if (client) {
      client.focus();
      return;
    }
    await clients.openWindow('./index.html');
  })());
});

async function cacheFirst(request, cacheName = APP_CACHE) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok || (cacheName === IMAGE_CACHE && response.type === 'opaque')) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || network;
}
