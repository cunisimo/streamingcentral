// Adaptadores reales de las escrituras comunitarias: con QUÉ se hace cada
// paso. Sin `server-only` a propósito, para que la batería local
// (scripts/comunidad/pruebas-escritura.mjs) corra exactamente estos
// adaptadores contra `supabase start`, como lib/eliminar-cuenta-deps.ts. El
// cliente con la clave de servicio lo recibe de quien llama; en la app,
// lib/comunidad/escritura.ts (server-only) le pasa `supabaseAdmin()`.
//
// Toda escritura pasa por las funciones `public.comunidad_*` (migración
// 014), ejecutables SÓLO por service_role. Las tablas siguen cerradas.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluarResena } from "./reglas/decision.ts";
import type { DependenciasEscritura, RespuestaBase } from "./escritura-nucleo.ts";

async function rpc(admin: SupabaseClient, f: string, args: Record<string, unknown>): Promise<RespuestaBase> {
  const { data, error } = await admin.rpc(f, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (typeof data !== "object" || data === null || typeof (data as { resultado?: unknown }).resultado !== "string") {
    throw new Error(`${f}: respuesta inesperada`);
  }
  return data as RespuestaBase;
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function dependenciasEscritura(admin: SupabaseClient): DependenciasEscritura {
  return {
    textosRecientes: async (uid) => {
      const { data, error } = await admin.rpc("comunidad_textos_recientes", { p_uid: uid });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data.filter((x): x is string => typeof x === "string") : [];
    },
    evaluar: (texto, contexto) => evaluarResena(texto, contexto),
    hash: sha256,
    publicar: (a) => rpc(admin, "comunidad_publicar", {
      p_uid: a.uid, p_tipo: a.tipo, p_tmdb_id: a.tmdbId, p_texto: a.texto, p_decision: a.decision,
      p_id_intento: a.idIntento, p_hash: a.hash,
    }),
    editar: (a) => rpc(admin, "comunidad_editar", {
      p_uid: a.uid, p_resena: a.resenaId, p_version_esperada: a.versionEsperada, p_texto: a.texto,
      p_decision: a.decision, p_id_intento: a.idIntento, p_hash: a.hash,
    }),
  };
}

/** Las operaciones sin reglas de texto (filas A y B de la matriz). */
export function operacionesComunidad(admin: SupabaseClient) {
  return {
    borrar: (uid: string, resenaId: number) => rpc(admin, "comunidad_borrar", { p_uid: uid, p_resena: resenaId }),
    votar: (uid: string, versionId: number, util: boolean) =>
      rpc(admin, "comunidad_votar", { p_uid: uid, p_version: versionId, p_util: util }),
    retirarVoto: (uid: string, versionId: number) =>
      rpc(admin, "comunidad_retirar_voto", { p_uid: uid, p_version: versionId }),
    aceptarTerminos: (uid: string, version: string) =>
      rpc(admin, "comunidad_aceptar_terminos", { p_uid: uid, p_version: version }),
    leerTitulo: async (uid: string, tipo: string, tmdbId: number) => {
      const { data, error } = await admin.rpc("comunidad_leer_titulo", { p_uid: uid, p_tipo: tipo, p_tmdb_id: tmdbId });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data as Record<string, unknown>;
    },
  };
}
