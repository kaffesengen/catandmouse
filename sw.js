const CACHE_NAME = 'musejakt-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './network.js',
    './manifest.json',
    './assets/cat.png',
    './assets/mouse.png',
    './assets/cheese.png',
    './assets/wall.png',
    './assets/box.png',
    './assets/trap.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
});
