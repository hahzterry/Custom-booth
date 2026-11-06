// ─────────────────────────────────────────────────────────────
// LUMEE BOOTH SERVICE WORKER
// v12 — Safari-safe / Chrome-safe / Firefox-safe
// ─────────────────────────────────────────────────────────────

const CACHE_NAME = 'mybishbash-photobooth-v12';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',

  '/fonts.js',
  '/covers.js',
  '/polaroid.js',
  '/mp4.js',
  '/product.js',
  '/event.js',
  '/strip.js',
  '/motion.js',
  '/app.js',
  '/marketing.js',
  '/landing.js',

  '/assets/demo-photos.jpg',

  '/manifest.webmanifest',

  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ─────────────────────────────────────────────────────────────
// INSTALL
// ─────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);

        for (const asset of STATIC_ASSETS) {
          try {
            const response = await fetch(asset, {
              cache: 'no-store'
            });

            if (response && response.ok) {
              await cache.put(asset, response);
            }
          } catch (error) {
            console.warn('[SW] Could not cache:', asset);
          }
        }

        await self.skipWaiting();

      } catch (error) {
        console.warn('[SW] Install warning:', error);
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────
// ACTIVATE
// ─────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();

        await Promise.all(
          keys
            .filter(
              key =>
                key.startsWith('mybishbash-photobooth-') &&
                key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        );

        await self.clients.claim();

      } catch (error) {
        console.warn('[SW] Activate warning:', error);
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const request = event.request;

  // Never intercept non-GET requests.
  if (request.method !== 'GET') {
    return;
  }

  let url;

  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only handle this site's own requests.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Do not intercept browser/internal requests.
  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'http:'
  ) {
    return;
  }

  // ───────────────────────────────────────────────────────────
  // FAVICON
  // ───────────────────────────────────────────────────────────

  if (url.pathname === '/favicon.ico') {

    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          if (response) {
            return response;
          }
        } catch (error) {
          // Ignore favicon network failures.
        }

        try {
          const cached = await caches.match('/favicon.ico');

          if (cached) {
            return cached;
          }
        } catch (error) {
          // Ignore cache failures.
        }

        // A favicon is optional.
        return new Response(null, {
          status: 204
        });
      })()
    );

    return;
  }

  // ───────────────────────────────────────────────────────────
  // PAGE NAVIGATION
  // ───────────────────────────────────────────────────────────

  if (request.mode === 'navigate') {

    event.respondWith(
      (async () => {

        try {
          const response = await fetch(request);

          if (response && response.ok) {
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put('/index.html', response.clone());
            } catch (error) {
              // Cache failure must never break navigation.
            }
          }

          return response;

        } catch (networkError) {

          try {
            const cached = await caches.match('/index.html');

            if (cached) {
              return cached;
            }
          } catch (cacheError) {
            // Ignore cache failure.
          }

          return new Response(
            '<!doctype html>' +
            '<html>' +
            '<head><title>Lumee Booth</title></head>' +
            '<body>' +
            '<h1>Lumee Booth</h1>' +
            '<p>Unable to connect. Please try again.</p>' +
            '</body>' +
            '</html>',
            {
              status: 503,
              headers: {
                'Content-Type': 'text/html; charset=utf-8'
              }
            }
          );
        }

      })()
    );

    return;
  }

  // ───────────────────────────────────────────────────────────
  // EVERYTHING ELSE
  // ───────────────────────────────────────────────────────────

  event.respondWith(
    (async () => {

      // Network first.
      try {
        const response = await fetch(request);

        // Cache successful same-origin responses.
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          } catch (cacheError) {
            // Ignore cache errors.
          }
        }

        return response;

      } catch (networkError) {

        // Network failed. Try cache.
        try {
          const cached = await caches.match(request);

          if (cached) {
            return cached;
          }
        } catch (cacheError) {
          // Ignore cache errors.
        }

        // Nothing available.
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }

    })()
  );
});
