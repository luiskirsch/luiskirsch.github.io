const CACHE = "osl-v33-lobby-forward-audio-trim";

const PRECACHE = [
  "/favicon.png",
  "/assets/lobby-room.webm?v=2",
  "/assets/lobby-room-v2.mp4?v=2",
  "/assets/luz-falhando.ogg",
  "/assets/luz-falhando.mp3",
  "/verso-carta.webp?v=2",
  "/js/reward-chest-loader.js?v=1",
  "/js/lobby-3d.js?v=5"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

function isLocalSite(url) {
  return url.hostname.includes("luiskirsch.github.io") ||
    url.hostname.includes("localhost") ||
    url.hostname.includes("preludiojogos");
}

async function updateCache(request, responsePromise) {
  try {
    const response = await responsePromise;
    if (response && response.ok && response.status !== 206) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (!/^https?:$/.test(url.protocol) || !isLocalSite(url) || request.method !== "GET") return;

  if (url.pathname.startsWith("/staging/")) {
    const stagingResponse = fetch(request).then(response => {
        const contentType = response.headers.get("content-type") || "";
        const expectsAsset = /\.(?:js|mjs|json|css)$/.test(url.pathname);
        if (expectsAsset && contentType.startsWith("text/html")) {
          return new Response("// blocked by SW: access intercept", {
            status: 401,
            headers: { "Content-Type": url.pathname.endsWith(".json") ? "application/json" : "application/javascript" }
          });
        }
        return response;
      });
    event.waitUntil(
      stagingResponse.then(response => {
        if (response.ok) return updateCache(request, Promise.resolve(response.clone()));
      }).catch(() => {})
    );
    event.respondWith(
      stagingResponse.catch(async () => (await caches.match(request)) || new Response("", { status: 503 }))
    );
    return;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    const network = event.preloadResponse.then(response => response || fetch(request));
    const refreshed = updateCache(request, network);
    event.waitUntil(refreshed);
    event.respondWith(
      caches.match(request).then(cached => cached || refreshed.then(response => response || new Response("", { status: 503 })))
    );
    return;
  }

  if (request.headers.has("range")) return;

  const shouldRefresh = ["script", "style", "worker", "manifest"].includes(request.destination) ||
    /\.(?:js|mjs|css|json)$/i.test(url.pathname);

  if (shouldRefresh) {
    const refreshed = updateCache(request, fetch(request));
    event.waitUntil(refreshed);
    event.respondWith(
      caches.match(request).then(cached => cached || refreshed.then(response => response || new Response("", { status: 503 })))
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return (await updateCache(request, fetch(request))) || new Response("", { status: 503 });
  })());
});
