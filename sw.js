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

// Recordatorio diario por Web Push (ver supabase/functions/enviar-recordatorio-diario).
// Server y cliente se ponen de acuerdo en la forma del payload acá — si cambia uno,
// cambiar el otro.
self.addEventListener("push", (event) => {
  let datos = { title: "Ingresos247", body: "No te olvides de anotar tus gastos e ingresos de hoy.", url: "./index.html" };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    // si no vino como JSON, se usa el default de arriba
  }
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: datos.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./index.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      const existente = clientes.find((c) => c.url.includes(self.location.origin));
      if (existente) return existente.focus();
      return self.clients.openWindow(url);
    })
  );
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
