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
  /**
   * ¿Está revisado? Columna DERIVADA de la base.
   *
   * 🔴 NO SE LEE `revisado_por`. Es un uuid revocado para `anon` y
   * `authenticated`, porque RLS filtra filas y no columnas: sin revocarlo,
   * cualquiera podía leer quién armó y quién firmó cada publicación. El panel
   * sólo necesita saber SI está revisado, y para eso está este booleano.
   */
  revisado: boolean;
  copiado_de: string | null;
  entradas: EntradaTop[];
}

const COLUMNAS =
  "id, plataforma, tipo, estado, captured_at, published_at, revisado, copiado_de";

/** Lo que lee el PANEL: el bloque entero con sus posiciones. */
const SELECT_RANKING = `${COLUMNAS}, top_ranking_entries(posicion, tipo, tmdb_id, titulo)`;

/**
 * Lo que lee la APP PÚBLICA. Sin `revisado` ni fechas de firma: el lector no
 * audita el ranking, sólo lo ve.
 */
const SELECT_PUBLICO =
  "id, plataforma, tipo, estado, captured_at, published_at, " +
  "top_ranking_entries(posicion, tipo, tmdb_id, titulo)";

interface CrudoRanking extends Omit<RankingFila, "entradas" | "revisado"> {
  revisado?: boolean;
  top_ranking_entries?: EntradaTop[] | null;
}

const aFila = (r: CrudoRanking): RankingFila => ({
  ...r,
  // La app pública no pide `revisado`, así que puede no venir: se asume que no.
  revisado: r.revisado ?? false,
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
        .select(SELECT_PUBLICO)
        .eq("estado", "publicado")
        .order("published_at", { ascending: false });
      // Un error de query NO es "no hay publicaciones": supabase-js devuelve
      // `{ data: null, error }` sin lanzar, y tratarlo como vacío haría que una
      // caída se lea como "todavía no hay Top" — o sea que apagaría el cutover.
      // Se marca `fallo` para que NO se guarde y el pedido siguiente reintente.
      if (error) {
        // Se loguea porque si no, "la tabla no existe todavía" y "Supabase
        // se cayó" son el mismo silencio: en los dos casos el gate no hace
        // cutover y `/top` sigue con la fuente vieja, que es correcto pero
        // no dice nada de por qué.
        console.error("[top-manual] no se pudieron leer las publicaciones —", error.message);
        return { valor: [], fallo: true };
      }
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
    // `creado_por` NO se manda: lo pone la base con `default auth.uid()`.
    // Antes tampoco se mandaba y la columna no tenía default, así que los
    // doce borradores iniciales nacían sin autoría y la PRIMERA publicación
    // de cada bloque quedaba sin firmar. Con el default lo registra la base,
    // también para un insert directo contra PostgREST — que es donde un
    // campo opcional siempre se olvida.
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
/**
 * Reemplaza las diez posiciones de un borrador.
 *
 * 🔴 UNA SOLA LLAMADA, Y ES UNA TRANSACCIÓN. Antes era `delete` y después
 * `insert` en dos requests distintos a PostgREST: si el segundo fallaba —red,
 * 500, token vencido entre uno y otro— el borrador quedaba **vacío** y lo
 * cargado se perdía. Y no era un caso raro: reordenar pasa por acá en cada
 * flecha.
 *
 * Borrar y escribir tienen que ir juntos por otro motivo además:
 * `unique (ranking_id, posicion)` rechaza cualquier estado intermedio con dos
 * títulos en la misma posición, que es justo lo que produce un reordenamiento.
 *
 * Desmarcar la revisión también pasó adentro de la función: así una llamada
 * directa a PostgREST tampoco puede saltearlo.
 */
export async function reemplazarEntradas(
  sb: SupabaseClient, borradorId: string, entradas: EntradaTop[],
): Promise<void> {
  const { error } = await sb.rpc("reemplazar_entradas", {
    p_ranking: borradorId,
    p_entradas: entradas.map((e) => ({
      posicion: e.posicion, tipo: e.tipo, tmdb_id: e.tmdb_id, titulo: e.titulo,
    })),
  });
  if (error) throw new Error(error.message);
}

/**
 * Guarda una sola posición del borrador.
 *
 * No pasa por `reemplazar_entradas` porque no hay riesgo: un `upsert` de una
 * fila es atómico de por sí, y el `unique` no se puede violar cambiando una
 * posición que ya existe por su misma posición.
 */
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
  // 🔴 YA NO SE DESMARCA DESDE ACÁ. Eran dos requests: si el segundo fallaba, el
  // bloque quedaba modificado y marcado como revisado, y se podía publicar
  // contenido que nadie revisó. Ahora lo hace un trigger
  // (`top_entries_invalidan_revision`), así que tampoco puede saltearlo una
  // llamada directa a PostgREST.
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

/**
 * Cambia la fecha de captura de un borrador.
 *
 * ⚠️ Hace falta porque `captured_at` nace con la fecha del día en que se creó
 * el borrador, que después de publicar es automática. Si quedara fija, un
 * bloque cargado el viernes para la semana del jueves diría el día equivocado
 * — y esa fecha es lo único que dice a qué semana corresponde el ranking.
 *
 * ⚠️ SÍ desmarca la revisión, y lo hace el trigger de la base: la fecha es
 * parte de lo que se revisó. Un bloque revisado para la semana del 4 no está
 * revisado para la del 11 sólo porque los títulos no cambiaron.
 */
export async function cambiarFecha(
  sb: SupabaseClient, borradorId: string, fecha: string,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("fecha inválida");
  const { error } = await sb.from("top_rankings")
    .update({ captured_at: fecha }).eq("id", borradorId).eq("estado", "borrador");
  if (error) throw new Error(error.message);
}

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
