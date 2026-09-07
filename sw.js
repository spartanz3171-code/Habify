// ==========================================
// HABIFY - Service Worker for PWA Offline Support
// ==========================================

const CACHE_NAME = 'habify-v1.0.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './css/sprites.css',
    './js/i18n.js',
    './js/data.js',
    './js/engine.js',
    './js/views.js',
    './js/app.js',
    './js/supabase.min.js'
];

// Install Event - Caching App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Network First with Cache Fallback for dynamic content, Cache First for assets
self.addEventListener('fetch', (event) => {
    // Ignore non-GET requests or Supabase API calls from hard caching
    if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
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
                return caches.match(event.request);
            })
    );
});
