// ─────────────────────────────────────────────────────────────
// MYBISHBASH PHOTOBOOTH SERVICE WORKER
// Safari-safe / Chrome-safe / Firefox-safe
// Network-first with offline fallback
// ─────────────────────────────────────────────────────────────

const CACHE_NAME = 'mybishbash-photobooth-v11';

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
    caches.open(CACHE_NAME)
      .then(async cache => {
        /*
         * Cache assets individually rather than using cache.addAll().
         *
         * Safari can be unforgiving if one asset is missing or returns
         * an unexpected response. One bad asset should NOT kill the
         * entire Service Worker installation.
         */

        await Promise.all(
          STATIC_ASSETS.map(async asset => {
            try {
              const response = await fetch(
                new Request(asset, {
                  cache: 'no-cache'
                })
              );

              if (response.ok) {
                await cache.put(asset, response);
              } else {
                console.warn(
                  '[SW] Could not cache:',
                  asset,
                  response.status
                );
              }
            } catch (error) {
              console.warn(
                '[SW] Optional asset failed:',
                asset,
                error
              );
            }
          })
        );
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        /*
         * Never allow an installation failure to become an
         * unhandled promise rejection.
         */
        console.warn('[SW] Install completed with warnings:', error);
      })
  );
});

// ─────────────────────────────────────────────────────────────
// ACTIVATE
// ─────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Delete previous versions
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.startsWith('mybishbash-photobooth-') &&
                key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        )
      ),

      // Take control immediately
      self.clients.claim()
    ])
  );
});

// ─────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const request = event.request;

  // Only GET requests
  if (request.method !== 'GET') {
    return;
  }

  let url;

  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only handle requests from this site
  if (url.origin !== self.location.origin) {
    return;
  }

  /*
   * Let browser/internal requests pass through.
   *
   * This is especially helpful with Safari's favicon,
   * manifest and browser-generated requests.
   */

  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'http:'
  ) {
    return;
  }

  // Don't interfere with Chrome/Safari extension or dev requests
  if (
    url.pathname.startsWith('/.well-known/') ||
    url.pathname.startsWith('/__')
  ) {
    return;
  }

  // ───────────────────────────────────────────────────────────
  // NAVIGATION REQUEST
  // ───────────────────────────────────────────────────────────

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                return cache.put('/index.html', copy);
              })
              .catch(() => {
                // Cache failure must never break navigation
              });
          }

          return response;
        })
        .catch(() => {
          return caches.match('/index.html')
            .then(cached => {
              if (cached) {
                return cached;
              }

              return new Response(
                '<!doctype html><html><body>Photobooth temporarily unavailable.</body></html>',
                {
                  status: 503,
                  headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                  }
                }
              );
            });
        })
    );

    return;
  }

  // ───────────────────────────────────────────────────────────
  // FAVICON
  // ───────────────────────────────────────────────────────────

  if (url.pathname === '/favicon.ico') {
    /*
     * Don't make favicon failure capable of breaking the Service Worker.
     *
     * Try the network first, then cache, otherwise simply return
     * a 204 response.
     */

    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/favicon.ico'))
        .then(response => {
          if (response) {
            return response;
          }

          return new Response(null, {
            status: 204
          });
        })
    );

    return;
  }

  // ───────────────────────────────────────────────────────────
  // STATIC / NORMAL REQUESTS
  // ───────────────────────────────────────────────────────────

  event.respondWith(
    fetch(request)
      .then(response => {

        /*
         * Only cache successful same-origin responses.
         */
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          const copy = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(request, copy).catch(() => {});
            })
            .catch(() => {});
        }

        return response;
      })

      .catch(() => {
        return caches.match(request)
          .then(cached => {

            if (cached) {
              return cached;
            }

            /*
             * If the resource isn't cached, let the browser receive
             * a clean 503 rather than throwing an unhandled promise.
             */
            return new Response(
              'Offline',
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8'
                }
              }
            );
          });
      })
  );
});
