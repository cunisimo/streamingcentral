/* Service Worker — Push Notifications. RESERVADO, sin funcionalidad todavía.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * Para ACTIVAR (no ahora):
 *   1. Generar claves VAPID (web-push generate-vapid-keys).
 *   2. Guardar la pública en env (NEXT_PUBLIC_VAPID_KEY) y la privada en el server.
 *   3. Tabla push_subscriptions en Supabase (user_id, endpoint, keys) + RLS.
 *   4. Endpoint POST /api/push/subscribe que guarde la suscripción del cliente.
 *   5. Pedir permiso desde la app (Notification.requestPermission) y suscribir
 *      con registration.pushManager.subscribe(...).
 *   6. Descomentar los listeners de abajo.
 *
 * iOS: solo funciona en 16.4+ y con la app YA instalada en la pantalla de inicio.
 * No se puede pedir permiso desde una pestaña de Safari.
 */
/* global self, clients */

// self.addEventListener("push", (event) => {
//   const data = event.data ? event.data.json() : {};
//   event.waitUntil(
//     self.registration.showNotification(data.title || "StreamingCentral", {
//       body: data.body,
//       icon: "/icons/icon-192.png",
//       badge: "/icons/icon-192.png",
//       data: { url: data.url || "/" },
//     })
//   );
// });

// self.addEventListener("notificationclick", (event) => {
//   event.notification.close();
//   const url = event.notification.data?.url || "/";
//   event.waitUntil(
//     clients.matchAll({ type: "window" }).then((wins) => {
//       const win = wins.find((w) => w.url.includes(url));
//       if (win) return win.focus();
//       return clients.openWindow(url);
//     })
//   );
// });
