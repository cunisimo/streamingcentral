/* Service Worker — estrategias de caché.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * IIFE obligatorio (ver nota en config.js): aísla los locales del scope global
 * compartido por importScripts. Solo se expone self.SC_STRATEGIES.
 */
/* global self, caches, fetch, Response, Headers */

(function () {
  const { CACHE, IMAGE_LIMIT, IMAGE_MAX_AGE } = self.SC_CONFIG;

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

  // Network First: intenta red; si falla, cae al cache; si tampoco, al fallback.
  // Para documentos HTML: evita servir un shell viejo que referencie chunks ya
  // borrados tras un deploy, pero mantiene navegación offline.
  async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName);
    try {
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    } catch (err) {
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
