/* Service Worker — Web Share Target. RESERVADO, sin funcionalidad todavía.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * Caso de uso previsto: que StreamingCentral aparezca en el menú "Compartir" de
 * Android y reciba un link/título compartido desde otra app (p. ej. para buscar
 * ese título en el catálogo).
 *
 * Para ACTIVAR (no ahora):
 *   1. Agregar el bloque "share_target" al manifest (app/manifest.ts):
 *        share_target: {
 *          action: "/compartido",
 *          method: "GET",
 *          params: { title: "title", text: "text", url: "url" },
 *        }
 *   2. Crear la ruta app/compartido/page.tsx que lea esos query params y
 *      redirija al buscador con el término recibido.
 *   3. Si el method fuese POST (para archivos), interceptar acá el fetch a
 *      /compartido y responder. Con GET no hace falta tocar el SW.
 *
 * ⚠️ Share Target solo funciona en Android. iOS no lo soporta.
 */
/* global self */

// Con share_target por GET, el navegador navega a /compartido?title=...&url=...
// y no se necesita código en el SW. Este archivo queda como recordatorio del
// punto de integración y para el caso POST (compartir archivos), que sí lo
// necesitaría.
