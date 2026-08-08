import "server-only";
import { supabaseServer } from "./supabase";
import { cached, TTL } from "./cache";
import type { MediaType, PlatformCode } from "./types";

// Chips resueltos contra títulos curados a mano en vez de discover de TMDB.
// El pipeline de curado vive en scripts/ + chips/ y NO se toca desde acá: esta
// capa solo consume lo que dejó en la base.
//
// Por qué existe: TMDB no puede expresar "película navideña". La keyword
// `christmas` marca que la navidad APARECE, no que sea el tema, así que el chip
// devolvía Harry Potter, Shazam y Duro de matar. No hay combinación de género +
// keyword que lo arregle — el límite está en la fuente.

// --- Mapeo de plataformas ----------------------------------------------------
// `title_availability.providers` guarda los nombres tal como los publica TMDB,
// que NO son los de PLATFORMS: "HBO Max" contra Max, "Disney Plus" contra
// Disney+, más los revendedores ("Paramount+ Amazon Channel").
//
// El mapa es explícito a propósito. Con matching difuso, pasar "movistar" en vez
// de "MovistarTV" hacía desaparecer 15 títulos sin ningún error: un usuario
// viendo un catálogo recortado y nadie enterándose.
const NOMBRES_TMDB: Record<PlatformCode, string[]> = {
  n:  ["Netflix", "Netflix basic with Ads"],
  d:  ["Disney Plus", "Disney+"],
  m:  ["HBO Max", "Max", "Max Amazon Channel"],
  p:  ["Amazon Prime Video", "Amazon Video"],
  pp: ["Paramount Plus", "Paramount+", "Paramount+ Amazon Channel", "Paramount Plus Apple TV Channel"],
  at: ["Apple TV", "Apple TV+", "Apple TV Amazon Channel"],
  mb: ["MUBI", "MUBI Amazon Channel"],
  cr: ["Crunchyroll", "Crunchyroll Amazon Channel"],
  sp: ["Star+"],
  vx: ["VIX", "ViX", "VIX+"],
  mv: ["MovistarTV", "Movistar Play"],
  cv: ["Claro video"],
  dg: ["DIRECTV GO", "DGO"],
  un: ["Universal+", "Universal+ Amazon Channel"],
  ok: ["OnDemandKorea"],
};

// Nombres que aparecen en la base pero que la app NO ofrece. Se listan para que
// el chequeo de abajo no los reporte como error: son plataformas reales que
// simplemente no están en el selector (Pluto TV se sacó por ser con publicidad).
const CONOCIDOS_SIN_CODIGO = new Set([
  "Plex", "Mercado Play", "JustWatch TV", "Pluto TV", "Sony One Amazon Channel",
  "Google Play Movies", "Claro video Amazon Channel",
]);

export function nombresTmdbDe(codes: PlatformCode[]): string[] {
  return [...new Set(codes.flatMap((c) => NOMBRES_TMDB[c] ?? []))];
}

// Falla ruidosa en desarrollo: si el pipeline empieza a guardar un nombre que no
// está mapeado, sus títulos se vuelven invisibles en silencio. Se llama una vez
// por request de chip curado, con los nombres que efectivamente vinieron.
function avisarNombresHuerfanos(vistos: string[]) {
  const mapeados = new Set(Object.values(NOMBRES_TMDB).flat());
  const huerfanos = vistos.filter((n) => !mapeados.has(n) && !CONOCIDOS_SIN_CODIGO.has(n));
  if (!huerfanos.length) return;
  const msg = `[curated] nombres de plataforma sin mapear en lib/curated.ts: ${huerfanos.join(", ")}`;
  if (process.env.NODE_ENV !== "production") throw new Error(msg);
  console.error(msg);
}

// --- Lectura de la base ------------------------------------------------------
export interface CuratedRow {
  tmdb_id: number;
  media_type: MediaType;
  title: string;   // snapshot de auditoría: NO se muestra, el título sale de TMDB
  year: number | null;
  priority: number;
  source: string;
  stratum: "clasico" | "moderno";
  providers: string[];
}

// get_chip_titles ya filtra por solapamiento de plataformas, excluye la
// blocklist y ordena con `p_seed`. Devuelve solo títulos disponibles.
export async function curatedTitles(opts: {
  chip: string;
  providers: PlatformCode[];
  seed: string;
  limit?: number;
}): Promise<CuratedRow[]> {
  const sb = supabaseServer();
  if (!sb || !opts.providers.length) return [];
  const nombres = nombresTmdbDe(opts.providers);
  if (!nombres.length) return [];

  const { data, error } = await sb.rpc("get_chip_titles", {
    p_chip: opts.chip,
    p_providers: nombres,
    p_region: "AR",
    p_seed: opts.seed,
    p_limit: opts.limit ?? 200,
  });
  if (error) throw new Error(`get_chip_titles(${opts.chip}): ${error.message}`);

  const filas = (data ?? []) as CuratedRow[];
  avisarNombresHuerfanos([...new Set(filas.flatMap((f) => f.providers ?? []))]);
  return filas;
}

// Ids vetados para un chip. `get_chip_titles` ya los excluye de los curados;
// esto es para el RELLENO automático, que va por discover de TMDB y sin este
// filtro reinyecta lo que el clasificador rechazó (Harry Potter, Shazam, Duro de
// matar) en la quinta tanda, donde nadie mira.
//
// Cacheado: son pocas filas y cambian poco (95 para magica-navidad), así que no
// tiene sentido pegarle a Supabase en cada request de chip.
export async function curatedBlocklist(chip: string): Promise<Set<string>> {
  const ids = await cached(`blocklist:${chip}`, TTL.catalog, async () => {
    const sb = supabaseServer();
    if (!sb) return [] as string[];
    const { data, error } = await sb
      .from("chip_blocklist")
      .select("tmdb_id, media_type")
      .eq("chip_slug", chip);
    if (error) {
      // No se cachea el error: al tirar, `cached` no guarda nada y el próximo
      // request reintenta. Peor sería dejar la blocklist vacía 24 h.
      throw new Error(`chip_blocklist(${chip}): ${error.message}`);
    }
    return (data ?? []).map((r: { tmdb_id: number; media_type: string }) => `${r.media_type}:${r.tmdb_id}`);
  }).catch((e) => {
    console.error(`[curated] no se pudo leer la blocklist de ${chip} —`, e);
    return [] as string[];
  });
  return new Set(ids);
}

// --- Intercalado por estrato -------------------------------------------------
// El curado quedó 59% posterior a 2010 — es la composición real del catálogo
// navideño, no un defecto. Sin intercalar, el chip se ve moderno y los clásicos
// no aparecen nunca. Va en TS y no en SQL a propósito: es una regla de producto.
//
// Devuelve la lista completa reordenada en tandas de `porTanda`, cada una con
// `minClasicos` anteriores al 2000 mientras queden. El orden DENTRO de cada
// estrato es el que trajo el RPC (ya barajado con la semilla), así que el
// paginado por offset avanza sin repetir.
export function intercalarEstratos<T extends { stratum: "clasico" | "moderno" }>(
  filas: T[], porTanda = 6, minClasicos = 2,
): T[] {
  const clasicos = filas.filter((f) => f.stratum === "clasico");
  const modernos = filas.filter((f) => f.stratum === "moderno");
  const out: T[] = [];
  let ci = 0, mi = 0;

  while (ci < clasicos.length || mi < modernos.length) {
    const tanda: T[] = [];
    for (let k = 0; k < minClasicos && ci < clasicos.length; k++) tanda.push(clasicos[ci++]);
    while (tanda.length < porTanda && mi < modernos.length) tanda.push(modernos[mi++]);
    // Si se acabaron los modernos, la tanda se completa con más clásicos.
    while (tanda.length < porTanda && ci < clasicos.length) tanda.push(clasicos[ci++]);
    if (!tanda.length) break;
    // Los clásicos entran al principio de la tanda; se distribuyen para que no
    // queden todos juntos al abrir el chip.
    out.push(...distribuir(tanda, minClasicos));
  }
  return out;
}

// Reparte los primeros `cuantos` elementos a lo largo de la tanda en vez de
// dejarlos al frente: con 2 de 6 quedan en las posiciones 1 y 4.
function distribuir<T>(tanda: T[], cuantos: number): T[] {
  if (cuantos <= 0 || tanda.length <= cuantos) return tanda;
  const primeros = tanda.slice(0, cuantos);
  const resto = tanda.slice(cuantos);
  const paso = Math.ceil(tanda.length / cuantos);
  const out: T[] = [];
  let pi = 0, ri = 0;
  for (let i = 0; i < tanda.length; i++) {
    if (i % paso === 0 && pi < primeros.length) out.push(primeros[pi++]);
    else if (ri < resto.length) out.push(resto[ri++]);
    else if (pi < primeros.length) out.push(primeros[pi++]);
  }
  return out;
}
