const CACHE_NAME = 'tracker-cache-v3';

const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon.png',
  './logo.png',
  './ad1.png',
  './ad2.png',
  './ad3.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
