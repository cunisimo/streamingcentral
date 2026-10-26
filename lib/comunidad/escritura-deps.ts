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
import { huella, secretoDuplicados } from "./duplicados.ts";
import { conReconciliacion, errorRpc, type DependenciasEscritura, type RespuestaBase } from "./escritura-nucleo.ts";

// Todo error sale clasificado (`errorRpc`): rechazo confirmado por la base o
// confirmación perdida. Un 200 con un cuerpo que no es un resultado también es
// una confirmación perdida: la función pudo haber corrido entera.
async function rpcCrudo(admin: SupabaseClient, f: string, args: Record<string, unknown>): Promise<RespuestaBase> {
  const { data, error } = await admin.rpc(f, args);
  if (error) throw errorRpc(f, error);
  if (typeof data !== "object" || data === null || typeof (data as { resultado?: unknown }).resultado !== "string") {
    throw errorRpc(f, { message: "respuesta inesperada" });
  }
  return data as RespuestaBase;
}

// Las mutaciones sin texto se reconcilian acá mismo: repetirlas es seguro
// (votar lo mismo es `sin_cambios`, retirar lo retirado `sin_efecto`, borrar
// lo borrado `repetido`, aceptar los mismos términos no cambia nada).
const rpc = (admin: SupabaseClient, f: string, args: Record<string, unknown>) =>
  conReconciliacion(() => rpcCrudo(admin, f, args));

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function dependenciasEscritura(admin: SupabaseClient, secreto: string | null = secretoDuplicados()): DependenciasEscritura {
  return {
    textosRecientes: async (uid) => {
      const { data, error } = await admin.rpc("comunidad_textos_recientes", { p_uid: uid });
      if (error) throw errorRpc("comunidad_textos_recientes", error);
      return Array.isArray(data) ? data.filter((x): x is string => typeof x === "string") : [];
    },
    evaluar: (texto, contexto) => evaluarResena(texto, contexto),
    hash: sha256,
    huella: (texto) => {
      if (!secreto) throw new Error("falta COMUNIDAD_HMAC_DUPLICADOS");
      return huella(texto, secreto);
    },
    publicar: (a) => rpcCrudo(admin, "comunidad_publicar", {
      p_uid: a.uid, p_tipo: a.tipo, p_tmdb_id: a.tmdbId, p_texto: a.texto, p_decision: a.decision,
      p_id_intento: a.idIntento, p_hash: a.hash,
    }),
    editar: (a) => rpcCrudo(admin, "comunidad_editar", {
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
    // E3b. Denunciar es idempotente por (denunciante, versión) salvo en el
    // excedente (después de N filas por versión sólo suma un contador, que
    // ordena y nunca oculta); retener por regla, bloquear y desbloquear lo son.
    denunciar: (uid: string, versionId: number, categoria: string, comentario: string | null) =>
      rpc(admin, "comunidad_denunciar", { p_uid: uid, p_version: versionId, p_categoria: categoria, p_comentario: comentario }),
    retenerPorRegla: (versionId: number, decision: { resultado: string; version_reglas: string; reglas: string[] }) =>
      rpc(admin, "comunidad_retener_por_regla", { p_version: versionId, p_decision: decision }),
    bloquear: (uid: string, versionId: number) => rpc(admin, "comunidad_bloquear", { p_uid: uid, p_version: versionId }),
    desbloquear: (uid: string, bloqueoId: number) => rpc(admin, "comunidad_desbloquear", { p_uid: uid, p_bloqueo: bloqueoId }),
    bloqueados: async (uid: string) => {
      const { data, error } = await admin.rpc("comunidad_bloqueados", { p_uid: uid });
      if (error) throw errorRpc("comunidad_bloqueados", error);
      return data as Record<string, unknown>;
    },
    // E5a: la lectura de reseñas ya NO es de service_role (lib/comunidad/lectura.ts,
    // con la sesión del lector). Acá sólo queda el interruptor, para que la ruta
    // decida si muestra la invitación a registrarse a quien no tiene sesión.
    moduloActivo: async () => {
      const { data, error } = await admin.rpc("comunidad_modulo_activo");
      if (error) throw errorRpc("comunidad_modulo_activo", error);
      return data === true;
    },
  };
}
