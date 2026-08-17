const CACHE = 'osl-v22-arena-lobby-session-fix';

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

  // /staging/* SEMPRE network-first; cache só fallback offline.
  // IMPORTANTE: Cloudflare Access pode retornar HTML de "Sign in" no lugar
  // de JS/JSON quando a sessão expira — NUNCA cachear esses interceptos.
  if (url.pathname.startsWith('/staging/')) {
    e.respondWith(
      fetch(request).then(res => {
        if (res && res.ok) {
          const ct = res.headers.get('content-type') || '';
          const expectedJs = /\.(js|mjs)$/.test(url.pathname);
          const expectedJson = /\.json$/.test(url.pathname);
          const expectedCss = /\.css$/.test(url.pathname);
          const isHtmlResponse = ct.indexOf('text/html') === 0;
          // Se esperava JS/JSON/CSS mas veio HTML, é Cloudflare Access intercept.
          // Não cacheia e não retorna pra app (bloqueia execução de HTML como JS).
          if ((expectedJs || expectedJson || expectedCss) && isHtmlResponse) {
            return new Response('// blocked by SW: Cloudflare Access intercept', {
              status: 401,
              headers: { 'Content-Type': expectedJson ? 'application/json' : 'application/javascript' }
            });
          }
          caches.open(CACHE).then(c => c.put(request, res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // HTML — network-first (sempre atualizado)
  if (request.destination === 'document') {
    const freshRequest = new Request(request, { cache: 'no-store' });
    e.respondWith(
      fetch(freshRequest)
        .then(res => {
          if (res && res.ok) {
            caches.open(CACHE).then(c => c.put(request, res.clone())).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
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
