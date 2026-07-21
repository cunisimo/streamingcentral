/* Service Worker — Background Sync. RESERVADO, sin funcionalidad todavía.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * Caso de uso previsto: encolar acciones hechas offline (votar, agregar a Mi
 * Lista) y reintentarlas cuando vuelve la conexión.
 *
 * Para ACTIVAR (no ahora):
 *   1. Guardar las acciones pendientes en IndexedDB desde el cliente.
 *   2. registration.sync.register("sc-flush") al detectar el fallo de red.
 *   3. Descomentar el listener y drenar la cola contra /api/* o Supabase.
 *
 * ⚠️ Background Sync NO existe en iOS ni en Safari de escritorio (solo Chrome/
 * Edge en Android/desktop). Necesita fallback: reintentar al recuperar foco o
 * al disparar el evento "online" desde la app.
 */
/* global self */

// self.addEventListener("sync", (event) => {
//   if (event.tag === "sc-flush") {
//     event.waitUntil(flushQueue());
//   }
// });
//
// async function flushQueue() {
//   // Leer IndexedDB, reintentar cada acción, borrar las que resuelven.
// }
