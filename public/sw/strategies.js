/* Service Worker — estrategias de caché.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * IIFE obligatorio (ver nota en config.js): aísla los locales del scope global
 * compartido por importScripts. Solo se expone self.SC_STRATEGIES.
 */
/* global self, caches, fetch, Response, Headers */

(function () {
  const { CACHE, IMAGE_LIMIT, IMAGE_MAX_AGE, NETWORK_TIMEOUT_MS } = self.SC_CONFIG;

  // Cache First: sirve del cache si está; si no, red y guarda. Para recursos
  // inmutables (assets de Next con hash, imágenes de TMDB). Nunca sirve algo
  // obsoleto porque un cambio de contenido cambia la URL.
  async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  }

  // Network First CON TIMEOUT: intenta red; si falla O TARDA DEMASIADO, cae al
  // cache; si tampoco, al fallback.
  //
  // El timeout no es un lujo: en lie-fi (señal presente pero sin tránsito real —
  // subte, ascensor, borde de cobertura) el fetch no rechaza, queda colgado. Sin
  // carrera contra reloj, el catch nunca corre, el fallback nunca aparece y el
  // usuario mira una pantalla en blanco indefinidamente. Ni un servidor caído ni
  // la red apagada reproducen eso: ambos rechazan rápido.
  async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName);

    // La red sigue viva aunque perdamos la carrera: si llega después y está OK,
    // igual actualiza el cache para la próxima visita.
    const network = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("sw-network-timeout")), NETWORK_TIMEOUT_MS);
    });

    try {
      const res = await Promise.race([network, timeout]);
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      // Si ganó el timeout, el fetch sigue en vuelo: silenciamos un posible
      // rechazo posterior para no dejar una unhandled rejection en el SW.
      network.catch(() => { /* noop */ });
      const hit = await cache.match(request);
      if (hit) return hit;
      if (fallbackUrl) {
        // caches.match (global) busca en TODOS los caches. El fallback /offline
        // se precachea en sc-static, no en sc-pages, así que un cache.match sobre
        // este cache específico no lo encontraría.
        const fb = await caches.match(fallbackUrl);
        if (fb) return fb;
      }
      throw err;
    }
  }

  // Network Only: nunca toca el cache. Para /api/* y Supabase — mostrar datos
  // viejos ahí sería peor que fallar. El fallo lo maneja la UI (<OfflineState>).
  async function networkOnly(request) {
    return fetch(request);
  }

  // Recorta un cache al límite de entradas, borrando las más viejas (FIFO, que
  // para imágenes inmutables aproxima bien un LRU).
  async function trimCache(cacheName, limit) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= limit) return;
    for (let i = 0; i < keys.length - limit; i++) {
      await cache.delete(keys[i]);
    }
  }

  // Cache First con expiración + LRU por cantidad, para imágenes de TMDB.
  async function cacheFirstImage(request) {
    const cache = await caches.open(CACHE.images);
    const hit = await cache.match(request);
    if (hit) {
      const ts = Number(hit.headers.get("sw-cached-at") || 0);
      if (Date.now() - ts < IMAGE_MAX_AGE) return hit;
      await cache.delete(request); // expirada
    }
    const res = await fetch(request);
    if (res.ok) {
      // Guardamos con timestamp propio en un header para poder expirar.
      const body = await res.clone().blob();
      const headers = new Headers(res.headers);
      headers.set("sw-cached-at", String(Date.now()));
      const stamped = new Response(body, { status: res.status, statusText: res.statusText, headers });
      await cache.put(request, stamped);
      trimCache(CACHE.images, IMAGE_LIMIT); // sin await: no bloquea la respuesta
    }
    return res;
  }

  self.SC_STRATEGIES = { cacheFirst, networkFirst, networkOnly, cacheFirstImage, trimCache };
})();
