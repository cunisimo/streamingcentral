// El ORDEN de una escritura de reseña (crear o editar), separado de con qué
// se hace cada paso. PURO, con dependencias inyectadas, como
// lib/eliminar-cuenta-flujo.ts: los adaptadores reales viven en
// lib/comunidad/escritura-deps.ts y la batería local
// (scripts/comunidad/pruebas-escritura.mjs) corre ESTE núcleo con ESOS
// adaptadores contra Supabase local.
//
// Pasos (plan E3a; revisión §3.3, §3.4.1):
//   1. forma del pedido (id_intento uuid, ids enteros);
//   2. normalizar el texto (lib/comunidad/texto.ts) y validar su forma con
//      la MISMA cuenta y los mismos caracteres que la base. Un rechazo de
//      formato no toca la base ni consume límite;
//   3. contexto de las reglas: textos propios de las últimas 24 h;
//   4. reglas de E1. `error` → "No se pudo guardar" (nada se toca). Sólo
//      `publicar`, `retener` y `rechazo_contenido` llegan a la base;
//   5. función de la base (sólo service_role), que corre el protocolo, la
//      matriz, el límite y la idempotencia, y decide;
//   6. si la función falla, importa CÓMO (auditoría E3a, A1):
//      - antes de enviarla (pasos 1-4): "error", no se tocó la base;
//      - la base la RECHAZÓ (SQLSTATE o código de PostgREST, ver
//        `errorRpc`): la transacción se revirtió entera, "error";
//      - se perdió la confirmación (red, 5xx sin código, cuerpo ilegible):
//        pudo haberse guardado. Se repite UNA vez con el mismo id_intento y
//        el mismo hash: si había quedado, la base devuelve el resultado
//        guardado (`repetido`) sin escribir de nuevo. Si tampoco se confirma,
//        "sin_confirmar": nunca "no se guardó".
// El hash del pedido es sobre el pedido NORMALIZADO: un reintento del mismo
// envío da el mismo hash aunque cambien espacios en los bordes.
import type { Decision } from "./reglas/tipos.ts";
import { mensajeFormato, normalizarTexto, problemaFormato } from "./texto.ts";

export type AccionEscritura =
  | { tipo: "publicar"; titulo: { tipo: "movie" | "tv"; tmdbId: number } }
  | { tipo: "editar"; resenaId: number; versionEsperada: number };

export interface PedidoEscritura {
  uid: string;
  accion: AccionEscritura;
  texto: string;
  idIntento: string;
}

/** Lo que devuelve la función de la base (jsonb). */
export type RespuestaBase = Record<string, unknown> & { resultado: string };

export interface DependenciasEscritura {
  textosRecientes: (uid: string) => Promise<string[]>;
  evaluar: (texto: string, contexto: { textosRecientes: string[] }) => Decision;
  hash: (s: string) => string;
  publicar: (a: { uid: string; tipo: string; tmdbId: number; texto: string; decision: DecisionBase; idIntento: string; hash: string }) => Promise<RespuestaBase>;
  editar: (a: { uid: string; resenaId: number; versionEsperada: number; texto: string; decision: DecisionBase; idIntento: string; hash: string }) => Promise<RespuestaBase>;
}

export interface DecisionBase {
  resultado: "publicar" | "retener" | "rechazo_contenido";
  version_reglas: string;
  reglas: string[];
}

export type ResultadoEscritura =
  | { resultado: "invalido" }
  | { resultado: "rechazo_formato"; mensaje: string }
  | { resultado: "error" }
  | { resultado: "baja_en_curso" }
  | SinConfirmar
  | ({ resultado: "rechazo_contenido"; mensaje: string } & Record<string, unknown>)
  | RespuestaBase;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entero = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;

export function pedidoValido(p: PedidoEscritura): boolean {
  if (typeof p.uid !== "string" || !UUID.test(p.uid)) return false;
  if (typeof p.idIntento !== "string" || !UUID.test(p.idIntento)) return false;
  if (typeof p.texto !== "string" || p.texto.length > 20000) return false;
  const a = p.accion;
  if (a?.tipo === "publicar") return (a.titulo?.tipo === "movie" || a.titulo?.tipo === "tv") && entero(a.titulo.tmdbId);
  if (a?.tipo === "editar") return entero(a.resenaId) && entero(a.versionEsperada);
  return false;
}

/** El texto que se firma: la acción, sus ids y el texto normalizado. */
export function firmaPedido(accion: AccionEscritura, normalizado: string): string {
  const ids = accion.tipo === "publicar"
    ? ["publicar", accion.titulo.tipo, accion.titulo.tmdbId]
    : ["editar", accion.resenaId, accion.versionEsperada];
  return JSON.stringify([...ids, normalizado]);
}

/** SQLSTATE de baja en curso (E2b) en el error de la función. */
export const esBajaEnCurso = (e: unknown) =>
  /CB001|baja_en_curso/.test(String((e as { code?: string })?.code ?? "") + " " + String((e as Error)?.message ?? e));

export type SinConfirmar = { resultado: "sin_confirmar" };

/**
 * Un error de una función de la base, ya clasificado. `confirmado`: la base
 * respondió que no lo hizo (la transacción se revirtió). Si no, la respuesta
 * se perdió y pudo haberse confirmado.
 */
export class ErrorRpc extends Error {
  readonly code: string;
  readonly confirmado: boolean;
  constructor(message: string, code: string, confirmado: boolean) {
    super(message);
    this.code = code;
    this.confirmado = confirmado;
  }
}

// SQLSTATE que NO prueban que se revirtió: conexión perdida (08), el servidor
// se cayó o se reinició (57P), fallas del sistema (58, XX) y el
// `transaction_resolution_unknown` (08007) / `statement_completion_unknown`
// (40003). Con ellos el commit pudo haber ocurrido.
const SQLSTATE_INCIERTO = /^(08|57P|58|XX|40003)/;
// PostgREST: PGRST000/001 son conexión con la base perdida; el resto rechaza
// el pedido sin ejecutarlo (esquema, permisos, JWT, función inexistente…).
const PGRST_INCIERTO = /^PGRST00[01]$/;

/**
 * Clasifica lo que devolvió `supabase.rpc`. Medido contra Supabase local:
 * error de SQL → status 400 y SQLSTATE; PostgREST → `PGRSTnnn`; `fetch`
 * que lanza → status 0 y code ""; un proxy con 502 sin JSON → sin code.
 */
export function errorRpc(f: string, error: { message?: string; code?: string }): ErrorRpc {
  const code = typeof error.code === "string" ? error.code : "";
  const sqlstate = /^[0-9A-Z]{5}$/.test(code) && !code.startsWith("PGRST");
  const confirmado = sqlstate ? !SQLSTATE_INCIERTO.test(code) : /^PGRST\d{3}$/.test(code) && !PGRST_INCIERTO.test(code);
  return new ErrorRpc(`${f}: ${error.message ?? "error"}`, code, confirmado);
}

/** ¿El error prueba que la base NO hizo nada? Cualquier otro, no se sabe. */
export const errorConfirmado = (e: unknown) => e instanceof ErrorRpc && e.confirmado;

/**
 * Corre una función de la base que es idempotente por su id_intento (o por su
 * naturaleza: votar lo mismo es `sin_cambios`, borrar lo borrado es
 * `repetido`). Si la confirmación se perdió, la repite UNA vez con los mismos
 * argumentos para recuperar el resultado; si tampoco se confirma, devuelve
 * `sin_confirmar`. Un rechazo confirmado de la PRIMERA llamada se propaga:
 * ahí sí se sabe que no se hizo nada.
 */
export async function conReconciliacion<T>(f: () => Promise<T>): Promise<T | SinConfirmar> {
  try {
    return await f();
  } catch (e) {
    if (errorConfirmado(e)) throw e;
  }
  try {
    return await f();
  } catch {
    // Aunque la segunda la rechace, la primera pudo haber quedado.
    return { resultado: "sin_confirmar" };
  }
}

/**
 * HTTP de un resultado de escritura: 200 salvo pedido inválido, error
 * confirmado (500: no se guardó nada) o confirmación perdida (503: pudo
 * haberse guardado; el cuerpo lo dice y el cliente reintenta con el mismo
 * id_intento).
 */
export function estadoHttp(r: ResultadoEscritura | Record<string, unknown>): number {
  if (r.resultado === "invalido") return 400;
  if (r.resultado === "error") return 500;
  if (r.resultado === "sin_confirmar") return 503;
  return 200;
}

export async function escribirResena(deps: DependenciasEscritura, p: PedidoEscritura): Promise<ResultadoEscritura> {
  if (!pedidoValido(p)) return { resultado: "invalido" };
  const texto = normalizarTexto(p.texto);
  const problema = problemaFormato(texto);
  if (problema) return { resultado: "rechazo_formato", mensaje: mensajeFormato(problema) };

  let recientes: string[];
  try {
    recientes = await deps.textosRecientes(p.uid);
  } catch {
    return { resultado: "error" };
  }
  let d: Decision;
  try {
    d = deps.evaluar(texto, { textosRecientes: recientes.slice(0, 3) });
  } catch {
    return { resultado: "error" };
  }
  if (d.resultado === "error") return { resultado: "error" };
  if (d.resultado === "rechazo_formato") return { resultado: "rechazo_formato", mensaje: d.motivoUsuario };
  if (d.resultado !== "publicar" && d.resultado !== "retener" && d.resultado !== "rechazo_contenido") return { resultado: "error" };

  const decision: DecisionBase = {
    resultado: d.resultado,
    version_reglas: d.versionReglas,
    reglas: d.disparadas.filter((x) => x.resultado === d.resultado).map((x) => x.regla),
  };
  const hash = deps.hash(firmaPedido(p.accion, texto));
  const a = p.accion;
  // Una respuesta sin forma de resultado también es una confirmación perdida.
  const llamar = async () => {
    const x = a.tipo === "publicar"
      ? await deps.publicar({ uid: p.uid, tipo: a.titulo.tipo, tmdbId: a.titulo.tmdbId, texto, decision, idIntento: p.idIntento, hash })
      : await deps.editar({ uid: p.uid, resenaId: a.resenaId, versionEsperada: a.versionEsperada, texto, decision, idIntento: p.idIntento, hash });
    if (!x || typeof x.resultado !== "string") throw new Error("respuesta inesperada");
    return x;
  };
  let r: RespuestaBase | SinConfirmar;
  try {
    r = await conReconciliacion(llamar);
  } catch (e) {
    // Sólo llega acá un rechazo confirmado: no se guardó nada.
    return esBajaEnCurso(e) ? { resultado: "baja_en_curso" } : { resultado: "error" };
  }
  if (r.resultado === "sin_confirmar") return r;
  // El texto del rechazo de contenido lo dan las reglas, no la base (que no
  // guarda el texto rechazado). En un reintento, la decisión es la misma.
  if (r.resultado === "rechazo_contenido") return { ...r, resultado: "rechazo_contenido", mensaje: d.motivoUsuario };
  return r;
}
