/* Севинчим — Service Worker (PWA)
 * - Сайт қобиғи ва статик файлларни кэшлайди (тез очилиш учун)
 * - Саҳифалар: аввал тармоқдан, интернет бўлмаса — кэшдан
 * - Радио оқими ва аудиолар (Range сўровлари) кэшланмайди
 */
const VERSION = "sv-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const SHELL = ["/", "/fm-radio", "/arxiv", "/haqida", "/media", "/icons/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.addAll(SHELL)).catch(() => undefined).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // радио оқими ва ташқи манбалар
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  // Next.js статик файллари, шрифтлар, иконкалар: кэш биринчи
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Саҳифалар (навигация ва RSC): тармоқ биринчи, офлайнда кэш
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error()),
    );
  }
});
