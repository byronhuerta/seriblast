const CACHE = 'seriblast-v1';
const STATIC = [
  '/',
  '/index.html',
  '/servicios.html',
  '/galeria.html',
  '/nosotros.html',
  '/contacto.html',
  '/cotizador.html',
  '/assets/css/style.css',
  '/assets/css/jarvis.css',
  '/assets/js/main.js',
  '/assets/js/jarvis.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Never intercept Netlify functions or external requests
  if (
    request.url.includes('/.netlify/') ||
    request.url.includes('fonts.googleapis') ||
    request.url.includes('fonts.gstatic') ||
    !request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  // Cache-first for static assets, network-first for HTML
  if (request.destination === 'document') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
  } else {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
