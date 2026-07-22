/* KILL-SWITCH del Service Worker — NO se despliega desde acá.
 *
 * QUÉ HACE
 * Desactiva la PWA para toda la flota ya instalada: borra todos los caches, se
 * desregistra a sí mismo y recarga las pestañas abiertas. Después de esto la app
 * queda como un sitio web normal, sin SW y sin caches.
 *
 * CUÁNDO USARLO
 * Cuando un SW publicado esté sirviendo algo roto y no puedas esperar al ciclo
 * normal de actualización: shell corrupto, loop de recargas, fallback offline
 * pegado, o un bug de caché que no se limpia con un bump de CACHE_VERSION.
 *
 * CÓMO PUBLICARLO
 *   1. cp docs/kill-switch-sw.js public/sw.js
 *   2. Borrar public/sw/ NO hace falta: este archivo no hace importScripts.
 *   3. Deploy.
 *   4. Cada cliente, en su próxima visita, trae este sw.js (los headers
 *      Cache-Control: no-cache de next.config.mjs garantizan que lo revalide),
 *      lo instala, y en activate se autodestruye.
 *
 * CÓMO VOLVER ATRÁS
 * Restaurar el sw.js real (git checkout public/sw.js), subir CACHE_VERSION y
 * deployar. Los clientes que ya pasaron por el kill-switch quedaron sin SW, así
 * que lo registran de nuevo como si fuera la primera visita.
 *
 * IMPORTANTE: no tiene handler de `fetch`. Un SW sin fetch handler no intercepta
 * nada, así que desde el momento en que se instala la red vuelve a ser directa,
 * incluso antes de que termine de limpiar.
 */
/* global self, caches */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 1. Borrar TODOS los caches, no solo los nuestros.
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    // 2. Desregistrarse.
    await self.registration.unregister();

    // 3. Recargar las pestañas abiertas para que salgan del control del SW.
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.navigate(client.url).catch(() => { /* pestaña cerrada o cross-origin */ });
    }
  })());
});
