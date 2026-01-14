const CACHE_NAME = 'musejakt-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './network.js',
    './manifest.json',
    './assets/cat.png',
    './assets/mouse.png',
    './assets/cheese.png',
    './assets/trap.png',
    './assets/wall.png',
    './assets/box.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
