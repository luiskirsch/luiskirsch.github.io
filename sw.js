const CACHE = 'osl-v3';

const PRECACHE = [
  '/favicon.png',
  '/frente-carta.png',
  '/verso-carta.png',
  '/digital.png',
  '/logo_oficial_fundo_transparente.png',
  '/lua_site_transparente.png',
  '/js/ui/animations.js',
  '/video.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignora Firebase, APIs externas e chrome-extension
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (!url.hostname.includes('luiskirsch.github.io') && !url.hostname.includes('localhost') && !url.hostname.includes('preludiojogos')) return;

  // Cache só aceita GETs — não interceptamos POST/PUT/DELETE (sendBeacon, forms,
  // etc). Deixa o navegador resolver direto pela rede.
  if (request.method !== 'GET') return;

  // /staging/* SEMPRE network-first (incluindo JS/CSS/JSON) — staging precisa
  // refletir mudanças instantaneamente sem invalidação de cache. Cache só
  // serve como fallback offline.
  if (url.pathname.startsWith('/staging/')) {
    e.respondWith(
      fetch(request).then(res => {
        if (res && res.ok && request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // HTML — network-first (sempre atualizado)
  if (request.destination === 'document') {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Assets estáticos — cache-first
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
