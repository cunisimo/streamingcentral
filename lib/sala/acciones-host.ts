// Las dos acciones del organizador que cambian el estado de la sala desde el
// cliente (plan de salas, Etapas 3 y 4), sin React y con dependencias
// inyectadas: pedir una tanda (`POST /api/sala/preparar`, "Empezar" / "Otra
// tanda") y desempatar (`rpc sala_desempatar`).
//
// 🔴 TRAS UN ÉXITO SE RELEE EL ESTADO EN EL ACTO. Realtime sigue avisando a los
// demás participantes, pero quien tocó el botón no depende de recibir SU propio
// aviso por el canal: si el Broadcast tarda o no llega (proxy, red móvil), su
// pantalla igual pasa a `preparando` / a la rueda. La relectura va por
// `useSala.releer` (compuerta monotónica incluida) y su fallo no convierte el
// éxito en error.
//
// 🔴 Y SI ESA RELECTURA FALLA, HAY REINTENTOS ACOTADOS. El respaldo periódico de
// `useSala` sólo corre mientras el canal NO está `SUBSCRIBED`: con el canal
// conectado pero sin recibir el aviso —o con una caída de red de dos segundos
// justo en la relectura— la pantalla del que tocó se quedaba en el lobby hasta
// que algo más la moviera (volver a la pestaña, el plazo del lobby a los 15
// min). Por eso se reintenta con esperas crecientes y un tope: 3 reintentos,
// ~0,8 s + 2 s + 5 s, y después se abandona. NO es polling: la cadena termina
// sola y no se reprograma.
import { mensajeDeError, mensajeDePreparar } from "./mensajes.ts";
import { SIZES, type Duracion, type Size } from "./tipos.ts";

export type ResultadoAccion =
  | {
      ok: true;
      /**
       * Sólo cuando la relectura inmediata falló: la cadena de reintentos
       * acotados, ya en curso. La interfaz la ignora (el éxito ya se informó);
       * los tests la esperan.
       */
      relectura?: Promise<CadenaRelectura>;
    }
  | { ok: false; texto: string; alcanzables?: Size[] };

/** Cómo terminó la cadena de reintentos de la relectura. */
export interface CadenaRelectura { intentos: number; ok: boolean }

/** Esperas entre reintentos, en ms. Acotadas a propósito: la cadena se acaba. */
export const ESPERAS_RELECTURA = [800, 2000, 5000] as const;

export interface OpcionesRelectura {
  esperasMs?: readonly number[];
  /** Inyectable para los tests; por defecto, `setTimeout`. */
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Relee YA. Si esa primera lectura falla, deja andando una cadena de reintentos
 * acotada (no se espera acá: el botón no se queda colgado) y la devuelve.
 */
export async function asegurarRelectura(
  releer: () => Promise<void>,
  o: OpcionesRelectura = {},
): Promise<{ ok: boolean; pendiente?: Promise<CadenaRelectura> }> {
  try {
    await releer();
    return { ok: true };
  } catch {
    return { ok: false, pendiente: reintentarRelectura(releer, o) };
  }
}

async function reintentarRelectura(releer: () => Promise<void>, o: OpcionesRelectura): Promise<CadenaRelectura> {
  const esperas = o.esperasMs ?? ESPERAS_RELECTURA;
  const dormir = o.dormir ?? dormirReal;
  let intentos = 1;   // la inmediata, que ya falló
  for (const ms of esperas) {
    await dormir(ms);
    intentos++;
    try { await releer(); return { intentos, ok: true }; } catch { /* sigue */ }
  }
  // Se abandona: lo que queda es el canal, el respaldo de useSala mientras no
  // esté SUBSCRIBED, volver a la pestaña o el plazo del servidor.
  return { intentos, ok: false };
}

export interface DepsPedirTanda {
  /** El access token de la sesión, o null si no hay. */
  jwt: () => Promise<string | null>;
  /** El POST ya cableado a `/api/sala/preparar`. */
  post: (body: { room_id: string; size: Size; duracion: Duracion }, jwt: string) => Promise<{ status: number; body: unknown }>;
  releer: () => Promise<void>;
  relectura?: OpcionesRelectura;
}

export async function pedirTanda(d: DepsPedirTanda, roomId: string, size: Size, duracion: Duracion): Promise<ResultadoAccion> {
  let jwt: string | null;
  try { jwt = await d.jwt(); } catch { jwt = null; }
  if (!jwt) return { ok: false, texto: mensajeDePreparar(401, { motivo: "sin_sesion" }) };
  let r: { status: number; body: unknown };
  try {
    r = await d.post({ room_id: roomId, size, duracion }, jwt);
  } catch (e) {
    return { ok: false, texto: mensajeDeError(e instanceof Error ? e.message : null) };
  }
  if (r.status >= 200 && r.status < 300) {
    const rel = await asegurarRelectura(d.releer, d.relectura);
    return { ok: true, relectura: rel.pendiente };
  }
  const body = (r.body ?? null) as { motivo?: string; alcanzables?: number[] } | null;
  const alcanzables = body?.motivo === "insuficientes"
    ? (body.alcanzables ?? []).filter((s): s is Size => SIZES.includes(s as Size))
    : undefined;
  return { ok: false, texto: mensajeDePreparar(r.status, body), alcanzables };
}

export interface DepsDesempatar {
  /** `rpc("sala_desempatar", { p_room })`. */
  rpc: () => Promise<{ data: unknown; error: { message: string } | null }>;
  releer: () => Promise<void>;
  relectura?: OpcionesRelectura;
}

export async function desempatar(d: DepsDesempatar): Promise<ResultadoAccion> {
  let r: { data: unknown; error: { message: string } | null };
  try { r = await d.rpc(); } catch (e) { return { ok: false, texto: mensajeDeError(e instanceof Error ? e.message : null) }; }
  if (r.error) return { ok: false, texto: mensajeDeError(r.error.message) };
  const rel = await asegurarRelectura(d.releer, d.relectura);
  return { ok: true, relectura: rel.pendiente };
}
