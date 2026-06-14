// SO!Crates Service Worker
const CACHE    = "socrates-v2";
const STATIC   = ["/", "/index.html", "/app.js", "/styles.css", "/manifest.json",
                  "/SO-Crates_Icon.png", "/SO-Crates_Logo_mini.png",
                  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];

// Installatie: cache alle statische bestanden
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activatie: verwijder oude caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first voor statische assets, network-first voor API
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // API-calls (worker): altijd via netwerk, nooit cachen
  if (url.hostname.endsWith("workers.dev") || url.hostname.endsWith("winsol.eu")) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ error: "Offline — geen verbinding met de server." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  // Statische assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === "GET") {
          caches.open(CACHE).then(cache => cache.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});
