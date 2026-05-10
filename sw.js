// ===== CONVOO SERVICE WORKER =====
// Handles PWA installation, caching, and offline functionality

const CACHE_NAME = 'convoo-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/config.js',
    '/main.js',
    '/logo.png',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Convoo: Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch((err) => {
                console.log('Convoo: Cache error during install:', err);
            })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Convoo: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached response if available
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type === 'error') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache successful responses
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Return offline page or cached response
                        return caches.match(event.request)
                            .then((response) => {
                                return response || new Response('Offline - cached content not available', {
                                    status: 503,
                                    statusText: 'Service Unavailable',
                                    headers: new Headers({
                                        'Content-Type': 'text/plain'
                                    })
                                });
                            });
                    });
            })
    );
});

// Background sync for messages (send when back online)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(
            clients.matchAll().then((matchedClients) => {
                matchedClients.forEach((client) => {
                    client.postMessage({
                        type: 'SYNC_MESSAGES'
                    });
                });
            })
        );
    }
});
