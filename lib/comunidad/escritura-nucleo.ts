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
//   6. si la función lanza: "error", no se guardó nada (la transacción se
//      revierte entera; nada se escribe antes de la marca).
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
  let r: RespuestaBase;
  try {
    r = p.accion.tipo === "publicar"
      ? await deps.publicar({ uid: p.uid, tipo: p.accion.titulo.tipo, tmdbId: p.accion.titulo.tmdbId, texto, decision, idIntento: p.idIntento, hash })
      : await deps.editar({ uid: p.uid, resenaId: p.accion.resenaId, versionEsperada: p.accion.versionEsperada, texto, decision, idIntento: p.idIntento, hash });
  } catch (e) {
    return esBajaEnCurso(e) ? { resultado: "baja_en_curso" } : { resultado: "error" };
  }
  if (!r || typeof r.resultado !== "string") return { resultado: "error" };
  // El texto del rechazo de contenido lo dan las reglas, no la base (que no
  // guarda el texto rechazado). En un reintento, la decisión es la misma.
  if (r.resultado === "rechazo_contenido") return { ...r, resultado: "rechazo_contenido", mensaje: d.motivoUsuario };
  return r;
}
