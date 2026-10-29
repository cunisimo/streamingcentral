// Cableado de las escrituras comunitarias en el servidor (E3a). El orden vive
// en ./escritura-nucleo (puro, con tests) y los adaptadores en
// ./escritura-deps. Acá sólo se conecta la clave de servicio, que nunca sale
// del servidor.
//
// ⚠️ Requiere las migraciones 011–014 aplicadas: sin las funciones
// `comunidad_*`, toda escritura responde "error" sin guardar nada. Las
// migraciones van ANTES que este código (plan, orden de despliegue).
import "server-only";
import { NextResponse } from "next/server";
import { sesionDeToken } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { escribirResena, esBajaEnCurso, type PedidoEscritura, type ResultadoEscritura } from "./escritura-nucleo";

export { estadoHttp } from "./escritura-nucleo";
import { dependenciasEscritura, dependenciasNombre, operacionesComunidad } from "./escritura-deps";
import { cambiarNombre, type PedidoNombre, type ResultadoNombre } from "./nombre-nucleo";
import { evaluarResena } from "./reglas/decision";
import { denunciarVersion, type PedidoDenuncia } from "./moderacion-nucleo";

const SIN_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };
export const responder = (body: unknown, status: number) => NextResponse.json(body, { status, headers: SIN_CACHE });

/** El uid del Bearer, verificado contra Auth. Nunca sale del cuerpo. */
export async function uidDe(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const s = await sesionDeToken(token);
  return s?.id ?? null;
}

export async function cuerpoJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const j = await req.json();
    return typeof j === "object" && j !== null && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function escribir(p: PedidoEscritura): Promise<ResultadoEscritura | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  return escribirResena(dependenciasEscritura(admin), p);
}

/**
 * Operaciones sin texto. null = sin configuración. Las mutaciones ya vuelven
 * reconciliadas (`sin_confirmar` si la confirmación se perdió dos veces), así
 * que una excepción acá es un rechazo CONFIRMADO de la base: "error" sólo
 * cuando se sabe que no se hizo nada.
 */
export async function operar<T>(f: (ops: ReturnType<typeof operacionesComunidad>) => Promise<T>): Promise<T | Record<string, unknown> | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  try {
    return await f(operacionesComunidad(admin));
  } catch (e) {
    return esBajaEnCurso(e) ? { resultado: "baja_en_curso" } : { resultado: "error" };
  }
}

/**
 * Una denuncia (E3b): el núcleo de ./moderacion-nucleo con los adaptadores
 * reales. La corroboración corre las reglas vigentes sin el contexto de
 * textos recientes del autor (la regla de contacto partido no mira ahí).
 */
export async function denunciar(p: PedidoDenuncia): Promise<Record<string, unknown> | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  const ops = operacionesComunidad(admin);
  return denunciarVersion({
    denunciar: ops.denunciar,
    evaluar: (texto) => evaluarResena(texto, { textosRecientes: [] }),
    retenerPorRegla: ops.retenerPorRegla,
    bloquear: ops.bloquear,
  }, p);
}

/** Cambiar el nombre comunitario (E6). null = sin configuración. */
export async function nombrar(p: PedidoNombre): Promise<ResultadoNombre | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  return cambiarNombre(dependenciasNombre(admin), p);
}
