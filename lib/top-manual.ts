import "server-only";
// El Top semanal cargado a mano: lectura pública y operaciones del dashboard.
//
// ============================================================================
// DOS CONSUMIDORES MUY DISTINTOS
// ============================================================================
//  - **La app pública** lee lo publicado con la anon key y RLS: sólo ve
//    `estado = 'publicado'`. Son `ultimasPublicaciones` y `evidenciaTopManual`.
//  - **El dashboard** lee y escribe borradores CON LA SESIÓN DEL ADMIN (ver
//    `supabaseComoUsuario` en `admin-auth.ts`). Acá no se usa `service_role`:
//    con la clave de servicio las policies no correrían y la comprobación de
//    MFA en la base sería decorativa.
import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase";
import { backendCache } from "./cache";
import { resolverConCache } from "./reparar-y-cachear";
import { hoyAR } from "./fecha";
import {
  BLOQUES, claveBloque, evidenciaDeRankings, posicionesDeReordenar,
  type EntradaTop, type FilaEvidencia,
} from "./top-manual-nucleo";
import type { MediaType, PlatformCode } from "./types";

/** Cinco minutos, igual que la evidencia del top oficial y por lo mismo: el
 * techo de consultas no puede depender del tráfico. */
export const TTL_EVIDENCIA_MANUAL = 60 * 5;
/** Clave FIJA: la comparten todos los títulos, así una ficha vacía no cuesta
 * una consulta propia. Va en `CLAVES_SIN_HUELLA`: no hay nada localizado acá. */
export const CLAVE_EVIDENCIA_MANUAL = "disp:top-manual";

/**
 * Un minuto para la lista de publicaciones.
 *
 * ⚠️ ESTO NO ESTABA EN EL PLAN Y SE AGREGÓ AL MEDIR. `/api/top` es
 * `force-dynamic`, así que sin cache esta consulta corría **en cada pedido** —
 * y antes del cutover se sumaría a las dos que ya hace `latestWeekRows`,
 * pasando de 2 a 3 consultas por request. Con el minuto, el techo son 60 por
 * hora sin importar el tráfico.
 *
 * El precio es que un bloque recién publicado tarda hasta un minuto en
 * aparecer, incluido el momento del cutover y el contador "X de 12" del
 * dashboard. Es aceptable para algo que se publica una vez por semana.
 */
export const TTL_PUBLICACIONES = 60;
export const CLAVE_PUBLICACIONES = "top:manual:publicaciones";

export interface RankingFila {
  id: string;
  plataforma: PlatformCode;
  tipo: MediaType;
  estado: "borrador" | "publicado";
  captured_at: string;
  published_at: string | null;
  revisado_por: string | null;
  copiado_de: string | null;
  entradas: EntradaTop[];
}

const SELECT_RANKING =
  "id, plataforma, tipo, estado, captured_at, published_at, revisado_por, copiado_de, " +
  "top_ranking_entries(posicion, tipo, tmdb_id, titulo)";

interface CrudoRanking extends Omit<RankingFila, "entradas"> {
  top_ranking_entries?: EntradaTop[] | null;
}

const aFila = (r: CrudoRanking): RankingFila => ({
  ...r,
  entradas: [...(r.top_ranking_entries ?? [])].sort((a, b) => a.posicion - b.posicion),
});

// ============================================================================
// Lectura pública
// ============================================================================

/**
 * La última publicación de cada bloque.
 *
 * Trae TODAS las publicaciones y se queda con la más reciente por bloque en
 * memoria, en vez de hacer doce consultas con `limit 1`. Son pocas filas (una
 * por publicación) y una sola ida a la base; el índice parcial
 * `top_rankings_publicados` la cubre.
 */
export async function ultimasPublicaciones(): Promise<Map<string, RankingFila>> {
  const filas = await resolverConCache<CrudoRanking[]>({
    clave: CLAVE_PUBLICACIONES,
    ttl: TTL_PUBLICACIONES,
    backend: backendCache,
    producir: async () => {
      const db = supabaseServer();
      if (!db) return { valor: [], fallo: true };
      const { data, error } = await db
        .from("top_rankings")
        .select(SELECT_RANKING)
        .eq("estado", "publicado")
        .order("published_at", { ascending: false });
      // Un error de query NO es "no hay publicaciones": supabase-js devuelve
      // `{ data: null, error }` sin lanzar, y tratarlo como vacío haría que una
      // caída se lea como "todavía no hay Top" — o sea que apagaría el cutover.
      // Se marca `fallo` para que NO se guarde y el pedido siguiente reintente.
      if (error) return { valor: [], fallo: true };
      return { valor: (data ?? []) as unknown as CrudoRanking[], fallo: false };
    },
  });

  const out = new Map<string, RankingFila>();
  for (const r of filas) {
    const k = claveBloque(r.plataforma, r.tipo);
    if (!out.has(k)) out.set(k, aFila(r)); // ya vienen ordenadas desc
  }
  return out;
}

/**
 * La evidencia de disponibilidad que aportan los rankings publicados.
 *
 * La consume `resolverDisponibilidad` como procedencia `top-manual`. Cacheada
 * bajo una clave fija con TTL de 5 minutos: el techo son 12 consultas por hora,
 * haya el tráfico que haya — el mismo criterio que la evidencia de Netflix.
 *
 * 🔴 UN FALLO NO ES UNA AUSENCIA. Si la consulta falla se devuelve vacío **y no
 * se guarda**, para que el pedido siguiente reintente. Sin eso, una caída de
 * dos segundos dejaría títulos en gris durante cinco minutos.
 */
export async function evidenciaTopManual(): Promise<Map<string, PlatformCode[]>> {
  const filas = await resolverConCache<FilaEvidencia[]>({
    clave: CLAVE_EVIDENCIA_MANUAL,
    ttl: TTL_EVIDENCIA_MANUAL,
    backend: backendCache,
    producir: async () => {
      const db = supabaseServer();
      if (!db) return { valor: [], fallo: true };
      const { data, error } = await db
        .from("top_rankings")
        .select("plataforma, captured_at, top_ranking_entries(tipo, tmdb_id)")
        .eq("estado", "publicado");
      if (error) return { valor: [], fallo: true };
      const filas: FilaEvidencia[] = [];
      for (const r of (data ?? []) as unknown as
        { plataforma: string; captured_at: string; top_ranking_entries?: { tipo: string; tmdb_id: number }[] }[]) {
        for (const e of r.top_ranking_entries ?? []) {
          filas.push({
            plataforma: r.plataforma, tipo: e.tipo,
            tmdb_id: e.tmdb_id, captured_at: r.captured_at,
          });
        }
      }
      return { valor: filas, fallo: false };
    },
  });
  return evidenciaDeRankings(filas, hoyAR());
}

// ============================================================================
// Operaciones del dashboard (con la sesión del admin, bajo RLS)
// ============================================================================

/**
 * Los doce borradores, creándolos si faltan.
 *
 * Es idempotente: el índice parcial `top_rankings_un_borrador` garantiza uno
 * solo por bloque, así que dos pestañas abiertas a la vez no crean trece.
 */
export async function obtenerBorradores(sb: SupabaseClient): Promise<RankingFila[]> {
  const { data, error } = await sb
    .from("top_rankings").select(SELECT_RANKING).eq("estado", "borrador");
  if (error) throw new Error(error.message);

  const hay = new Map<string, CrudoRanking>();
  for (const r of (data ?? []) as unknown as CrudoRanking[]) {
    hay.set(claveBloque(r.plataforma, r.tipo), r);
  }
  const faltan = BLOQUES.filter((b) => !hay.has(claveBloque(b.plataforma, b.tipo)));
  if (faltan.length) {
    const { error: e2 } = await sb.from("top_rankings").insert(
      faltan.map((b) => ({ plataforma: b.plataforma, tipo: b.tipo, captured_at: hoyAR() })),
    );
    // Si otra pestaña los creó primero, el índice único rechaza y se relee.
    if (e2 && !/duplicate|unique/i.test(e2.message)) throw new Error(e2.message);
    const { data: d3, error: e3 } = await sb
      .from("top_rankings").select(SELECT_RANKING).eq("estado", "borrador");
    if (e3) throw new Error(e3.message);
    return ((d3 ?? []) as unknown as CrudoRanking[]).map(aFila);
  }
  return [...hay.values()].map(aFila);
}

/** Copia la última publicación de un bloque dentro de su borrador. */
export async function copiarPublicado(sb: SupabaseClient, borradorId: string): Promise<void> {
  const { data: b, error } = await sb
    .from("top_rankings").select("id, plataforma, tipo, estado").eq("id", borradorId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!b || b.estado !== "borrador") throw new Error("no es un borrador");

  const { data: pub, error: e2 } = await sb
    .from("top_rankings")
    .select(SELECT_RANKING)
    .eq("estado", "publicado").eq("plataforma", b.plataforma).eq("tipo", b.tipo)
    .order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!pub) throw new Error("ese bloque todavía no tiene publicación");

  const entradas = aFila(pub as unknown as CrudoRanking).entradas;
  await reemplazarEntradas(sb, borradorId, entradas);
  // `copiado_de` deja la cadena de correcciones reconstruible sin tocar la fila
  // publicada, que es inmutable.
  const { error: e3 } = await sb.from("top_rankings")
    .update({ copiado_de: (pub as unknown as { id: string }).id, revisado_por: null })
    .eq("id", borradorId);
  if (e3) throw new Error(e3.message);
}

/** Reemplaza las diez posiciones de un borrador en un solo paso. */
export async function reemplazarEntradas(
  sb: SupabaseClient, borradorId: string, entradas: EntradaTop[],
): Promise<void> {
  // Borrar y volver a insertar, no actualizar: `unique (ranking_id, posicion)`
  // rechazaría cualquier estado intermedio con dos títulos en la misma
  // posición, que es justo lo que pasa al reordenar.
  const { error: e1 } = await sb.from("top_ranking_entries")
    .delete().eq("ranking_id", borradorId);
  if (e1) throw new Error(e1.message);
  if (!entradas.length) return;
  const { error: e2 } = await sb.from("top_ranking_entries").insert(
    entradas.map((e) => ({
      ranking_id: borradorId, posicion: e.posicion,
      tipo: e.tipo, tmdb_id: e.tmdb_id, titulo: e.titulo,
    })),
  );
  if (e2) throw new Error(e2.message);
  await desmarcarRevisado(sb, borradorId);
}

/** Guarda una sola posición del borrador. */
export async function guardarPosicion(
  sb: SupabaseClient, borradorId: string, entrada: EntradaTop,
): Promise<void> {
  const { error } = await sb.from("top_ranking_entries").upsert(
    {
      ranking_id: borradorId, posicion: entrada.posicion,
      tipo: entrada.tipo, tmdb_id: entrada.tmdb_id, titulo: entrada.titulo,
    },
    { onConflict: "ranking_id,posicion" },
  );
  if (error) throw new Error(error.message);
  await desmarcarRevisado(sb, borradorId);
}

/** Mueve una posición y renumera. */
export async function reordenar(
  sb: SupabaseClient, borradorId: string, desde: number, hasta: number,
): Promise<EntradaTop[]> {
  const { data, error } = await sb.from("top_ranking_entries")
    .select("posicion, tipo, tmdb_id, titulo").eq("ranking_id", borradorId);
  if (error) throw new Error(error.message);
  const nuevas = posicionesDeReordenar((data ?? []) as EntradaTop[], desde, hasta);
  await reemplazarEntradas(sb, borradorId, nuevas);
  return nuevas;
}

/**
 * Marca o desmarca un bloque como revisado.
 *
 * 🔴 CUALQUIER CAMBIO LO DESMARCA. Es lo que hace que "Publicar revisados" no
 * pueda arrastrar un bloque que se tocó después de revisarlo: la marca vale
 * para el contenido que había cuando se puso.
 */
export async function marcarRevisado(
  sb: SupabaseClient, borradorId: string, uid: string | null,
): Promise<void> {
  const { error } = await sb.from("top_rankings")
    .update({ revisado_por: uid }).eq("id", borradorId);
  if (error) throw new Error(error.message);
}

const desmarcarRevisado = (sb: SupabaseClient, id: string) => marcarRevisado(sb, id, null);

/** Deja el borrador como la última publicación, o vacío si no hay ninguna. */
export async function restaurarBorrador(sb: SupabaseClient, borradorId: string): Promise<void> {
  try {
    await copiarPublicado(sb, borradorId);
  } catch (e) {
    if (!/todavía no tiene publicación/.test(String(e))) throw e;
    await reemplazarEntradas(sb, borradorId, []);
  }
}

export interface ResultadoPublicacion {
  ranking_id: string; plataforma: string | null; tipo: string | null;
  publicado: boolean; motivo: string | null;
}

/**
 * Publica los bloques indicados, en UNA transacción del lado de la base.
 *
 * La validación vive en `publicar_top` (migración 007) y no acá: si estuviera
 * en este archivo, entre validar y escribir cabría cualquier cosa, y una
 * llamada directa a PostgREST se la saltearía entera.
 */
export async function publicar(
  sb: SupabaseClient, ids: string[],
): Promise<ResultadoPublicacion[]> {
  const { data, error } = await sb.rpc("publicar_top", { p_ids: ids });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResultadoPublicacion[];
}

/**
 * Prepara una corrección de la publicación vigente: copia lo publicado al
 * borrador para editarlo. La fila publicada no se toca — la corrección será una
 * versión nueva.
 */
export const crearCorreccion = copiarPublicado;
