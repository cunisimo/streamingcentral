import "server-only";
import { searchTitles, watchProviders } from "./tmdb";
import { supabaseServer } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";
import { resolverTitulo } from "./netflix-resolver";
import {
  VENTANA_RECIENTE_MS, evidenciaCacheada, type FilaOficial,
} from "./top-plataformas";
import { backendCache } from "./cache";
import type { MediaType } from "./types";

// La regla de resolución vive en `lib/netflix-resolver.ts`, sin `server-only`,
// para poder probarla sin red. Se reexporta desde acá para no cambiarle la
// puerta de entrada a nadie.
export { normalizeTitle } from "./netflix-resolver";

// Top 10 semanal de Netflix en Argentina.
//
// El TSV es público y pesa 31 MB, pero está ordenado por país ascendente y
// semana descendente: Argentina de la última semana son las PRIMERAS 20 filas
// de datos. Por eso se lee el stream y se corta; no se baja el archivo entero.
const TSV_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv";
const NETFLIX_PROVIDER_ID = 8;
const FILAS_ESPERADAS = 20; // 10 Films + 10 TV

export interface NetflixRow {
  week: string;            // YYYY-MM-DD
  category: MediaType;
  rank: number;
  rawTitle: string;
}

export interface StoredRow {
  rank: number;
  rawTitle: string;
  tmdbId: number | null;
}

// Toma las primeras líneas del TSV y devuelve las filas de AR de la semana más
// reciente. Tira si el archivo no arranca como se espera: preferimos no
// escribir nada antes que escribir basura si Netflix cambia el orden.
export function parseArWeek(lines: string[]): NetflixRow[] {
  const [header, ...body] = lines;
  if (!header?.startsWith("country_name\tcountry_iso2\tweek\tcategory\tweekly_rank")) {
    throw new Error("El encabezado del TSV cambió");
  }
  const out: NetflixRow[] = [];
  let week: string | null = null;
  for (const line of body) {
    const c = line.split("\t");
    if (c.length < 6) continue;
    const [, iso2, w, category, rank, rawTitle] = c;
    if (iso2 !== "AR") break;
    if (week === null) week = w;
    if (w !== week) break;
    if (category !== "Films" && category !== "TV") {
      throw new Error(`Categoría inesperada en el TSV: ${category}`);
    }
    out.push({
      week: w,
      category: category === "Films" ? "movie" : "tv",
      rank: Number(rank),
      rawTitle,
    });
  }
  // Guard contra una inversión del orden del archivo: si Netflix alguna vez
  // ordenara semana ascendente en vez de descendente, el corte de las primeras
  // 20 filas de AR nos daría la semana más VIEJA, no la más reciente, y la
  // ingestaríamos como si fuera actual. Netflix publica la semana cerrada el
  // domingo anterior, así que en funcionamiento normal el desfase nunca pasa
  // de unos días; más de 30 solo se explica por un cambio de orden.
  if (week !== null && Date.now() - new Date(week).getTime() > 30 * 24 * 60 * 60 * 1000) {
    throw new Error(`La semana ${week} tiene más de 30 días: ¿se invirtió el orden del TSV?`);
  }
  if (out.length !== FILAS_ESPERADAS) {
    throw new Error(`Se esperaban ${FILAS_ESPERADAS} filas de AR, llegaron ${out.length}`);
  }
  return out;
}

// Lee el TSV cortando el stream apenas tiene las filas que necesita.
async function fetchArWeek(): Promise<NetflixRow[]> {
  const res = await fetch(TSV_URL, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok || !res.body) throw new Error(`TSV respondió ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const lines: string[] = [];
  let buf = "";
  try {
    // +2: el encabezado y una línea de margen para detectar el corte de país.
    while (lines.length < FILAS_ESPERADAS + 2) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      lines.push(...parts);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseArWeek(lines);
}

// Resuelve un título del TSV a un id de TMDB.
//
// La REGLA vive en `lib/netflix-resolver.ts` (probada sin red). Acá queda sólo
// el cableado a TMDB: las dos puertas que la regla usa, `buscar` y
// `enNetflixAR`, con el `category` ya atado.
//
// El contrato de cada puerta importa y no es simétrico:
//  - `buscar` LANZA si el transporte falla. La regla distingue "no encontré" de
//    "no sé", y sólo la primera habilita la segunda consulta.
//  - `enNetflixAR` NUNCA lanza: un error se ve como "no está en Netflix", que es
//    el lado seguro (no acepta a nadie por proveedor).
//
// Los 5 candidatos son el tope de siempre: TMDB devuelve 20 y más abajo del
// quinto ya no hay nada que sea el título que Netflix reportó.
async function resolveTitle(
  category: MediaType, rawTitle: string,
): Promise<{ tmdbId: number | null; needsReview: boolean }> {
  return resolverTitulo(rawTitle, {
    async buscar(consulta) {
      const r = await searchTitles(category, consulta);
      return (r.results ?? []).slice(0, 5).map((c) => ({
        id: c.id, title: c.title ?? c.name ?? "",
      }));
    },
    enNetflixAR: (id) => enNetflixAR(category, id),
  });
}

async function enNetflixAR(type: MediaType, id: number): Promise<boolean> {
  try {
    const r = await watchProviders(type, id);
    return (r.results?.AR?.flatrate ?? []).some((p) => p.provider_id === NETFLIX_PROVIDER_ID);
  } catch {
    return false;
  }
}

export async function ingestLatestWeek() {
  const db = supabaseAdmin();
  if (!db) throw new Error("Supabase no configurado (falta SUPABASE_SERVICE_ROLE_KEY)");

  const filas = await fetchArWeek();
  const week = filas[0].week;

  // Lo que ya está guardado para esa semana: si el raw_title no cambió, la fila
  // NO se toca. Así una corrección manual de tmdb_id sobrevive a los reintentos.
  // Chequeamos error explícito: supabase-js no lanza excepción ante un fallo de
  // query, devuelve { data: null, error }. Si no lo detectáramos, "previas"
  // quedaría vacío, las 20 filas se tratarían como pendientes y el upsert de
  // abajo reescribiría todo, pisando correcciones manuales de tmdb_id. Mejor
  // abortar sin escribir que ingestar sobre datos incompletos.
  const { data: previas, error: errPrevias } = await db
    .from("netflix_top10")
    .select("category,rank,raw_title,tmdb_id")
    .eq("week", week);
  if (errPrevias) throw new Error(`select de previas falló: ${errPrevias.message}`);
  const yaEsta = new Map(
    (previas ?? []).map((p) => [
      `${p.category}:${p.rank}`,
      { rawTitle: p.raw_title as string, tmdbId: p.tmdb_id as number | null },
    ]),
  );

  // Pendiente si es fila nueva, cambió el raw_title, o quedó sin resolver en un
  // intento anterior: un tmdb_id null no es una corrección manual, es una
  // resolución que falló, y el re-run tiene que volver a intentarla (si no,
  // queda en null hasta la semana que viene porque el raw_title no cambia).
  const pendientes = filas.filter((f) => {
    const prev = yaEsta.get(`${f.category}:${f.rank}`);
    return !prev || prev.rawTitle !== f.rawTitle || prev.tmdbId === null;
  });
  if (!pendientes.length) return { week, inserted: 0, resolved: 0, review: 0 };

  // Mapa de títulos ya resueltos en semanas anteriores, acotado por categoría:
  // un mismo nombre puede existir como película y como serie.
  const { data: conocidos, error: errConocidos } = await db
    .from("netflix_top10")
    .select("raw_title,category,tmdb_id")
    .in("raw_title", pendientes.map((f) => f.rawTitle))
    .not("tmdb_id", "is", null);
  if (errConocidos) throw new Error(`select de conocidos falló: ${errConocidos.message}`);
  const mapa = new Map(
    (conocidos ?? []).map((c) => [`${c.category}:${c.raw_title}`, c.tmdb_id as number]),
  );

  // Resolución en paralelo: sin esto, 20 títulos por hasta ~6 llamadas a TMDB
  // cada uno se resolvían de a uno y podían comerse el timeout del cron. No
  // hace falta un limitador de concurrencia acá: lib/tmdb.ts ya tiene un
  // semáforo global (MAX_EN_VUELO) que cubre toda la app.
  const resultados = await Promise.all(pendientes.map(async (f) => {
    const conocido = mapa.get(`${f.category}:${f.rawTitle}`);
    const r = conocido != null
      ? { tmdbId: conocido, needsReview: false }
      : await resolveTitle(f.category, f.rawTitle);
    return { f, r };
  }));

  const rows = [];
  let resolved = 0, review = 0;
  for (const { f, r } of resultados) {
    if (r.tmdbId != null) resolved++;
    if (r.needsReview) review++;
    rows.push({
      week: f.week, category: f.category, rank: f.rank, raw_title: f.rawTitle,
      tmdb_id: r.tmdbId, needs_review: r.needsReview, updated_at: new Date().toISOString(),
    });
  }

  const { error } = await db.from("netflix_top10").upsert(rows, {
    onConflict: "week,category,rank",
  });
  if (error) throw new Error(`upsert falló: ${error.message}`);
  return { week, inserted: rows.length, resolved, review };
}

// Semana guardada más vieja que esto ya no cuenta como "de esta semana": el
// llamador la trata igual que la tabla vacía y cae a popularidad. Netflix
// publica los martes la semana cerrada el domingo anterior, así que en
// funcionamiento normal el desfase nunca pasa de ~9 días (domingo a domingo +
// el margen hasta el martes de publicación); 14 da un margen de una semana
// completa extra para que un cron que falló UNA vez (el próximo lunes se
// recupera solo) no tire el bloque, sin llegar a sostener datos de hace meses
// bajo el sello "dato oficial" si el cron quedó roto en serio.
// El valor vive en `lib/top-plataformas.ts` para que la ficha y el bloque del
// Top usen literalmente el mismo umbral, no dos que hoy coinciden.
const SEMANA_VIEJA_MS = VENTANA_RECIENTE_MS;

// Devuelve la semana más reciente guardada, o null si no hay nada utilizable
// (tabla vacía, Supabase no configurado, o la última semana quedó vieja): en
// los tres casos el llamador cae a popularidad.
export async function latestWeekRows(): Promise<
  { week: string; movie: StoredRow[]; tv: StoredRow[] } | null
> {
  // Lectura: la cubre la policy pública de `select`, no hace falta bypassear RLS.
  const db = supabaseServer();
  if (!db) return null;
  const { data: ultima } = await db
    .from("netflix_top10")
    .select("week")
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima?.week) return null;
  if (Date.now() - new Date(ultima.week as string).getTime() > SEMANA_VIEJA_MS) return null;
  const { data } = await db
    .from("netflix_top10")
    .select("category,rank,raw_title,tmdb_id")
    .eq("week", ultima.week)
    .order("rank");
  if (!data?.length) return null;
  const pick = (cat: MediaType): StoredRow[] => data
    .filter((r) => r.category === cat)
    .map((r) => ({ rank: r.rank as number, rawTitle: r.raw_title as string, tmdbId: r.tmdb_id as number | null }));
  return { week: ultima.week as string, movie: pick("movie"), tv: pick("tv") };
}

// ============================================================================
// La misma tabla, ahora como EVIDENCIA DE DISPONIBILIDAD para la ficha
// ============================================================================

/**
 * Los `tipo:id` del top oficial que sirven para AFIRMAR que un título está en
 * Netflix Argentina. Las condiciones están en `evidenciaOficial`.
 *
 * UNA sola consulta, filtrada por fecha. La primera versión preguntaba primero
 * cuál era la última semana y después pedía sus filas, y eso tenía dos
 * problemas: costaba el doble de lecturas (24 por hora en el peor caso, no 12),
 * y sobre todo ataba la evidencia a la semana MÁS NUEVA. Con eso, un título que
 * salía del top a la semana siguiente perdía la evidencia de un día para el
 * otro y su ficha volvía sola a "No está en streaming", sin que hubiera
 * cambiado nada ni en TMDB ni acá. Era una regresión programada.
 *
 * Los tres filtros van también en el `where` para no traer filas de más, pero
 * quien DECIDE es `evidenciaOficial`: el corte de fecha del SQL lleva un día de
 * holgura a propósito (ver `desdeSemana`).
 */
export async function disponiblesEnTopOficial(): Promise<Set<string>> {
  return evidenciaCacheada({
    ahora: Date.now(),
    backend: backendCache,
    async consultar(desde) {
      const db = supabaseServer();
      if (!db) return { filas: [], fallo: true };
      const { data, error } = await db
        .from("netflix_top10")
        .select("week,category,tmdb_id,needs_review")
        .gte("week", desde)
        .eq("needs_review", false)
        .not("tmdb_id", "is", null);
      // Un error de query NO es "no hay filas": supabase-js devuelve
      // `{ data: null, error }` en vez de lanzar, así que sin este chequeo una
      // caída se guardaría cinco minutos como "no hay evidencia".
      if (error) return { filas: [], fallo: true };
      return { filas: (data ?? []) as FilaOficial[], fallo: false };
    },
  });
}
