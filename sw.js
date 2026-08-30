// ─── SIMPLIFIED SERVICE WORKER FOR ALL BROWSERS ─────────────────────
const CACHE_NAME = 'mybishbash-photobooth-v10';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './fonts.js',
  './covers.js',
  './polaroid.js',
  './mp4.js',
  './product.js',
  './event.js',
  './strip.js',
  './motion.js',
  './app.js',
  './marketing.js',
  './landing.js',
  './assets/demo-photos.jpg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install – cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate – clean old caches and claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => {
        return Promise.all(
          keys.filter(key => key.startsWith('mybishbash-photobooth-') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch – try network first, fallback to cache
self.addEventListener('fetch', event => {
  const request = event.request;
  // Only handle GET requests for same-origin resources
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses for static assets
        if (response.status === 200 && response.type === 'basic') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned)).catch(() => {});
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request)
          .then(cached => {
            if (cached) return cached;
            // If navigating and no cache, return index.html
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});
