// ¿Está encendido el módulo de reseñas de la comunidad? Para quien NO tiene
// sesión (E5a): decide si la ficha muestra la invitación a registrarse.
//
// Lo dice la ruta de lectura al responder 401 (`{resultado: "sin_sesion",
// activo}`): sólo el interruptor, nada de ningún título. Se pregunta UNA vez
// por carga de la app y se recuerda, para no sumar un pedido por ficha; un
// fallo no se recuerda (el próximo intento vuelve a preguntar) y vale como
// apagado: sin certeza, no se invita.
import { apiUrl } from "@/lib/api-base";

let recordado: Promise<boolean> | null = null;

export function moduloComunidadActivo(): Promise<boolean> {
  if (recordado) return recordado;
  const p = (async () => {
    const r = await fetch(apiUrl("/api/comunidad/resenas/lista"), { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { resultado?: unknown; activo?: unknown } | null;
    if (r.status !== 401 || !j || j.resultado !== "sin_sesion" || typeof j.activo !== "boolean") throw new Error("estado desconocido");
    return j.activo;
  })();
  recordado = p;
  return p.catch(() => {
    if (recordado === p) recordado = null;
    return false;
  });
}
