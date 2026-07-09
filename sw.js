// Talk It Out service worker (Phase 6). Same convention as ATU 823's shell cache.
// Bump the version to invalidate the precache on a shell change.
const CACHE = 'tio-shell-v2';

// App shell + vendored libs precached for offline use. CDN-free: OpenCV,
// jscanify, Tesseract, jsPDF, and pdf-lib are all vendored same-origin so the
// scanner, OCR, and PDF build work with no network.
const PRECACHE = [
  '/app.html',
  '/index.html',
  '/privacy.html',
  '/terms.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/vendor/opencv.js',
  '/vendor/jscanify.min.js',
  '/vendor/tesseract/tesseract.min.js',
  '/vendor/tesseract/worker.min.js',
  '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  '/vendor/tesseract/tesseract-core-lstm.wasm.js',
  '/vendor/tesseract/eng.traineddata.gz',
  '/vendor/jspdf.umd.min.js',
  '/vendor/pdf-lib.min.js',
  '/vendor/pdfjs-pdf.min.js',
  '/vendor/pdfjs-pdf.worker.min.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      // addAll is atomic — precache individually so one 404 can't abort the
      // whole install (best-effort per-asset).
      return Promise.all(PRECACHE.map(function(u) {
        return c.add(u).catch(function(err) { console.warn('[sw] precache miss', u, err && err.message); });
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  const req = e.request;
  if (req.method !== 'GET') return; // never touch POST/PUT (auth, submissions, AI)

  const url = new URL(req.url);

  // API is always network-only — never serve stale auth/AI/submission data.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return; // default network handling
  }

  // Navigations: network-first (so a new deploy reaches users), fall back to the
  // cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function() {
      return caches.match('/app.html').then(function(r) { return r || caches.match(req); });
    }));
    return;
  }

  // Same-origin GET: stale-while-revalidate. Serve cache instantly, refresh in
  // the background. Cross-origin GETs fall through to the network.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function(cached) {
        const network = fetch(req).then(function(resp) {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(function(c) { c.put(req, copy); });
          }
          return resp;
        }).catch(function() { return cached; });
        return cached || network;
      })
    );
  }
});
