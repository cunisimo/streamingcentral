// «¿Sabías que…?»: acceso a Supabase. Lectura pública (ficha) y escrituras del
// panel. Las reglas puras están en `curiosidades-nucleo.ts`.
//
// ============================================================================
// LECTURA PÚBLICA: UNA CONSULTA POR FICHA, NUNCA EN LISTADOS
// ============================================================================
// La ficha pide `/api/curiosidad/<tipo>/<id>` DESPUÉS de dibujarse (no está en
// `/api/title`): el contenido principal no espera a esta consulta y un fallo
// acá no la rompe. Es UNA llamada RPC a `curiosidad_publicada` (índice único
// tipo+tmdb_id). El Home, los rieles y los listados NO la usan. Sin Redis ni
// caché de CDN: la ruta responde `no-store` (motivo y plazo en la ruta).
//
// ============================================================================
// ESCRITURAS: CON LA SESIÓN DEL ADMIN, BAJO RLS
// ============================================================================
// Igual que el Top: `supabaseComoUsuario(token)`, nunca `service_role`. La API
// ya pasó por `adminDeToken`; `is_admin_mfa()` en las policies vuelve a decidir.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase";
import {
  COLUMNAS_ADMIN, filaAAdmin, patronBusqueda, publicasDeFilas,
  type CamposCuriosidad, type CuriosidadAdmin, type CuriosidadPublica,
  type FilaCuriosidad, type FiltroEstado, type TipoTitulo,
} from "./curiosidades-nucleo";

/** Error de lectura: la ruta lo traduce a 503 y la ficha no muestra la sección. */
export class LecturaCuriosidadFallida extends Error {}

export async function curiosidadesPublicadas(tipo: TipoTitulo, tmdbId: number): Promise<CuriosidadPublica[]> {
  const sb = supabaseServer();
  if (!sb) throw new LecturaCuriosidadFallida("Supabase no configurado");
  const { data, error } = await sb.rpc("curiosidad_publicada", { p_tipo: tipo, p_tmdb_id: tmdbId });
  if (error) throw new LecturaCuriosidadFallida(error.message);
  return publicasDeFilas(data);
}

// --- Panel -------------------------------------------------------------------

export async function listarCuriosidades(
  sb: SupabaseClient, { q, estado }: { q?: string | null; estado: FiltroEstado },
): Promise<CuriosidadAdmin[]> {
  let consulta = sb.from("curiosidades").select(COLUMNAS_ADMIN)
    .order("updated_at", { ascending: false }).limit(200);
  if (estado !== "todas") consulta = consulta.eq("estado", estado);
  const patron = patronBusqueda(q);
  if (patron) consulta = consulta.ilike("titulo", patron);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCuriosidad[]).map(filaAAdmin);
}

export async function curiosidadDeTitulo(sb: SupabaseClient, tipo: TipoTitulo, tmdbId: number): Promise<CuriosidadAdmin | null> {
  const { data, error } = await sb.from("curiosidades").select(COLUMNAS_ADMIN)
    .eq("tipo", tipo).eq("tmdb_id", tmdbId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? filaAAdmin(data as unknown as FilaCuriosidad) : null;
}

/** Conflicto de unicidad: ya hay una curiosidad para ese título. */
export class CuriosidadDuplicada extends Error {
  readonly existente: CuriosidadAdmin | null;
  constructor(existente: CuriosidadAdmin | null) {
    super("ya existe una curiosidad para ese título");
    this.existente = existente;
  }
}
/** La fila no existe o RLS no la deja ver. */
export class CuriosidadInexistente extends Error {}

const columnasBorrador = (c: CamposCuriosidad) => ({
  texto: c.texto, fuente_nombre: c.fuenteNombre, fuente_url: c.fuenteUrl, spoiler: c.spoiler,
});
const columnasPublicadas = (c: CamposCuriosidad) => ({
  pub_texto: c.texto, pub_fuente_nombre: c.fuenteNombre, pub_fuente_url: c.fuenteUrl,
  pub_spoiler: c.spoiler, publicada: true,
});

export interface AltaCuriosidad {
  tipo: TipoTitulo;
  tmdbId: number;
  titulo: string;
  anio: number | null;
  poster: string | null;
  campos: CamposCuriosidad;
  publicar: boolean;
}

export async function crearCuriosidad(sb: SupabaseClient, a: AltaCuriosidad): Promise<CuriosidadAdmin> {
  const { data, error } = await sb.from("curiosidades").insert({
    tipo: a.tipo, tmdb_id: a.tmdbId, titulo: a.titulo, anio: a.anio, poster: a.poster,
    ...columnasBorrador(a.campos),
    ...(a.publicar ? columnasPublicadas(a.campos) : {}),
  }).select(COLUMNAS_ADMIN).single();
  if (error) {
    if (error.code === "23505") throw new CuriosidadDuplicada(await curiosidadDeTitulo(sb, a.tipo, a.tmdbId));
    throw new Error(error.message);
  }
  return filaAAdmin(data as unknown as FilaCuriosidad);
}

/**
 * Guarda el borrador y, con `publicar`, lo copia a la versión publicada en el
 * MISMO `update` (una sentencia: o quedan las dos cosas o ninguna).
 */
export async function guardarCuriosidad(sb: SupabaseClient, id: string, c: CamposCuriosidad, publicar: boolean): Promise<CuriosidadAdmin> {
  const { data, error } = await sb.from("curiosidades")
    .update({ ...columnasBorrador(c), ...(publicar ? columnasPublicadas(c) : {}) })
    .eq("id", id).select(COLUMNAS_ADMIN).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new CuriosidadInexistente("la curiosidad no existe");
  return filaAAdmin(data as unknown as FilaCuriosidad);
}

/** Retira de publicación: conserva la versión publicada y el borrador. */
export async function retirarCuriosidad(sb: SupabaseClient, id: string): Promise<CuriosidadAdmin> {
  const { data, error } = await sb.from("curiosidades").update({ publicada: false })
    .eq("id", id).select(COLUMNAS_ADMIN).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new CuriosidadInexistente("la curiosidad no existe");
  return filaAAdmin(data as unknown as FilaCuriosidad);
}
