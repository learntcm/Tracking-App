const CACHE_NAME = 'tracker-cache-v2';

const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon.png',     // your PNG logo
  './ad1.jpg',
  './ad2.jpg',
  './ad3.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
