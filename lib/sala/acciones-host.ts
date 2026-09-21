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
// éxito en error: el respaldo periódico la vuelve a intentar.
import { mensajeDeError, mensajeDePreparar } from "./mensajes.ts";
import { SIZES, type Duracion, type Size } from "./tipos.ts";

export type ResultadoAccion =
  | { ok: true }
  | { ok: false; texto: string; alcanzables?: Size[] };

export interface DepsPedirTanda {
  /** El access token de la sesión, o null si no hay. */
  jwt: () => Promise<string | null>;
  /** El POST ya cableado a `/api/sala/preparar`. */
  post: (body: { room_id: string; size: Size; duracion: Duracion }, jwt: string) => Promise<{ status: number; body: unknown }>;
  releer: () => Promise<void>;
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
    await d.releer().catch(() => { /* el respaldo de useSala reintenta */ });
    return { ok: true };
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
}

export async function desempatar(d: DepsDesempatar): Promise<ResultadoAccion> {
  let r: { data: unknown; error: { message: string } | null };
  try { r = await d.rpc(); } catch (e) { return { ok: false, texto: mensajeDeError(e instanceof Error ? e.message : null) }; }
  if (r.error) return { ok: false, texto: mensajeDeError(r.error.message) };
  await d.releer().catch(() => { /* idem */ });
  return { ok: true };
}
