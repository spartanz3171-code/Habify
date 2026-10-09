// ==========================================
// HABIFY - Service Worker for PWA Offline Support
// ==========================================

const CACHE_NAME = 'habify-v3.5.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './assets/backgrounds/arena_ruins.svg',
    './css/style.css?v=3.5.0',
    './css/sprites.css?v=3.5.0',
    './css/characters.css?v=3.5.0',
    './css/pets.css?v=3.5.0',
    './css/combat.css?v=3.5.0',
    './css/polish.css?v=3.5.0',
    './js/i18n.js?v=3.5.0',
    './js/characters.js?v=3.5.0',
    './js/pets.js?v=3.5.0',
    './js/data.js?v=3.5.0',
    './js/wardrobe.js?v=3.5.0',
    './js/habits.js?v=3.5.0',
    './js/recovery.js?v=3.5.0',
    './js/engine.js?v=3.5.0',
    './js/views.js?v=3.5.0',
    './js/atelier.js?v=3.5.0',
    './js/app.js?v=3.5.0',
    './js/supabase.min.js?v=3.5.0'
];

// Install Event - Caching App Shell
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell v3');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key.startsWith('habify-') && key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// Network first for app files; authentication and API traffic stay on the network.
self.addEventListener('fetch', (event) => {
    // Ignore non-GET requests or Supabase API calls from hard caching
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone & update cache
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // If offline, serve from cache
                return caches.match(event.request).then(cached => cached || Response.error());
            })
    );
});
