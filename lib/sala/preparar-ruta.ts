// Handler PURO de POST /api/sala/preparar. Sin Next ni Supabase: recibe la
// cabecera Authorization y el cuerpo crudo, y devuelve {status, body}. La ruta
// (app/api/sala/preparar/route.ts) sólo lo cablea. Así se prueba con
// node --test lo único que decide el contrato HTTP: kill switch, sesión,
// validación estricta (400, sin valores por defecto) y códigos de salida.
import { tokenDeHeader } from "../admin-auth-nucleo.ts";
import type { ArgsPreparar } from "./preparar-nucleo.ts";
import { DURACIONES, SIZES, type Duracion, type ResultadoPreparar, type Size } from "./tipos.ts";

export interface DepsRuta {
  /** `process.env.SALAS_ACTIVAS !== "0"` en producción. */
  salasActivas: boolean;
  /** `usuarioDeToken` de lib/supabase.ts: id del usuario o null. */
  usuarioDeToken: (token: string | null) => Promise<string | null>;
  /** `prepararRonda` ya cableada con service_role, cardsByIds y nombres. */
  preparar: (args: ArgsPreparar) => Promise<ResultadoPreparar>;
}

export interface Respuesta { status: number; body: unknown }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_MOTIVO: Record<Exclude<ResultadoPreparar, { ok: true }>["motivo"], number> = {
  insuficientes: 409, sin_quorum: 409, estado: 409, no_es_host: 403, desactivadas: 503, fallo: 500,
};

export async function manejarPreparar(
  req: { authorization: string | null; cuerpo: string },
  deps: DepsRuta,
): Promise<Respuesta> {
  // Kill switch del SERVIDOR (`SALAS_ACTIVAS`, sin prefijo: no llega al
  // navegador). El del cliente es `NEXT_PUBLIC_SALAS_ACTIVAS` y sólo oculta la
  // entrada; los dos se aplican con el siguiente deployment. El que impide de
  // verdad crear salas o entrar sin deploy es `sala_config.activas` en la base.
  if (!deps.salasActivas) return { status: 503, body: { ok: false, motivo: "desactivado" } };

  const uid = await deps.usuarioDeToken(tokenDeHeader(req.authorization));
  if (!uid) return { status: 401, body: { ok: false, motivo: "sin_sesion" } };

  let cuerpo: { room_id?: unknown; size?: unknown; duracion?: unknown };
  try { cuerpo = JSON.parse(req.cuerpo); } catch { return { status: 400, body: { ok: false, motivo: "cuerpo" } }; }
  if (!cuerpo || typeof cuerpo !== "object") return { status: 400, body: { ok: false, motivo: "cuerpo" } };

  // Sin valores por defecto: cantidad o duración inválidas son 400. El default
  // (10, Cualquiera) vive en la interfaz, no acá.
  const size = SIZES.find((s): s is Size => s === cuerpo.size);
  if (!size) return { status: 400, body: { ok: false, motivo: "size_invalido", permitidos: SIZES } };
  const duracion = DURACIONES.find((d): d is Duracion => d === cuerpo.duracion);
  if (!duracion) return { status: 400, body: { ok: false, motivo: "duracion_invalida", permitidas: DURACIONES } };
  if (typeof cuerpo.room_id !== "string" || !UUID.test(cuerpo.room_id)) return { status: 400, body: { ok: false, motivo: "room_id_invalido" } };

  // El organizador es quien firmó el JWT: el cuerpo no puede elegirlo.
  const res = await deps.preparar({ roomId: cuerpo.room_id, hostUid: uid, size, duracion });
  return { status: res.ok ? 200 : STATUS_MOTIVO[res.motivo], body: res };
}
