// Service worker mínimo: solo existe para que Chrome/Android consideren instalable la
// app (requisito de PWA) y para que, si se corta internet, el shell estático (HTML/JS/
// CSS/íconos) siga abriendo en vez de una pantalla en blanco. Nunca cachea nada de
// Supabase (otro origin, estas requests ni pasan por acá) — los datos siempre se piden
// en vivo, no hay riesgo de mostrar saldo/movimientos viejos por una cache vencida.
const CACHE = "ingresos247-shell-v1";
const ARCHIVOS_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./logo-icon.svg",
  "./logo-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Solo intercepta pedidos al propio sitio (mismo origin) y solo GET — todo lo demás
  // (Supabase, Mercado Pago, etc.) pasa directo a la red sin tocarlo.
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copia)).catch(() => {});
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});
