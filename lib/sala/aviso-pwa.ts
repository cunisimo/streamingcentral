// ¿Esta ruta es parte del recorrido de una sala? Puro y client-safe.
//
// Lo usa `components/pwa/InstallPrompt.tsx` para no aparecer ahí (decisión del
// dueño, 27/09): ni antes del resultado —el banner podía saltar en medio de los
// 10 segundos de una votación— ni al final, donde compite con la invitación a
// instalar que vive en la pantalla de resultado.
//
// Cubre las DOS formas de la misma pantalla: `/sala/...` en la web y `/s` en el
// contenedor, que es la ruta por query que reemplaza al segmento dinámico. Hoy
// el banner ni siquiera se monta en el contenedor (`pwaActiva()` es false),
// pero la lista no depende de eso: si mañana cambia, esto sigue valiendo.

/** Prefijos de ruta que forman el recorrido. `/s` va exacto o con barra. */
export function enRecorridoDeSala(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/sala" || pathname.startsWith("/sala/")) return true;
  if (pathname === "/s" || pathname === "/s/" || pathname.startsWith("/s/?")) return true;
  return false;
}
