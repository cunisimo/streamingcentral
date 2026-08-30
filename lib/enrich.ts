// Convierte respuestas crudas de TMDB en el shape estable que consume la UI,
// enriqueciendo con providers (cacheados).
//
// `server-only` es un guard de BUILD, no de tipos: este módulo arrastra
// lib/cache → @upstash/redis (~70 KB) y ya se coló una vez en el bundle del
// navegador. tsc no caza esa regresión; esto la convierte en error de compilación
// si algún "use client" importa un valor de acá (los `import type` se borran y
// siguen siendo legales — CatalogView importa así el tipo HomePayload).
import "server-only";
import {
  TMDB_IMG, discover, watchProviders, titleDetails, titleVideos, personCombinedCredits,
  personDetails, searchDeTipo, searchPersonas, personPopular,
  type RawTitle, type RawDetail, type CreditEntry,
} from "./tmdb";
import { codeForTmdbId, codesToTmdbIds } from "./providers-ar";
import { resolveCategory, genreIdsToSlugs, categoryLabel, categoryBySlug, CATEGORIES, type Category } from "./categories";
import { curatedTitles, curatedBlocklist, intercalarEstratos } from "./curated";
import { getEditorial, publishedIds } from "./reviews";
import { cached, cachedIf, cachedLoc, cachedLocIf, TTL, dailySeed, pickDaily } from "./cache";
import { claveCard, clavePeoplePopular, claveSearch, claveUltimosSeries } from "./claves";
import {
  HUELLA_IDIOMA, IDIOMA_BASE, IDIOMA_FALLBACK, claveMixta, clavePorId,
  conRespuesto, indiceMixto, pedirRespaldoIdioma, repararLote,
} from "./idioma";
import { adaptadorCard, adaptadorLista } from "./idioma-adaptadores";
import { ayudasDeBusqueda } from "./consultas-verificadas";
import {
  candidatosCombinados, candidatosConEje, candidatosDePools, poolsHabilitados, recetaDeEje,
  recetaDelDia, registrarEje,
  type Candidato, type Eje, type ParamsReceta, type PisoPorEje, type Receta,
} from "./pools";
import { consultaListaMiniseries, soloMiniseries } from "./miniseries";
import { topVotedRows } from "./votes";
import { disponiblesEnTopOficial } from "./netflix-top10";
import { resolverDisponibilidad } from "./disponibilidad";
import {
  hayFallosDisponibilidad, registrarFalloDisponibilidad, withFallosDisponibilidad,
} from "./fallos-disponibilidad";
import { redesDePlataforma } from "./enlace-oficial";
import {
  paginarUltimos, plataformasValidas, type CandidatoUltimos, type PaginaRegional,
} from "./ultimos";
import type { DatosSerie } from "./enlace-oficial";
import { excludedGenres, audienceRule } from "./audience";
import { ordenarPorRelevancia } from "./busqueda-orden";
import { primaryCountry } from "./countries";
import { hoyAR } from "./fecha";
import { pickTrailer } from "./trailer";
import type {
  MediaType, MotivoVacio, PlatformCode, UITitle, UITitleDetail, UIPerson,
} from "./types";

const img = (p: string | null, size = "w500") => (p ? `${TMDB_IMG}/${size}${p}` : null);
const yearOf = (t: RawTitle) => {
  const d = t.release_date || t.first_air_date;
  return d ? Number(d.slice(0, 4)) : null;
};
const titleOf = (t: RawTitle) => t.title || t.name || "";
const today = () => new Date().toISOString().slice(0, 10);

// ¿el título está en alguna de las plataformas elegidas por el usuario? Filtro
// estricto: TMDB a veces devuelve títulos fuera de las plataformas pedidas, y el
// gate viejo (platforms.length > 0) solo exigía "en alguna plataforma", no "en
// las MÍAS". Todo el browsing filtra por esto (Próximamente es la excepción).
const onUserPlatforms = (i: UITitle, providers: PlatformCode[]) =>
  i.platforms.some((c) => providers.includes(c));

// providers de un título en AR (cacheado)
//   -> { codes, links, watchLink, hayFlatrateAR, idsOtrasRegiones }
//
// ⚠️ `idsOtrasRegiones` NO es un mapa por región: es el conjunto DEDUPLICADO de
// `provider_id` de `flatrate` vistos en cualquier región que no sea AR. Lo usa
// SÓLO el chequeo de contradicción de `lib/enlace-oficial.ts`, que deriva dos
// booleanos y no necesita saber qué región dice qué. Se guarda acá, en la misma
// entrada, para no pagar un segundo `watch/providers` por título.
//
// El mapa completo se midió y se descartó: **1273 B por título contra 296 B**
// (+495% vs +38% sobre los 214 B originales), o sea 286 KB contra 66 KB por Home
// frío. Si alguna regla futura necesita la granularidad por región hay que
// volver al mapa **y subir la versión de la clave**: desde el conjunto plano no
// se reconstruye.
//
// 🔴 LA CLAVE ES `pv2:` Y ESE CAMBIO ES DELIBERADO. Las entradas viejas no
// traen estos campos, y leerlas como "sin datos regionales" sería peor que
// inútil: el chequeo de contradicción sólo RECHAZA, así que un conjunto vacío lo
// vuelve permisivo y durante las 8 h del TTL podría afirmar una disponibilidad
// que con los datos completos se habría rechazado. Un arranque frío de
// proveedores es barato; una afirmación falsa no.
async function providersOf(type: MediaType, id: number) {
  return cached(`pv2:${type}:${id}`, TTL.providers, async () => {
    const r = await watchProviders(type, id);
    const ar = r.results?.["AR"];
    const codes = new Set<PlatformCode>();
    const links: Partial<Record<PlatformCode, string>> = {};
    for (const p of ar?.flatrate ?? []) {
      const code = codeForTmdbId(p.provider_id);
      if (code) { codes.add(code); links[code] = ar.link; }
    }
    // ¿AR tiene ALGÚN flatrate, mapeable o no? Se guarda aparte de `codes`
    // porque `codes` pierde los provider_id que no están en providers-ar.ts, y
    // esa diferencia decide si los respaldos pueden hablar. Ver el comentario de
    // `hayFlatrateAR` en lib/disponibilidad.ts.
    const hayFlatrateAR = (ar?.flatrate ?? []).length > 0;
    // Ids de flatrate de las OTRAS regiones, deduplicados. No se guarda el mapa
    // por región: medido, cuesta 1273 B por título contra 296 B de esto, y la
    // única regla que lo consume deriva dos booleanos. Ver `idsOtrasRegiones`
    // en lib/enlace-oficial.ts.
    const otras = new Set<number>();
    for (const [region, v] of Object.entries(r.results ?? {})) {
      if (region === "AR") continue;
      for (const x of v?.flatrate ?? []) otras.add(x.provider_id);
    }
    return {
      codes: [...codes], links, watchLink: ar?.link ?? null,
      hayFlatrateAR, idsOtrasRegiones: [...otras],
    };
  });
}

// ---------------------------------------------------------------------------
// Disponibilidad: el ÚNICO camino por el que la app decide "está en X".
// ---------------------------------------------------------------------------

// Los datos que la regla de enlace oficial necesita, cacheados aparte de la
// ficha para no arrastrar el detalle entero. Sólo se piden cuando hacen falta.
async function datosSerieDe(
  type: MediaType, id: number, idsOtrasRegiones: number[],
): Promise<DatosSerie | null> {
  if (type !== "tv") return null;
  const d = await cached(`serie:oficial:${id}`, TTL.providers, async () => {
    const det = await titleDetails("tv", id);
    return {
      estreno: det.first_air_date ?? null,
      redes: (det.networks ?? []).map((n) => n.id),
      homepage: det.homepage ?? "",
    };
  });
  return { ...d, idsOtrasRegiones };
}

/**
 * Las plataformas de un título, resueltas por el camino central.
 *
 * ⚠️ CORTA ANTES DE TOCAR NADA si TMDB ya sabe. Ese `if` no es una
 * micro-optimización: el Home enriquece ~300 títulos y casi todos tienen
 * proveedor, así que sin él cada uno pagaría un round-trip a Redis de más.
 * Devuelve el MISMO array que guardó `providersOf` — no se muta ni se copia.
 *
 * Un `fallo` NO se cachea: `cachedIf` deja pasar el valor y no lo guarda, así
 * que una caída de Supabase no congela un "no está en ningún lado".
 */
export async function disponibilidadDe(
  type: MediaType, id: number,
  prov: {
    codes: PlatformCode[];
    hayFlatrateAR?: boolean;
    idsOtrasRegiones?: number[];
  },
): Promise<PlatformCode[]> {
  if (prov.codes.length || prov.hayFlatrateAR) return prov.codes;
  let fallo = false;
  const res = await cachedIf(`disp:${type}:${id}`, TTL.editorial, async () => {
    const r = await resolverDisponibilidad({
      tipo: type, id, deTmdb: prov.codes, hayFlatrateAR: prov.hayFlatrateAR, hoy: hoyAR(),
      leerTopOficial: disponiblesEnTopOficial,
      leerDatosSerie: () => datosSerieDe(type, id, prov.idsOtrasRegiones ?? []),
    });
    fallo = r.fallo;
    // La señal sale de esta función y llega a las cachés de AFUERA. Sin esto,
    // `disp:` no se guardaba pero la card, el Home y la lista sí — con el
    // título en gris adentro, por 24 h, 6 h y 8 h respectivamente.
    if (r.fallo) registrarFalloDisponibilidad();
    if (r.procedencia && r.procedencia !== "tmdb-ar") {
      console.log(`[disponibilidad] ${type}:${id} -> ${r.plataformas.join(",")} (${r.procedencia})`);
    }
    return r.plataformas;
  }, () => !fallo);
  return res;
}

// El link del agregador para un título. Reusa el MISMO `cached` de providersOf
// (clave `pv2:${type}:${id}`), así que en un listado ya enriquecido con
// cardsByIds no cuesta ningún request extra a TMDB.
export async function watchLinkFor(type: MediaType, id: number): Promise<string | null> {
  return (await providersOf(type, id)).watchLink;
}

// Enriquecido tolerante a fallos. `toUITitle` hace 1 request a TMDB por título
// (providersOf): en un listado de 20 basta un 429 o un timeout para que el
// Promise.all entero rechace y se caiga el riel/endpoint completo. Acá el título
// que falla se descarta y el resto sobrevive — mismo criterio que `titleCard`,
// que ya devolvía null. En el camino feliz la salida es idéntica a Promise.all.
// Nunca falla en silencio: lo descartado se loguea en server.
async function settleAll<T>(tareas: Promise<T>[], etiqueta: string): Promise<T[]> {
  const r = await Promise.allSettled(tareas);
  const ok = r
    .filter((s): s is PromiseFulfilledResult<Awaited<T>> => s.status === "fulfilled")
    .map((s) => s.value);
  if (ok.length < r.length) {
    const motivo = r.find((s): s is PromiseRejectedResult => s.status === "rejected")?.reason;
    // El error COMPLETO (con stack), no solo `.message`: si no, un TypeError
    // propio queda indistinguible de un 429 de TMDB.
    console.error(
      `[enrich] ${etiqueta}: ${r.length - ok.length}/${r.length} título(s) descartados —`,
      motivo,
    );
    // Fuera de producción no se traga nada: un bug propio tiene que explotar en
    // desarrollo en vez de convertirse en un riel corto y silencioso.
    if (process.env.NODE_ENV !== "production") throw motivo;
  }
  return ok;
}

async function toUITitle(t: RawTitle, type: MediaType, published?: Set<string>): Promise<UITitle> {
  const prov = await providersOf(type, t.id);
  // Camino central. Con proveedor de TMDB devuelve el MISMO array y no cuesta
  // nada; sin proveedor consulta los respaldos. Ver `disponibilidadDe`.
  const codes = await disponibilidadDe(type, t.id, prov);
  return {
    id: t.id, type, title: titleOf(t), year: yearOf(t),
    runtime: null, poster: img(t.poster_path),
    country: t.origin_country?.[0] ?? null,
    genres: genreIdsToSlugs(t.genre_ids ?? []),
    platforms: codes,
    tmdb: t.vote_average ? Number(t.vote_average.toFixed(1)) : null,
    hasEditorial: published ? published.has(`${t.id}:${type}`) : false,
  };
}

// --- Listado por categoría/tipo, filtrado a las plataformas del usuario ---
// `scope` lo decide el LLAMADOR, no el slug (ver lib/audience.ts):
//   "home"   → rieles de género del Home: sin animación ni familia.
//   "browse" → recomendador y /categoria/[slug]: sin animación, con familia.
//   sin scope → no se excluye nada (búsqueda, listas del usuario, Próximamente).
export async function listByCategory(opts: {
  tipo: MediaType; genre?: string; genre2?: string; country?: string;
  providers: PlatformCode[]; page?: number; sortBy?: string; minVotes?: number;
  extra?: Record<string, string>; scope?: "home" | "browse";
  // Descarta lo que no tenga póster y sinopsis (ver abajo). Lo usa "Últimos
  // lanzamientos", que ya no filtra por cantidad de votos.
  soloCompletos?: boolean;
  /** Señal de salida: `fallo` queda en true si la reparación de idioma falló.
   *  Los llamadores que NO cachean la omiten. El que sí cachea usa
   *  `listByCategoryCacheable`, que la exige por tipo — así no se puede olvidar. */
  senal?: { fallo: boolean };
}): Promise<UITitle[]> {
  if (!opts.providers.length) return [];
  const ids = codesToTmdbIds(opts.providers);
  const rule = opts.genre && opts.genre !== "todos" ? resolveCategory(opts.genre, opts.tipo) : {};
  const rule2 = opts.genre2 && opts.genre2 !== "todos" ? resolveCategory(opts.genre2, opts.tipo) : {};

  let genres = [...(rule.genres ?? []), ...(rule2.genres ?? [])];
  let keywords = [...(rule.keywords ?? []), ...(rule2.keywords ?? [])];
  let extra = opts.extra;

  // Cruce donde AMBAS categorías aportan géneros: with_genres con AND (coma).
  // discover une genres con "|" (OR), así que forzamos el AND vía extra
  // (Object.assign(p, o.extra) en discover pisa el with_genres OR).
  if ((rule.genres?.length ?? 0) > 0 && (rule2.genres?.length ?? 0) > 0) {
    extra = { ...(opts.extra ?? {}), with_genres: genres.join(",") };
    genres = []; // que discover no arme el "|"
  }

  // Cruce donde AMBAS categorías aportan keywords (ej. terror + suspenso en tv):
  // with_keywords con AND (coma). discover une keywords con "|" (OR).
  if ((rule.keywords?.length ?? 0) > 0 && (rule2.keywords?.length ?? 0) > 0) {
    extra = { ...(extra ?? {}), with_keywords: keywords.join(",") };
    keywords = []; // que discover no arme el "|"
  }

  const sinAudiencia = opts.scope
    ? excludedGenres({ scope: opts.scope, genre: opts.genre, genre2: opts.genre2, providers: opts.providers })
    : undefined;
  // Los géneros excluidos son la unión de dos cosas distintas: los de la
  // categoría (falsos positivos, ver lib/categories.ts) y los de audiencia
  // (animación/familia según la superficie, ver lib/audience.ts).
  //
  // La regla `alt` lleva SU PROPIA exclusión: hereda la de audiencia pero no la
  // de la principal. Si no, una categoría que separa ficción de documental
  // (supervivencia: la principal excluye el 99, la alt lo pide) se anulaba a sí
  // misma y la alt devolvía vacío.
  const sinTodo = (propios?: number[]) => {
    const u = [...new Set([...(propios ?? []), ...(sinAudiencia ?? [])])];
    return u.length ? u : undefined;
  };
  const base = {
    providers: ids,
    originCountry: opts.country || rule.originCountry,
    page: opts.page, sortBy: opts.sortBy, minVotes: opts.minVotes,
  };

  // `alt` (ver lib/categories.ts): TMDB une with_genres y with_keywords con AND,
  // así que "documental O basado en hechos reales" necesita dos queries. Se
  // piden en paralelo y se intercalan para que ninguna de las dos domine.
  // Las dos consultas van con su propia reparación de lote: una llamada extra
  // por consulta y solo si esa página trae algún título roto. `listByCategory`
  // alimenta /categoria, /top y los carruseles de audiencia, así que sin esto
  // quedaba fuera de la reparación una de las superficies más grandes.
  const paramsBase = {
    ...base,
    withoutGenres: sinTodo([...(rule.withoutGenres ?? []), ...(rule2.withoutGenres ?? [])]),
    genres: genres.length ? genres : undefined,
    keywords: keywords.length ? keywords : undefined,
    extra,
  };
  let falloIdiomaCat = false;
  const paramsAlt = rule.alt ? {
    ...base,
    withoutGenres: sinTodo(rule.alt.withoutGenres),
    genres: rule.alt.genres,
    keywords: rule.alt.keywords,
    extra: opts.extra,
  } : null;

  const [res, resAlt] = await Promise.all([
    discover(opts.tipo, paramsBase).then(async (r) => ({
      ...r,
      results: await (async () => {
        const rep = await adaptadorLista({
          pedirBase: async () => r.results,
          pedirRespaldo: () => pedirRespaldoIdioma(
            `categoria:${opts.tipo}:${opts.genre ?? "todos"}:p${opts.page ?? 1}`,
            async () => (await discover(opts.tipo, {
              ...paramsBase, extra: { ...(paramsBase.extra ?? {}), language: IDIOMA_FALLBACK },
            })).results,
          ),
        });
        if (rep.fallo) falloIdiomaCat = true;
        return rep.valor;
      })(),
    })),
    paramsAlt
      ? discover(opts.tipo, paramsAlt).then(async (r) => ({
          ...r,
          results: await (async () => {
            const rep = await adaptadorLista({
              pedirBase: async () => r.results,
              pedirRespaldo: () => pedirRespaldoIdioma(
                `categoria-alt:${opts.tipo}:${opts.genre ?? "todos"}:p${opts.page ?? 1}`,
                async () => (await discover(opts.tipo, {
                  ...paramsAlt, extra: { ...(paramsAlt.extra ?? {}), language: IDIOMA_FALLBACK },
                })).results,
              ),
            });
            if (rep.fallo) falloIdiomaCat = true;
            return rep.valor;
          })(),
        }))
      : Promise.resolve(null),
  ]);

  let crudos = res.results;
  if (resAlt) {
    const vistos = new Set<number>();
    const mezcla: typeof crudos = [];
    for (let i = 0; i < Math.max(res.results.length, resAlt.results.length); i++) {
      for (const t of [res.results[i], resAlt.results[i]]) {
        if (t && !vistos.has(t.id)) { vistos.add(t.id); mezcla.push(t); }
      }
    }
    crudos = mezcla;
  }

  // Ficha completa: con póster y con sinopsis. Se filtra ANTES del corte a 20
  // para no gastar cupo en títulos que se van a descartar igual. TMDB no puede
  // filtrar esto del lado suyo (no hay parámetro "con sinopsis"), así que la
  // página rinde menos y el llamador tiene que pedir la siguiente si le falta.
  if (opts.soloCompletos) {
    crudos = crudos.filter((t) => t.poster_path && t.overview && t.overview.trim());
  }

  const pub = await publishedIds(opts.tipo);
  const items = await settleAll(
    crudos.slice(0, 20).map((t) => toUITitle(t, opts.tipo, pub)),
    `listByCategory ${opts.tipo}/${opts.genre ?? "todos"}`,
  );
  if (opts.senal && falloIdiomaCat) opts.senal.fallo = true;
  return items.filter((i) => onUserPlatforms(i, opts.providers));
}

/**
 * `listByCategory` para quien va a CACHEAR el resultado.
 *
 * La señal deja de ser opcional: el tipo obliga a pasarla. Antes era opcional
 * para no cambiarle la firma a los diez llamadores que no cachean, y eso dejaba
 * al que sí cachea (`top:pop:`) a un descuido de guardar una lista sin reparar
 * durante 24 h.
 */
export function listByCategoryCacheable(
  opts: Omit<Parameters<typeof listByCategory>[0], "senal"> & { senal: { fallo: boolean } },
): Promise<UITitle[]> {
  return listByCategory(opts);
}

// --- Últimos lanzamientos (por fecha de estreno, en tus plataformas) ---
// Cuántas páginas del catálogo regional se traen como máximo para servir una
// página de la lista. NO es una ventana de contenido: es un tope de seguridad.
//
// 🔴 LA VENTANA FIJA ERA UNA REGRESIÓN Y SE SACÓ. La primera versión mezclaba 3
// páginas por fuente y ahí terminaba: con Netflix, Max o Prime la página 4 salía
// vacía aunque TMDB tuviera cientos de resultados, o sea peor que la lista
// paginada que ya existía. Ahora el catálogo regional se pagina de verdad —una
// página por página pedida— y lo único acotado es el SUPLEMENTO por redes, que
// por naturaleza es un puñado de títulos recientes.
const ULTIMOS_POR_PAGINA = 20;
// 🔴 NO HAY TOPE DE PÁGINAS. Hubo uno (12) y era otra ventana fija con nombre de
// seguridad: para una plataforma sin suplemento por red, la página 13 no podía
// juntar 260 resultados aunque TMDB tuviera más. El único límite es el real de
// la fuente, `total_pages`, y lo aplica `paginarUltimos`.
// Páginas del discover por RED. Es un suplemento de estrenos recientes, no la
// lista: 3 páginas son ~60 candidatos por plataforma habilitada.
const ULTIMOS_PAGINAS_RED = 3;

// Una página de discover con la reparación de idioma puesta, igual que
// `listByCategory`. Sin esto el riel nuevo quedaría fuera del fallback.
async function crudosConIdioma(
  params: Parameters<typeof discover>[1], etiqueta: string, senal: { fallo: boolean },
): Promise<{ items: RawTitle[]; totalPaginas: number; totalResultados: number }> {
  const r = await discover("tv", params);
  const rep = await adaptadorLista({
    pedirBase: async () => r.results,
    pedirRespaldo: () => pedirRespaldoIdioma(etiqueta, async () => (await discover("tv", {
      ...params, extra: { ...(params?.extra ?? {}), language: IDIOMA_FALLBACK },
    })).results),
  });
  if (rep.fallo) senal.fallo = true;
  return {
    items: rep.valor,
    totalPaginas: r.total_pages ?? 1,
    totalResultados: r.total_results ?? rep.valor.length,
  };
}

/** Enriquece crudos de series y les pega la fecha con la que se ordenan. */
async function aCandidatosUltimos(raws: RawTitle[]): Promise<CandidatoUltimos[]> {
  if (!raws.length) return [];
  const pub = await publishedIds("tv");
  const fecha = new Map(raws.map((t) => [t.id, t.first_air_date ?? ""]));
  const items = await settleAll(raws.map((t) => toUITitle(t, "tv", pub)), "ultimos tv");
  return items.map((i) => ({ ...i, fecha: fecha.get(i.id) ?? "" }));
}

/**
 * UNA página del catálogo regional, cacheada por su cuenta.
 *
 * 🔴 ES LA CLAVE DEL COSTO. Antes cada página de la lista rearmaba TODA la
 * ventana —3 discover regionales, 3 por red y ~120 enriquecidos—, así que
 * "se paga una vez por día" era falso: se pagaba una vez por CADA página
 * pedida. Con la página cacheada por separado, pedir la 2 por primera vez
 * cuesta una página y nada más; la 1 ya está.
 */
async function ultimosRegionalPagina(
  providers: PlatformCode[], pagina: number, senal: { fallo: boolean },
): Promise<PaginaRegional> {
  // `providers` llega YA normalizado por `paginarUltimos`. El guard igual está
  // acá: si alguna vez alguien llamara a esta función directamente, un `[]`
  // haría que `discover` saliera sin `with_watch_providers`, o sea con el
  // catálogo entero.
  if (!providers.length) return { items: [], totalPaginas: 1, totalResultados: 0 };
  const hoy = hoyAR();
  const orden = [...providers].sort().join(",");
  return cachedLocIf(
    claveUltimosSeries(hoy, orden, `reg:p${pagina}`, HUELLA_IDIOMA), TTL.providers,
    async () => {
      const { res, fallos } = await withFallosDisponibilidad(async () => {
        const { items, totalPaginas, totalResultados } = await crudosConIdioma({
          providers: codesToTmdbIds(providers), minVotes: 0, page: pagina,
          sortBy: "first_air_date.desc", extra: { "first_air_date.lte": hoy },
        }, `ultimos:reg:p${pagina}`, senal);
        // `totalPaginas` y `totalResultados` van tal cual: son el límite real de
        // la fuente y la cota superior que permite descartar una página
        // imposible sin recorrer el catálogo.
        return { items: await aCandidatosUltimos(items), totalPaginas, totalResultados };
      });
      if (fallos) senal.fallo = true;
      return res;
    },
    () => !senal.fallo,
  );
}

/**
 * El suplemento por redes oficiales, cacheado UNA vez por día y combinación.
 *
 * No se pagina: es un puñado de estrenos recientes que el catálogo regional no
 * conoce todavía. Se calcula entero y se mezcla con cualquier página.
 *
 * 🔴 POR QUÉ EXISTE. Medido el 2026-08-30: el discover por proveedor Disney+/AR
 * devuelve 1152 series y `tv:275224` no está en ninguna. Si no aparece como
 * candidato, no hay resolución de disponibilidad que lo rescate.
 *
 * La consulta va SIN `with_watch_monetization_types` (ver `sinMonetizacion` en
 * lib/tmdb.ts): con ese parámetro TMDB filtra a lo que ya sabe que está en
 * flatrate argentino, que es justo el dato que falta. Medido: 304 resultados
 * con el parámetro y 440 sin él.
 *
 * Se enriquece SIN filtrar por plataformas: el filtro lo hace `paginarUltimos`
 * DESPUÉS de que la resolución central haya decidido. Filtrar antes dejaría
 * afuera justamente a los que vienen sin proveedor de TMDB.
 */
async function ultimosExtrasPorRed(
  providers: PlatformCode[], senal: { fallo: boolean },
): Promise<CandidatoUltimos[]> {
  if (!providers.length) return [];
  // Sólo las redes de las plataformas del usuario que estén habilitadas. Salen
  // del MISMO registro que la evidencia oficial: no se piden candidatos por una
  // red que después no podría resolverse.
  const redes = [...new Set(providers.flatMap(redesDePlataforma))];
  if (!redes.length) return [];
  const hoy = hoyAR();
  const orden = [...providers].sort().join(",");
  return cachedLocIf(
    claveUltimosSeries(hoy, orden, "red", HUELLA_IDIOMA), TTL.providers,
    async () => {
      const { res, fallos } = await withFallosDisponibilidad(async () => {
        const paginas = Array.from({ length: ULTIMOS_PAGINAS_RED }, (_, i) => i + 1);
        const tandas = await Promise.all(paginas.map((p) => crudosConIdioma({
          minVotes: 0, page: p, sortBy: "first_air_date.desc", sinMonetizacion: true,
          extra: { with_networks: redes.join("|"), "first_air_date.lte": hoy },
        }, `ultimos:red:p${p}`, senal)));
        return aCandidatosUltimos(tandas.flatMap((t) => t.items));
      });
      if (fallos) senal.fallo = true;
      return res;
    },
    () => !senal.fallo,
  );
}

/**
 * "Últimos lanzamientos · Series", una página.
 *
 * La orquestación vive en `paginarUltimos` (lib/ultimos.ts), que es pura y se
 * prueba por comportamiento con la fuente inyectada. Acá sólo se le enchufan
 * las dos puertas, cada una con SU cache: así pedir la página 2 no re-paga la 1.
 */
async function ultimosSeries(
  providers: PlatformCode[], page: number, senal: { fallo: boolean },
): Promise<CandidatoUltimos[]> {
  const { items } = await paginarUltimos({
    page, porPagina: ULTIMOS_POR_PAGINA, providers, hoy: hoyAR(),
    // Las dos puertas reciben la lista YA normalizada que arma la orquestación,
    // no la cruda: así un código desconocido no puede llegar a `discover`.
    traerRegional: (pagina, validas) => ultimosRegionalPagina(validas, pagina, senal),
    traerExtras: (validas) => ultimosExtrasPorRed(validas, senal),
  });
  return items;
}

export async function latestReleases(
  providers: PlatformCode[], tipo: MediaType = "movie", page = 1,
): Promise<UITitle[]> {
  // Retorno temprano del CONTRATO PÚBLICO, además del de la orquestación.
  // `listByCategory` lo tiene desde siempre y la rama de series lo perdió al
  // dejar de pasar por ahí: con `providers: []` se pedía el catálogo entero
  // para devolver cero. Se valida acá y adentro, sin confiar en que la
  // interfaz mande datos correctos.
  if (!plataformasValidas(providers).length) return [];
  if (tipo === "tv") {
    const senal = { fallo: false };
    return ultimosSeries(providers, page, senal);
  }

  const extra: Record<string, string> = tipo === "movie"
    ? { "primary_release_date.lte": today() }
    : { "first_air_date.lte": today() };
  // Sin umbral de votos: exigía 5 y con eso un estreno no aparecía hasta juntar
  // votos en TMDB — días en títulos de nicho. El criterio ahora es que la ficha
  // esté completa (póster + sinopsis), que es lo que se ve en la card. Filtra
  // el ruido real: títulos sin traducir y sin descripción.
  // minVotes: 0 EXPLÍCITO. `discover` tiene un default de 60 votos, así que no
  // alcanza con sacar el umbral: quedaría en 60 y sería 12 veces más
  // restrictivo que el 5 que tenía antes.
  return listByCategory({
    tipo, providers, page, minVotes: 0, soloCompletos: true,
    sortBy: tipo === "movie" ? "primary_release_date.desc" : "first_air_date.desc",
    extra,
  });
}

// Debajo de este piso de curados DISPONIBLES para el usuario se completa con
// discover. Un usuario solo-Netflix tiene ~30 curados de navidad: a 6 por tanda
// da la vuelta en 5 clicks, que es justo la queja que originó el curado.
const PISO_CURADOS = 12;

// --- Recomendaciones del día (pool + seed) ---
// Devuelve el motivo cuando vuelve vacío: la interfaz tiene que poder distinguir
// "no lo tenés en tus plataformas" de "esto se rompió de nuestro lado", porque
// el segundo caso no se arregla pidiéndole al usuario que active una plataforma.
// Ver `MotivoVacio` en lib/types.ts.
export async function recommendations(opts: {
  genre?: string; tipo: MediaType | "all"; providers: PlatformCode[]; n?: number; offset?: number;
}): Promise<{ items: UITitle[]; motivo?: MotivoVacio }> {
  const n = opts.n ?? 6;
  const offset = opts.offset ?? 0;
  const cat = opts.genre ? categoryBySlug(opts.genre) : undefined;
  if (!opts.providers.length) return { items: [], motivo: "sin-plataformas" };

  // --- Ruta curada -----------------------------------------------------------
  if (cat?.curatedSlug) {
    const pool = await curatedPool(cat, opts.providers, n);
    // El RPC ya barajó con la semilla del día y el intercalado fijó el orden:
    // acá solo se pagina. Volver a mezclar rompería ambas cosas.
    // Un curado vacío ES el filtro de plataformas: la lista curada existe
    // siempre, lo que falta es que alguno esté en las plataformas del usuario.
    if (!pool.length) return { items: [], motivo: "filtro" };
    const inicio = (offset * n) % pool.length;
    const tanda = pool.slice(inicio, inicio + n);
    // Wrap al principio si la tanda cae al final del pool. Con un pool más chico
    // que `n` esto llegaba a repetir el mismo título dentro de la tanda.
    if (tanda.length < n) {
      const yaEsta = new Set(tanda.map((t) => `${t.type}:${t.id}`));
      for (const t of pool) {
        if (tanda.length >= n) break;
        const k = `${t.type}:${t.id}`;
        if (!yaEsta.has(k)) { yaEsta.add(k); tanda.push(t); }
      }
    }
    return { items: tanda };
  }

  const types: MediaType[] = opts.tipo === "all" ? ["movie", "tv"] : [opts.tipo];

  // --- Ruta ancha ------------------------------------------------------------
  // La que usan el hero base y 14 de los 16 chips. Ver `tandaAncha`.
  //
  // Quedan afuera las dos categorías que necesitan el pool YA ENRIQUECIDO para
  // decidir el orden, y no se las fuerza a entrar:
  //  - `alt` (Historias reales): son DOS queries a TMDB unidas por OR, y
  //    `categoryCandidates` sabe hacer una sola. Meterla igual no daría error:
  //    devolvería la mitad del chip —solo el género documental, sin la keyword
  //    "basado en hechos reales"— y en silencio.
  //  - `balanceDocs` (Supervivencia extrema): la proporción mitad y mitad se
  //    calcula sobre `genres`, que es un campo de UITitle y no existe en el crudo.
  // Las dos siguen andando exactamente como antes; sirven además de control al
  // comparar contra la foto, porque son las únicas que no deberían moverse.
  const reglas = cat ? [cat.movie, cat.tv] : [];
  const necesitaEnriquecido = !!cat?.balanceDocs || reglas.some((r) => r.alt);
  // Interruptor de emergencia, como POOL_CACHE y CACHE_BATCH: HERO_ANCHO=0 vuelve
  // al camino viejo completo sin deployar. Se lee en cada llamada a propósito —
  // así el script de medición corre las dos versiones en el mismo proceso y
  // compara sin reiniciar nada.
  if (process.env.HERO_ANCHO !== "0" && !necesitaEnriquecido) {
    return tandaAncha({ genre: opts.genre, types, providers: opts.providers, n, offset });
  }

  // --- Ruta angosta (la de siempre) ------------------------------------------
  // scope "browse": el recomendador es parte del Home, así que no muestra
  // animación (va en "Animación para adultos"), pero sí lo familiar — si no,
  // "Magia navideña" se queda sin Solo en casa 2 ni El mago de Oz.
  const pools = await Promise.all(types.map((tp) =>
    listByCategory({ tipo: tp, genre: opts.genre, providers: opts.providers, page: 1, scope: "browse" })));
  const pool = pools.flat();

  // Mitad documentales por tanda: se barajan los dos grupos por separado (así se
  // mantiene la rotación del día) y recién después se intercalan, para que el
  // barajado no vuelva a mezclar las proporciones.
  if (cat?.balanceDocs) {
    const esDoc = (t: UITitle) => t.genres.includes("documental");
    const docs = pickDaily(pool.filter(esDoc), 999, dailySeed());
    const ficcion = pickDaily(pool.filter((t) => !esDoc(t)), 999, dailySeed());
    const mezcla: UITitle[] = [];
    for (let i = 0; i < Math.max(docs.length, ficcion.length); i++) {
      if (ficcion[i]) mezcla.push(ficcion[i]);
      if (docs[i]) mezcla.push(docs[i]);
    }
    const inicio = mezcla.length ? (offset * n) % mezcla.length : 0;
    const tanda = mezcla.slice(inicio, inicio + n);
    if (tanda.length < n) {
      const yaEsta = new Set(tanda.map((t) => `${t.type}:${t.id}`));
      for (const t of mezcla) {
        if (tanda.length >= n) break;
        const k = `${t.type}:${t.id}`;
        if (!yaEsta.has(k)) { yaEsta.add(k); tanda.push(t); }
      }
    }
    return { items: tanda, motivo: tanda.length ? undefined : "filtro" };
  }

  // La ruta angosta pide SIEMPRE la página 1 con el orden por defecto, así que
  // no puede volver vacía antes de filtrar salvo que la categoría entera no
  // exista en AR. Por eso acá el motivo es "filtro" y no se distingue más fino:
  // el caso "sin-catalogo" lo produce la ruta ancha, que es la que pagina hondo
  // y sube el piso de votos.
  const items = pickDaily(pool, n, dailySeed(), offset);
  return { items, motivo: items.length ? undefined : "filtro" };
}

// --- El universo del hero ----------------------------------------------------
// El problema que resuelve: el hero pedía UNA página de discover por tipo (20
// movie + 20 tv), enriquecía las 40 —1 request de providers por título— y
// mostraba 6. O sea que pagaba 40 para mostrar 6, y el universo entero eran esas
// 40: a la sexta vez que alguien tocaba "Mostrame otras" ya había dado la vuelta,
// y una semana entera de aperturas no podía mostrar más de 40 títulos distintos
// porque el pool era siempre el mismo y lo único que cambiaba era el barajado.
//
// Se da vuelta la relación: el universo se arma con CRUDOS —que son baratos,
// cacheados por plataforma y compartidos entre todos los usuarios del día
// (lib/pools.ts)— y el enriquecido, que es lo caro, se paga solo sobre la
// ventana del offset que se está mostrando. Más universo y menos costo por clic.
//
// Páginas de cada plataforma que entran al universo. Con 3 y tres plataformas
// son ~180 crudos por tipo antes de deduplicar.
const HERO_PAGINAS = 3;
// Crudos que se enriquecen por tanda de 6. El margen absorbe lo que se cae en el
// filtro de plataformas: TMDB ya filtró por proveedor al traerlos, pero
// `providersOf` es la fuente autorizada y a veces no coincide (la misma
// inconsistencia del id 2 de Apple TV+). Medido con n,d,m la caída es ~10%, así
// que 12 para 6 es el doble de lo necesario.
const HERO_VENTANA = 12;
// Techo de enriquecidos por llamada. Existe para que el peor caso siga costando
// MENOS que el camino viejo: 36 contra los 40 fijos de antes. Si una ventana
// quedara corta tres veces seguidas, se devuelve lo que haya en vez de encadenar
// round-trips y dejar la latencia de "Otras" abierta.
const HERO_TOPE = HERO_VENTANA * 3;

async function tandaAncha(opts: {
  genre?: string; types: MediaType[]; providers: PlatformCode[]; n: number; offset: number;
}): Promise<{ items: UITitle[]; motivo?: MotivoVacio }> {
  const { types, providers, n, offset } = opts;
  const universo = (await Promise.all(types.map(async (tipo) => {
    const crudos = await categoryCandidates({
      tipo, genre: opts.genre, providers, pages: HERO_PAGINAS, scope: "browse",
      // El eje rota por día (pop / top / nuevo / taquilla / hondo). Es la otra
      // mitad de la cobertura semanal: sin esto el universo sería más grande
      // pero seguiría siendo SIEMPRE el mismo, y una semana mostraría siete
      // barajados del mismo conjunto.
      superficie: "hero",
    });
    return crudos.map((raw) => ({ raw, tipo, k: `${tipo}:${raw.id}` }));
  }))).flat();

  // Dedup: un id puede venir de dos plataformas (ya lo une candidatosDePools)
  // pero también de los dos tipos, y ahí `movie:1` y `tv:1` son cosas distintas.
  const vistos = new Set<string>();
  const unicos: typeof universo = [];
  for (const c of universo) {
    if (vistos.has(c.k)) continue;
    vistos.add(c.k);
    unicos.push(c);
  }

  // ORDENAR ANTES DE BARAJAR, y por la clave y no por popularidad.
  // `pickDaily` baraja POSICIONES: con la misma semilla y el mismo conjunto en
  // otro orden de llegada, devuelve otra cosa. Y el orden de llegada es
  // justamente lo más inestable que hay acá — TMDB reordena `popularity.desc`
  // todos los días, y `candidatosDePools` une los pools de cada plataforma en el
  // orden en que resuelven. Sin este sort, dos requests del mismo día podían dar
  // heros distintos con el mismo universo, y "Otras" se desincronizaba: el
  // offset 1 no era la continuación del 0 sino un barajado nuevo.
  unicos.sort((a, b) => (a.tipo === b.tipo ? a.raw.id - b.raw.id : a.tipo < b.tipo ? -1 : 1));

  const barajado = pickDaily(unicos, unicos.length, dailySeed());
  // Vacío ANTES de filtrar por plataformas: la consulta no trajo un solo
  // candidato. Con la verificación de eje puesta esto ya casi no debería pasar
  // (era el bug de "Contacto extraterrestre" en un día de `hondo`), pero si pasa
  // NO es culpa del usuario y la interfaz no tiene que pedirle que active nada.
  if (!barajado.length) return { items: [], motivo: "sin-catalogo" };

  // La ventana de este offset. Da la vuelta al final del universo, igual que
  // `pickDaily`: llegar al final no deja al usuario sin hero.
  const out: UITitle[] = [];
  const puestos = new Set<string>();
  let i = (offset * HERO_VENTANA) % barajado.length;
  let pagados = 0;
  // El techo real es el menor entre el presupuesto y el universo: si el universo
  // es más chico que la ventana, seguir dando vueltas solo vuelve a pagar por
  // los mismos títulos.
  const techo = Math.min(HERO_TOPE, barajado.length);
  const ventana = Math.min(HERO_VENTANA, barajado.length);
  while (out.length < n && pagados < techo) {
    const tanda: typeof barajado = [];
    for (let j = 0; j < ventana; j++) tanda.push(barajado[(i + j) % barajado.length]);
    i += tanda.length;
    pagados += tanda.length;
    // Se enriquece por tipo (enrichRaw pide uno solo) y en paralelo, pero se
    // vuelve a leer en el orden de la ventana: el barajado del día es el que
    // manda, no el orden en que resolvieron los dos fetch.
    const porTipo = new Map<string, UITitle>();
    await Promise.all(types.map(async (tipo) => {
      const suyos = tanda.filter((c) => c.tipo === tipo).map((c) => c.raw);
      if (!suyos.length) return;
      for (const t of await enrichRaw(suyos, tipo, providers)) porTipo.set(`${t.type}:${t.id}`, t);
    }));
    for (const c of tanda) {
      if (out.length >= n) break;
      const t = porTipo.get(c.k);
      if (t && !puestos.has(c.k)) { puestos.add(c.k); out.push(t); }
    }
  }
  // Había candidatos y no sobrevivió ninguno: acá sí fue el filtro de
  // plataformas, que es el mensaje legítimo de "no lo tenés".
  return { items: out, motivo: out.length ? undefined : "filtro" };
}

// Pool completo de un chip curado, ya enriquecido y en el orden definitivo.
// Curados primero (intercalados por estrato); si no llegan al piso, se completa
// con discover — SOLO películas, y filtrando la blocklist para no reinyectar los
// títulos que el clasificador ya había rechazado.
async function curatedPool(
  cat: Category, providers: PlatformCode[], n: number,
): Promise<UITitle[]> {
  const curatedSlug = cat.curatedSlug!;
  const filas = await curatedTitles({
    chip: curatedSlug,
    providers,
    // Misma semilla del día que usa todo el recomendador: mantiene el
    // determinismo por fecha y con eso la eficiencia del cache compartido.
    seed: String(dailySeed()),
  });
  const ordenadas = intercalarEstratos(filas, n);
  const curados = await cardsByIds(
    ordenadas.map((f) => ({ tipo: f.media_type, id: f.tmdb_id })),
  );
  if (curados.length >= PISO_CURADOS) return curados;

  const [relleno, vetados] = await Promise.all([
    // Solo movie: el curado es de películas, y meter series por el relleno
    // reinyecta el ruido de discover justo donde nadie lo revisa.
    listByCategory({ tipo: "movie", genre: cat.slug, providers, page: 1, scope: "browse" }),
    curatedBlocklist(curatedSlug),
  ]);
  const yaEstan = new Set(curados.map((c) => `${c.type}:${c.id}`));
  const extra = relleno.filter((r) => {
    const k = `${r.type}:${r.id}`;
    return !yaEstan.has(k) && !vetados.has(k);
  });
  return [...curados, ...extra];
}

// --- Carruseles de audiencia (family / adult-anime): receta de lib/audience,
// movie+tv mergeados, filtrado a plataformas. Server-side, cero costo por título.
// Cuántas tarjetas apunta a devolver cada tipo del carrusel. El composer recorta
// después a AUDIENCE_CARDS sobre los dos tipos juntos.
const AUDIENCIA_OBJETIVO = 20;
// Tope de tandas de enriquecido por tipo. Mismo motivo que MAX_VUELTAS en
// lib/home.ts: sin techo, un eje con poca cobertura en las plataformas del
// usuario encadena vueltas secuenciales y la latencia de cola queda abierta.
//
// Y el mismo sesgo: está calibrado para el eje más fácil de llenar. `hondo`
// termina en 21 tarjetas gastando 407 enriquecidos, contra 39 tarjetas y 434 de
// un día de `pop` — le sobra presupuesto sin usar. Ver el comentario largo junto
// a MAX_VUELTAS en lib/home.ts.
const AUDIENCIA_VUELTAS = 4;

export async function audienceTitles(slug: string, providers: PlatformCode[]): Promise<UITitle[]> {
  const ids = codesToTmdbIds(providers);
  if (!ids.length) return [];
  const types: MediaType[] = ["movie", "tv"];
  const pools = await Promise.all(types.map(async (tp) => {
    const rule = audienceRule(slug, tp);
    if (!rule) return [] as UITitle[];
    const extra: Record<string, string> = {};
    if (rule.certLte) { extra.certification_country = "US"; extra["certification.lte"] = rule.certLte; }
    if (rule.certGte) { extra.certification_country = "US"; extra["certification.gte"] = rule.certGte; }
    // El eje rota por día: hasta acá esto era el top 20 de la página 1 por
    // popularidad, o sea el MISMO carrusel todos los días y para todos los
    // usuarios con las mismas plataformas. Los rieles de género al menos
    // barajaban 60; éste no barajaba nada.
    const baseReceta = {
      genres: rule.genres,
      withoutGenres: rule.withoutGenres,
      extra: Object.keys(extra).length ? extra : undefined,
    };
    // Mismo resguardo que el hero: un eje que no puede llenar no se usa. Acá el
    // riesgo es menor (family y adult-anime son superficies anchas) pero el
    // mecanismo es el mismo, así que la protección va en el mismo lugar y no
    // duplicada — si mañana se suma un carrusel de audiencia más angosto, ya
    // está cubierto. La primera tanda se aprovecha: la trajo la verificación.
    let receta: Receta;
    let startPage: number;
    let primera: Candidato[] | null = null;
    if (poolsHabilitados) {
      const r = await candidatosConEje({
        superficie: `aud-${slug}`, tipo: tp, providers,
        semilla: dailySeed(), base: baseReceta, pages: 1,
      });
      receta = r.receta; startPage = r.startPage; primera = r.candidatos;
    } else {
      const r = recetaDelDia({ superficie: `aud-${slug}`, tipo: tp, semilla: dailySeed(), base: baseReceta });
      registrarEje(`aud-${slug}/${tp}`, r.eje);
      receta = r.receta; startPage = r.startPage;
    }
    const pub = await publishedIds(tp);
    // Se enriquece POR TANDAS y se vuelve a pedir hasta llenar o agotar
    // candidatos, igual que los rieles de género. Un tamaño de tanda fijo no
    // sirve: cuántos candidatos sobreviven al filtro de plataformas depende del
    // eje (en `hondo`, página 4, se cae bastante más que en `pop`) y del
    // catálogo del día, así que cualquier número elegido hoy queda mal mañana o
    // cuando se sumen recetas.
    let pagina = startPage;
    let pool: Candidato[] = [];
    const out: UITitle[] = [];
    let vueltas = 0;
    while (out.length < AUDIENCIA_OBJETIVO && vueltas < AUDIENCIA_VUELTAS) {
      if (!pool.length) {
        // La primera vuelta reusa lo que ya trajo la verificación del eje.
        // El camino viejo (`POOL_CACHE=0`) también repara: si no, apagar el
        // cache de pools apagaba de paso la reparación de idioma, que no tienen
        // nada que ver una con la otra.
        const traidos = primera ?? (poolsHabilitados
          ? await candidatosDePools({ tipo: tp, providers, receta, pages: 1, startPage: pagina })
          : (await repararLote(
              (await discover(tp, { ...receta.params, providers: ids, page: pagina })).results,
              () => pedirRespaldoIdioma(
                `audiencia:${tp}:p${pagina}`,
                async () => (await discover(tp, {
                  ...receta.params, providers: ids, page: pagina,
                  extra: { ...(receta.params.extra ?? {}), language: IDIOMA_FALLBACK },
                })).results,
              ),
              `audiencia-sin-pools ${tp}/p${pagina}`,
              { clave: clavePorId },
            )).items);
        primera = null;
        pagina++;
        if (!traidos.length) break;
        // La mezcla del día va sobre lo traído: sin esto la rotación cambiaría
        // el criterio pero seguiría mostrando siempre el tope del nuevo orden.
        pool = pickDaily(traidos, traidos.length, dailySeed() + tp.length);
      }
      vueltas++;
      const faltan = AUDIENCIA_OBJETIVO - out.length;
      // 40% de margen para lo que se cae en el filtro de plataformas.
      const tanda = pool.slice(0, Math.ceil(faltan * 1.4));
      pool = pool.slice(tanda.length);
      const items = await settleAll(
        tanda.map((t) => toUITitle(t, tp, pub)),
        `audienceTitles ${slug}/${tp}`,
      );
      out.push(...items.filter((i) => onUserPlatforms(i, providers)));
    }
    return out.slice(0, AUDIENCIA_OBJETIVO);
  }));
  return pools.flat();
}

// --- Búsqueda: títulos (todos, con disponibilidad) + personas ---
//
// EL PROBLEMA QUE RESUELVE, PORQUE NO ES EL QUE PARECE. Escribir "ste" no traía
// a Steven Spielberg, y la conclusión intuitiva —que TMDB no busca por prefijo—
// es falsa: sí lo hace ("spielb" lo encuentra, y "ste" devuelve 10.000
// resultados). Lo que falla es el ORDEN. TMDB rankea primero los match exactos,
// así que la página 1 de "ste" son diez personas que se llaman literalmente
// "Ste" y una película checa. Spielberg está en el puesto 49.
//
// Como el buscador pedía UNA página y se quedaba con los 20 primeros, mostraba
// exactamente esa capa de ruido. El arreglo son dos cosas:
//
//  1. Mirar más allá de la primera página, y por endpoint dedicado en vez de
//     `/search/multi`: en multi las personas compiten con los títulos por los
//     mismos 20 lugares, así que se pierden los dos.
//  2. Reordenar por popularidad. Es lo que convierte "predictivo" en útil: de
//     los miles que empiezan con "ste", el que se busca es casi siempre uno de
//     los conocidos. Medido: "ste" pasa de "Ste Johnston" a Spielberg segundo.
//
// Páginas por endpoint. 3 en personas no es un número redondo: Spielberg cae en
// el puesto 49 de "ste" y con 2 páginas (40) se lo perdía. En títulos alcanza
// con 2 porque el ruido de nombres propios es un problema de personas.
const BUSQUEDA_PAGINAS_PERSONA = 3;
const BUSQUEDA_PAGINAS_TITULO = 2;
// Cuántos títulos se enriquecen. Es el techo de costo de la búsqueda: cada uno
// cuesta un `providersOf`, y ese es el único modo de saber si está en las
// plataformas del usuario. Se ordena por relevancia ANTES de cortar, así que
// son los 24 más relevantes y no los 24 primeros que llegaron.
//
// 24 es el ancho del semáforo de TMDB (`MAX_EN_VUELO` en lib/tmdb.ts): el
// enriquecido entra en una sola tanda. Medido con consultas frescas:
//
//   tope   latencia en frío   disponibles que aparecen
//     24     1,2 - 2,4 s              5 - 9
//     48     2,9 - 3,4 s             11 - 17
//
// Duplicar el tope duplica las dos cosas. Se eligió la latencia: 3 s es
// demasiado para algo que corre mientras se tipea.
//
// LO QUE SE PIERDE, y conviene saberlo antes de que alguien lo reporte como
// bug: el corte pasa ANTES de conocer la disponibilidad, porque conocerla es
// justamente lo caro. O sea que un título que está en tus plataformas pero
// quedó en el puesto 30 por relevancia no aparece. En la práctica son títulos
// muy poco conocidos de búsquedas muy genéricas ("amor", "noche"); si alguna
// vez molesta, la salida NO es subir este número a ciegas sino enriquecer de a
// tandas y cortar cuando se juntaron N disponibles.
const BUSQUEDA_TITULOS = 24;
const BUSQUEDA_PERSONAS = 24;

// El orden del buscador vive en ./busqueda-orden: es puro y tiene tests.
// `relevancia` y `ordenarPorRelevancia` se movieron ahí sin cambiar de lógica;
// lo único nuevo es `conservarAlias`, que deja pasar los títulos que TMDB
// encontró por un nombre alternativo.

export async function search(query: string, providers: PlatformCode[] = []) {
  const q = query.trim();
  if (!q) return { titles: [] as UITitle[], people: [] as UIPerson[] };
  // Las plataformas van en la clave porque cambian el ORDEN del resultado, no
  // solo su presentación: dos usuarios con plataformas distintas reciben las
  // mismas tarjetas en distinto orden. Ordenadas, para que "n,d" y "d,n" sean
  // la misma entrada.
  // v2: cambia el CONTENIDO. `searchDeTipo` pasó a es-MX y los títulos que
  // TMDB encuentra por un nombre alternativo ya no se descartan.
  //
  // La clave sale del constructor porque el resultado SÍ es localizado: los
  // títulos vienen en es-MX (pin de `searchDeTipo`) pero el `knownFor` de las
  // personas sale del idioma base.
  let fallo = false;
  return cachedLocIf(
    claveSearch(q.toLowerCase(), [...providers].sort().join(","), HUELLA_IDIOMA),
    TTL.search,
    async () => {
      // El contexto de fallos de disponibilidad, además del de idioma. Son DOS
      // señales distintas y ninguna tapa a la otra: `fallo` queda en true si
      // falló cualquiera de las dos, y con eso alcanza para no guardar.
      const { res, fallos } = await withFallosDisponibilidad(async () => {
        const r = await buscarYOrdenar(q, providers);
        fallo = r.fallo;
        return { titles: r.titles, people: r.people };
      });
      if (fallos) fallo = true;
      return res;
    },
    () => !fallo,
  );
}

async function buscarYOrdenar(q: string, providers: PlatformCode[]) {
  let falloIdioma = false;
  const paginas = <T>(n: number, fn: (p: number) => Promise<{ results: T[] }>) =>
    Promise.all(Array.from({ length: n }, (_, i) => fn(i + 1)))
      .then((rs) => rs.flatMap((r) => r.results ?? []));

  const [personasRaw, pelis, series, pub] = await Promise.all([
    paginas(BUSQUEDA_PAGINAS_PERSONA, (p) => searchPersonas(q, p)),
    paginas(BUSQUEDA_PAGINAS_TITULO, (p) => searchDeTipo("movie", q, p)),
    paginas(BUSQUEDA_PAGINAS_TITULO, (p) => searchDeTipo("tv", q, p)),
    publishedIds(),
  ]);

  // Los `known_for` de las personas son TÍTULOS localizados, y salen del idioma
  // base (a diferencia de los títulos, que vienen del pin es-MX de
  // `searchDeTipo`). Lote MIXTO: mezclan películas y series.
  const conocidos = personasRaw.flatMap((p) => p.known_for ?? []);
  const repConocidos = await repararLote(
    conocidos,
    () => pedirRespaldoIdioma(`search:personas:${q}`,
      async () => (await Promise.all(Array.from({ length: BUSQUEDA_PAGINAS_PERSONA },
        (_, i) => searchPersonas(q, i + 1, IDIOMA_FALLBACK))))
        .flatMap((r) => r.results ?? []).flatMap((p) => p.known_for ?? [])),
    `search known_for «${q}»`,
    { clave: claveMixta, claveRespaldo: claveMixta },
  );
  falloIdioma = repConocidos.fallo;
  const porClaveConocidos = indiceMixto(repConocidos.items, claveMixta);

  // Las personas NO conservan alias: acá el filtro por nombre es lo que saca el
  // ruido, y es el arreglo que hizo que "ste" devuelva a Spielberg en vez de
  // diez personas llamadas literalmente "Ste".
  const people: UIPerson[] = ordenarPorRelevancia(personasRaw, q, {
    nombreDe: (p) => p.name ?? "", popDe: (p) => p.popularity ?? 0,
  })
    .slice(0, BUSQUEDA_PERSONAS)
    .map((r) => ({
      id: r.id, name: r.name,
      profile: img(r.profile_path, "w185"),
      knownFor: (r.known_for ?? [])
        .map((k) => titleOf(conRespuesto(porClaveConocidos, k, claveMixta)))
        .filter(Boolean).slice(0, 3),
      department: r.known_for_department,
    }));

  // Películas y series compiten en la misma lista: el usuario busca un título,
  // no un tipo, y el chip Películas/Series de la interfaz filtra después.
  const crudos = [
    ...pelis.map((m) => ({ raw: m, tipo: "movie" as MediaType })),
    ...series.map((s) => ({ raw: s, tipo: "tv" as MediaType })),
  ];
  const vistos = new Set<string>();
  const unicos = crudos.filter((c) => {
    const k = `${c.tipo}:${c.raw.id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const elegidos = ordenarPorRelevancia(unicos, q, {
    nombreDe: (c) => c.raw.title || c.raw.name || "",
    popDe: (c) => c.raw.popularity ?? 0,
    exacto: true,          // en títulos, el nombre completo sí manda
    conservarAlias: true,  // "La jungla de cristal" tiene que encontrar la 562
  }).slice(0, BUSQUEDA_TITULOS);

  // No se filtra por plataforma: si buscás algo por nombre, querés verlo aunque
  // no lo tengas, y la card indica disponibilidad. Pero sí se ORDENA: lo que
  // está en tus plataformas va primero. Antes salía mezclado, y encontrar lo
  // que podés ver esta noche era ir cazándolo entre lo que no.
  //
  // Es una partición estable, no un orden nuevo: dentro de "disponible" y
  // dentro de "no disponible" se conserva el orden por relevancia de arriba.
  const titles = await Promise.all(elegidos.map((c) => toUITitle(c.raw, c.tipo, pub)));
  if (!providers.length) return { titles, people, fallo: falloIdioma };
  const disponibles: UITitle[] = [];
  const resto: UITitle[] = [];
  for (const t of titles) (onUserPlatforms(t, providers) ? disponibles : resto).push(t);
  return { titles: [...disponibles, ...resto], people, fallo: falloIdioma };
}

// --- Actores populares paginados (pestaña Actores del buscador) ---
// TMDB no expone listado alfabético global de personas; el orden disponible
// es por popularidad. Paginamos de a ~20 con "Cargar más".
export async function popularPeople(page = 1): Promise<{ people: UIPerson[]; hasMore: boolean }> {
  let fallo = false;
  return cachedLocIf(clavePeoplePopular(page, HUELLA_IDIOMA), TTL.providers, async () => {
    const res = await personPopular(page);

    // `knownFor` son TÍTULOS localizados: la lista de actores también entra en
    // la reparación. Es la familia de claves que la primera auditoría se salteó.
    // Se aplanan los `known_for` de todas las personas en UN lote, así una sola
    // llamada de respaldo cubre la página entera.
    const planos = res.results.flatMap((p) => p.known_for ?? []);
    // Lote MIXTO: `known_for` mezcla películas y series, y TMDB reutiliza los
    // ids entre tipos. Con `clavePorId` la serie 1399 recibiría el título de la
    // película 1399.
    const reparados = await repararLote(
      planos,
      () => pedirRespaldoIdioma(`people:popular:p${page}`,
        async () => (await personPopular(page, IDIOMA_FALLBACK)).results.flatMap((p) => p.known_for ?? [])),
      `people:popular p${page}`,
      { clave: claveMixta, claveRespaldo: claveMixta },
    );
    fallo = reparados.fallo;
    const porClave = indiceMixto(reparados.items, claveMixta);

    const people = res.results
      .filter((p) => (p.known_for_department ?? "Acting") === "Acting" && p.profile_path)
      .map((p) => ({
        id: p.id, name: p.name, profile: img(p.profile_path, "w185"),
        knownFor: (p.known_for ?? []).map((k) => titleOf(conRespuesto(porClave, k, claveMixta)))
          .filter(Boolean).slice(0, 2),
      }));
    return { people, hasMore: res.page < res.total_pages };
  }, () => !fallo);
}

// --- Directores destacados (lista curada, editable) ---
const DIRECTOR_IDS = [
  525,     // Christopher Nolan
  137427,  // Denis Villeneuve
  1032,    // Martin Scorsese
  138,     // Quentin Tarantino
  488,     // Steven Spielberg
  45400,   // Greta Gerwig
  21684,   // Bong Joon-ho
  10828,   // Guillermo del Toro
  7467,    // David Fincher
  5655,    // Wes Anderson
  136495,  // Damien Chazelle (id 135822 original ya no resuelve en TMDB)
  291263,  // Jordan Peele (id 1352973 original apuntaba a otra persona)
  578,     // Ridley Scott
  2710,    // James Cameron
  108,     // Peter Jackson
  11218,   // Alfonso Cuarón
  223,     // Alejandro González Iñárritu
  309,     // Pedro Almodóvar
  4762,    // Paul Thomas Anderson
  1769,    // Sofia Coppola
  14392,   // Kathryn Bigelow
  5281,    // Spike Lee
  510,     // Tim Burton
  5602,    // David Lynch
  240,     // Stanley Kubrick
  1776,    // Francis Ford Coppola
  190,     // Clint Eastwood
  1614,    // Ang Lee
  2034,    // Danny Boyle
  6431,    // Darren Aronofsky
  20629,   // George Miller
  55934,   // Taika Waititi
  1395183, // Chloé Zhao
  67367,   // Rian Johnson
  11090,   // Edgar Wright
  138781,  // Robert Eggers
  1145520, // Ari Aster
  122423,  // Yorgos Lanthimos
  10099,   // Park Chan-wook
  608,     // Hayao Miyazaki
  12453,   // Wong Kar-wai
  1056121, // Ryan Coogler
  1223,    // Joel Coen
  1224,    // Ethan Coen
  9340,    // Lana Wachowski
  591600,  // Damián Szifron
  84714,   // Juan José Campanella
  56208,   // Lucrecia Martel
];
export async function directorCards(): Promise<UIPerson[]> {
  return cached("people:directors", TTL.catalog, async () => {
    const settled = await Promise.allSettled(DIRECTOR_IDS.map((id) => personDetails(id)));
    return settled
      .filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof personDetails>>> => s.status === "fulfilled")
      .map((s) => ({ id: s.value.id, name: s.value.name, profile: img(s.value.profile_path, "w185"), knownFor: [] }));
  });
}

// --- Un póster representativo por género (para los tiles de "Explorar todo") ---
export async function genreCovers(): Promise<Record<string, string | null>> {
  return cached("genre:covers:v2", TTL.catalog, async () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    // 1) Candidatos (posters) por género, en paralelo.
    const candidates = await Promise.all(slugs.map(async (slug) => {
      const rule = resolveCategory(slug, "movie");
      try {
        const res = await discover("movie", { genres: rule.genres, keywords: rule.keywords, minVotes: 300 });
        const posters = res.results.map((t) => t.poster_path).filter((p): p is string => !!p);
        return [slug, posters] as const;
      } catch {
        return [slug, [] as string[]] as const;
      }
    }));
    // 2) Asignación secuencial: cada género toma el primer poster no usado por
    //    otro (evita imágenes repetidas entre tiles). Fallback: su primer poster.
    const used = new Set<string>();
    const entries = candidates.map(([slug, posters]) => {
      const pick = posters.find((p) => !used.has(p)) ?? posters[0] ?? null;
      if (pick) used.add(pick);
      return [slug, img(pick, "w342")] as const;
    });
    return Object.fromEntries(entries);
  });
}

// --- Filmografía de una persona (actor o director), en tus plataformas ---
const JUNK_GENRES = new Set([10767, 10763, 10764]); // talk, news, reality
export async function personFilmography(id: number, providers: PlatformCode[]) {
  const [det, creditsCrudos] = await Promise.all([personDetails(id), personCombinedCredits(id)]);

  // La filmografía es un lote MIXTO: `cast` y `crew` mezclan películas y series,
  // y TMDB reutiliza los ids entre tipos. No está cacheada, así que un fallo del
  // respaldo solo cuesta esta vista y no se congela en ningún lado.
  const planos = [...creditsCrudos.cast, ...creditsCrudos.crew];
  const repCreditos = await repararLote(
    planos,
    () => pedirRespaldoIdioma(`filmografia:${id}`, async () => {
      const r = await personCombinedCredits(id, IDIOMA_FALLBACK);
      return [...r.cast, ...r.crew];
    }),
    `filmografía persona:${id}`,
    { clave: claveMixta, claveRespaldo: claveMixta },
  );
  const porClaveCred = indiceMixto(repCreditos.items, claveMixta);
  const credits = {
    cast: creditsCrudos.cast.map((c) => ({ ...c, ...conRespuesto(porClaveCred, c, claveMixta) })),
    crew: creditsCrudos.crew.map((c) => ({ ...c, ...conRespuesto(porClaveCred, c, claveMixta) })),
  };
  const pub = await publishedIds();
  const seen = new Set<string>();
  const acting = credits.cast.filter((c) => c.character && !/^(self|himself|herself)$/i.test(c.character));
  const directing = credits.crew.filter((c) => c.job === "Director");
  const merged = [...directing, ...acting].filter((c: CreditEntry) => {
    const k = `${c.id}:${c.media_type}`;
    if (seen.has(k)) return false; seen.add(k);
    if ((c.genre_ids ?? []).some((g) => JUNK_GENRES.has(g))) return false;
    return c.media_type === "movie" || c.media_type === "tv";
  }).sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
  const items = await Promise.all(merged.slice(0, 40).map((c) => toUITitle(c, c.media_type, pub)));
  const avail = items.filter((i) => onUserPlatforms(i, providers));
  return {
    person: { id: det.id, name: det.name, profile: img(det.profile_path, "w185"), knownFor: [] } as UIPerson,
    titles: avail,
    hidden: items.length - avail.length,
  };
}

// --- Detalle completo (merge TMDB + providers + reseña + relacionados) ---
function certOf(d: RawDetail, type: MediaType): string {
  if (type === "tv") {
    const ar = d.content_ratings?.results.find((r) => r.iso_3166_1 === "AR");
    return ar?.rating || "—";
  }
  const ar = d.release_dates?.results.find((r) => r.iso_3166_1 === "AR");
  return ar?.release_dates?.[0]?.certification || "—";
}

// Fecha de estreno DIGITAL en Argentina (tipo 4 de TMDB), o null si TMDB no la
// tiene — que es lo más común.
//
// `release_date` a secas es la "primary release date": la más temprana del
// mundo, normalmente una premiere o el estreno en cine. Para una app de
// streaming eso puede errarle por meses: The Fantastic 4 tiene primary
// 2025-07-23 y digital AR 2025-11-05. Ver issue #5, que decide qué se hace
// cuando este dato falta; acá solo se expone.
//
// No cuesta ningún request extra: `titleDetails` ya trae `release_dates` en el
// append_to_response, porque de ahí sale la certificación por edad.
function digitalARDe(d: RawDetail): string | null {
  const ar = d.release_dates?.results.find((r) => r.iso_3166_1 === "AR");
  const digital = ar?.release_dates?.find((x) => x.type === 4);
  return digital?.release_date?.slice(0, 10) || null;
}

// Fallback de la FICHA. Un solo título, así que el truco de reparar la página
// entera no aplica: acá se paga una segunda llamada, y solo cuando alguna señal
// se enciende. Medido: 5,6% de los títulos, o sea +0,056 llamadas por ficha en
// promedio. La alternativa era `append_to_response=translations`, que cuesta 0
// llamadas pero +34 KB en el 100% de las fichas para arreglar el 5,6%.
// Reparación de UN detalle, SIN mirar los relacionados. La usa `titleCard`,
// que descarta `recommendations`: inspeccionarlos ahí podía disparar una
// llamada de respaldo por un relacionado roto cuando la card estaba perfecta.
export async function detalleReparado(
  type: MediaType, id: number,
): Promise<{ detalle: RawDetail; fallo: boolean }> {
  const r = await adaptadorCard({
    pedirBase: () => titleDetails(type, id),
    pedirRespaldo: () => pedirRespaldoIdioma(
      `detalle:${type}:${id}`, () => titleDetails(type, id, IDIOMA_FALLBACK),
    ),
  });
  return { detalle: r.valor, fallo: r.fallo };
}

// Reparación del detalle MÁS sus relacionados. Solo para la ficha, que sí los
// muestra. UNA sola llamada de respaldo cubre las dos cosas, porque el detalle
// en es-ES trae los relacionados adentro.
async function detalleYRelacionadosReparados(
  type: MediaType, id: number,
): Promise<{ detalle: RawDetail; fallo: boolean }> {
  const d = await titleDetails(type, id);
  const relacionados = d.recommendations?.results ?? [];

  // El punto único ya une lo que esté en vuelo, así que la ficha y sus
  // relacionados comparten UNA sola llamada de respaldo sin memo propio.
  const pedir = () => pedirRespaldoIdioma(
    `detalle:${type}:${id}`, () => titleDetails(type, id, IDIOMA_FALLBACK),
  );

  // El MISMO adaptador que usa la card: la diferencia entre los dos caminos es
  // que este además repara los relacionados, no que repare distinto el detalle.
  const uno = await adaptadorCard({ pedirBase: async () => d, pedirRespaldo: pedir });
  if (!relacionados.length) return { detalle: uno.valor, fallo: uno.fallo };

  const rels = await repararLote(
    relacionados,
    async () => (await pedir()).recommendations?.results ?? [],
    `relacionados ${type}:${id}`,
    // Los relacionados de una película pueden ser series: lote MIXTO.
    { clave: claveMixta, claveRespaldo: claveMixta },
  );
  const detalle = rels.items === relacionados
    ? uno.valor
    : { ...uno.valor, recommendations: { ...d.recommendations!, results: rels.items } };
  return { detalle, fallo: uno.fallo || rels.fallo };
}

export async function detail(
  type: MediaType, id: number, providers: PlatformCode[] = [],
): Promise<UITitleDetail> {
  const [rep, prov] = await Promise.all([detalleYRelacionadosReparados(type, id), providersOf(type, id)]);
  const d = rep.detalle;
  // DESPUÉS de leer el cache de proveedores, y sin tocarlo. Si TMDB no informa
  // ninguna plataforma en AR, se mira si el título está en el top oficial
  // vigente de Netflix: esa lista la publica Netflix y dice, literalmente, qué
  // se vio EN Netflix Argentina esta semana.
  //
  // Pasó con "Moria" (`tv/322428`): TMDB tiene la ficha —hasta muestra el canal
  // y el homepage de Netflix en su web— pero `watch/providers` devuelve
  // `results: {}`, sin AR y sin ninguna otra región. La ficha del #1 del top
  // oficial de Netflix decía "No está en streaming".
  //
  // Lo que NO se hace acá, y es tan importante como lo que sí:
  //  - No se inventa `watchLink`. Ese link sale de TMDB y si TMDB no lo tiene,
  //    no hay a dónde mandar a nadie. La ficha dice dónde está, no promete un
  //    botón que no existe.
  //  - No se usa `networks` como disponibilidad. Que la serie sea "de Netflix"
  //    no dice que se pueda ver en Netflix Argentina; hay producciones de
  //    Netflix licenciadas a otros en la región, y otras que directamente no
  //    llegan. Lo único que se usa es el top de ESTE país.
  const plataformas = await disponibilidadDe(type, id, prov);
  const lang = d.original_language ?? "en";
  const trailer = await cached(`videos:${type}:${id}`, TTL.providers, async () =>
    pickTrailer((await titleVideos(type, id, lang)).results, lang));
  const editorial = await getEditorial(id, type);
  const pub = await publishedIds();

  // Relacionados: se piden más de los que se muestran porque después se filtran
  // a las plataformas del usuario. Antes no se filtraban y el riel llevaba a
  // fichas con el cartel "No está en streaming" — callejones sin salida.
  const recs = (d.recommendations?.results ?? []).filter((r) => r.poster_path).slice(0, 24);
  const relatedTodos = await settleAll(
    recs.map((r) => toUITitle(r, type, pub)), `related ${type}/${id}`,
  );
  const related = (providers.length
    ? relatedTodos.filter((r) => onUserPlatforms(r, providers))
    : relatedTodos
  ).slice(0, 12);

  const runtime = type === "movie"
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : null)
    : (d.number_of_seasons ? `${d.number_of_seasons} temp.` : null);

  const composers = d.credits?.crew
    ?.filter((c) => c.job === "Original Music Composer" || c.job === "Music")
    .map((c) => c.name) ?? [];

  // Las ayudas se resuelven ACÁ, en el servidor. El componente recibe lo que
  // tiene que pintar: no importa el mapa ni lee variables de entorno.
  const titulo = d.title || d.name || "";
  const original = d.original_title || d.original_name || "";
  const { ayudas, ayudaOriginal } = await ayudasDeBusqueda({
    tipo: type, tmdbId: d.id, tituloVisible: titulo,
    originalTitle: original,
    // La configuración se resuelve acá, en el servidor, y viaja como argumento.
    idiomaBase: IDIOMA_BASE,
    // SOLO donde el título está disponible: una ayuda para Max en algo que no
    // está en Max no se emite.
    plataformas,
  });

  return {
    id: d.id, type, title: titulo,
    year: (d.release_date || d.first_air_date)?.slice(0, 4) ? Number((d.release_date || d.first_air_date)!.slice(0, 4)) : null,
    releaseDate: (d.release_date || d.first_air_date) || null,
    nextAirDate: d.next_episode_to_air?.air_date || null,
    runtime, poster: img(d.poster_path), backdrop: img(d.backdrop_path, "w780"),
    country: primaryCountry(d),
    genres: [...new Set(genreIdsToSlugs(d.genres.map((g) => g.id)))],
    platforms: plataformas,
    tmdb: d.vote_average ? Number(d.vote_average.toFixed(1)) : null,
    hasEditorial: !!editorial,
    age: certOf(d, type),
    digitalAR: type === "movie" ? digitalARDe(d) : null,
    synopsis: d.overview || "",
    cast: d.credits?.cast?.slice(0, 12).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character || null,
      profile: img(c.profile_path, "w185"),
    })) ?? [],
    directors: d.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [],
    composers: [...new Set(composers)],
    seasons: d.number_of_seasons ?? null,
    episodes: d.number_of_episodes ?? null,
    links: prov.links,
    watchLink: prov.watchLink,
    trailerKey: trailer,
    related,
    editorial,
    // Solo si difiere del que se muestra: si no, es ruido en el payload.
    ...(original && original !== titulo ? { originalTitle: original } : {}),
    ...(ayudas ? { ayudas } : {}),
    ...(ayudaOriginal ? { ayudaOriginal } : {}),
  };
}

// --- "Lo más votados": card a partir de (tipo, id) sin listado previo ---
// Los votos guardan solo tmdb_id+tipo, así que reconstruimos la card pidiendo
// el detalle a TMDB (cacheado) y cruzando providers. Devuelve null si falla.
async function titleCard(type: MediaType, id: number): Promise<UITitle | null> {
  // `fallo` sale de la clausura al predicado: si el respaldo falló, la card se
  // devuelve igual pero NO se guarda. Sin esto, una card sin reparar quedaba
  // congelada 24 h bajo una clave con fallback, y la ruleta y los rieles de
  // votos —que se arman con `card:`— la servían hasta que expirara.
  let fallo = false;
  return cachedLocIf(claveCard(type, id, HUELLA_IDIOMA), TTL.catalog, async () => {
    // El productor entero va adentro del contexto: `disponibilidadDe` corre
    // acá abajo y su fallo tiene que llegar al predicado.
    const { res, fallos } = await withFallosDisponibilidad(async () => {
    try {
      const [rep, prov] = await Promise.all([detalleReparado(type, id), providersOf(type, id)]);
      const d = rep.detalle;
      fallo = rep.fallo;
      const dt = d.release_date || d.first_air_date;
      return {
        id: d.id, type, title: d.title || d.name || "",
        year: dt ? Number(dt.slice(0, 4)) : null,
        runtime: null, poster: img(d.poster_path),
        country: primaryCountry(d),
        genres: [...new Set(genreIdsToSlugs(d.genres.map((g) => g.id)))],
        platforms: await disponibilidadDe(type, id, prov),
        tmdb: d.vote_average ? Number(d.vote_average.toFixed(1)) : null,
        hasEditorial: false,
      } as UITitle;
    } catch {
      return null;
    }
    });
    // Un fallo de disponibilidad cuenta igual que uno de reparación de
    // idioma: la card se devuelve, pero no se guarda.
    if (fallos) fallo = true;
    return res;
  }, () => !fallo);
}

// Cuántas filas de votos se piden a la DB antes de cruzar con plataformas.
// Sobredimensionado a propósito: muchas se caen en el filtro de plataformas.
export const VOTED_ROWS = 60;

// Ventana de días que cuentan los rieles de votos.
//
// El número lo manda el VOLUMEN DE VOTOS, no el producto. Con 7 días —que es la
// promesa natural, "lo más votado esta semana"— y los 27 votos que hay hoy,
// "No gustaron" se quedaba con 1 título de 9 y "Lo más votados" con 5 de 17.
// Y como el riel muestra el estado vacío por debajo de 2 ítems, el usuario veía
// los dos rieles vacíos aunque hubiera votado.
//
// Medido el 2026-08-10: con 7 días, 1 y 5 títulos; con 90, 9 y 17.
//
// Cuando haya votos de verdad, bajarlo a 7 y la promesa vuelve a tener sentido.
export const VOTED_DAYS = 90;

// Ranking de votos cruzado con las plataformas del usuario, acotado a un rango
// de rating. Base compartida por "Lo más votados" (positivos) y "No gustaron"
// (negativos). Ventana en días.
//
// `limit` (default 20) es el corte final. El default conserva exactamente lo que
// devuelven /api/mas-votados y /api/hacete-cargo. El Home Composer pide un
// conjunto más amplio: se traen hasta VOTED_ROWS filas y cortar a 20 ANTES de
// que el composer deduplique le hacía perder tarjetas en silencio (un título ya
// usado por un riel de arriba dejaba un hueco que nadie rellenaba).
async function votedCards(
  providers: PlatformCode[], days: number, min: number, max: number, limit = 20,
): Promise<UITitle[]> {
  if (!providers.length) return [];
  const rows = await topVotedRows(days, Math.max(VOTED_ROWS, limit), min, max);
  if (!rows.length) return [];
  const pub = await publishedIds();
  const cards = await Promise.all(rows.map(async (r) => {
    const c = await titleCard(r.tipo, r.tmdb_id);
    if (!c) return null;
    // No mutar el objeto cacheado: se clona con los datos por-request.
    return {
      ...c,
      hasEditorial: pub.has(`${r.tmdb_id}:${r.tipo}`),
      votes: r.votos,
    } as UITitle;
  }));
  return cards
    .filter((c): c is UITitle => !!c && onUserPlatforms(c, providers))
    .slice(0, limit);
}

// "Lo más votados": ta buena (2) + petacular (3).
export async function mostVoted(providers: PlatformCode[], days = VOTED_DAYS, limit = 20): Promise<UITitle[]> {
  return votedCards(providers, days, 2, 3, limit);
}

// "No gustaron" (la ruta y la función siguen diciendo hacete-cargo/mostPanned:
// cambió el rótulo, no el riel): las que se llevaron malaso (1).
export async function mostPanned(providers: PlatformCode[], days = VOTED_DAYS, limit = 20): Promise<UITitle[]> {
  return votedCards(providers, days, 1, 1, limit);
}

// Enriquece una lista puntual de ids a cards. Para las listas del usuario:
// NO filtra por plataforma (la lista es del usuario, se muestra completa).
// Preserva el orden recibido.
export async function cardsByIds(pairs: { tipo: MediaType; id: number }[]): Promise<UITitle[]> {
  if (!pairs.length) return [];
  const pub = await publishedIds();
  const cards = await Promise.all(pairs.map(async (p) => {
    const c = await titleCard(p.tipo, p.id);
    if (!c) return null;
    return { ...c, hasEditorial: pub.has(`${p.id}:${p.tipo}`) } as UITitle;
  }));
  return cards.filter((c): c is UITitle => !!c);
}

// --- Candidatos crudos para el Home Composer ---
// Devuelve los RawTitle de TMDB SIN enriquecer (sin providersOf, que es la
// llamada cara: 1 request por título). El composer deduplica sobre estos raw y
// recién enriquece lo que va a mostrar. Mismas reglas de género/audiencia que
// listByCategory — se comparte la construcción del query para no divergir.
export async function categoryCandidates(opts: {
  tipo: MediaType; genre?: string; providers: PlatformCode[];
  pages?: number; startPage?: number; sortBy?: string; minVotes?: number;
  extra?: Record<string, string>; scope?: "home" | "browse";
  // Si viene, el orden y la página de arranque los decide el eje rotativo del
  // día (lib/pools.ts) en vez de `sortBy`/`minVotes`/`startPage`, y la receta se
  // llama `<superficie>-<eje>`. Lo usa el hero; los rieles de género todavía no.
  superficie?: string;
  // Ver `candidatosDeSuperficie`. Van acá también porque la página extra de
  // fallback del Home entra por esta puerta, y si no los reenviara pediría la
  // página siguiente de OTRA receta — con otros géneros excluidos y otro piso.
  sinGeneros?: number[];
  minVotesPorEje?: PisoPorEje;
  ejeFijo?: Eje;
}): Promise<RawTitle[]> {
  return (await candidatosDeSuperficie(opts)).candidatos;
}

// Igual que `categoryCandidates` pero devuelve además QUÉ eje se usó y desde
// qué página. El Home lo necesita para su página extra de fallback: con el eje
// rotativo, "la siguiente a las que ya pedí" no es la 4 fija, es la que sigue a
// la ventana del eje (`hondo` arranca en la 4, así que su extra es la 7).
export async function candidatosDeSuperficie(opts: {
  tipo: MediaType; genre?: string; providers: PlatformCode[];
  pages?: number; startPage?: number; sortBy?: string; minVotes?: number;
  extra?: Record<string, string>; scope?: "home" | "browse";
  superficie?: string;
  // Géneros que excluye LA SUPERFICIE, aparte de los que salen de `scope`. Se
  // UNEN, no se pisan: el riel de miniseries saca documental (99) por decisión
  // propia y encima hereda animación/infantil de la regla de audiencia.
  sinGeneros?: number[];
  // Piso de cantidad de votos declarado por la superficie, por eje (ver
  // `PisoPorEje` en lib/pools.ts). Sin esto el piso del eje gana siempre y pasar
  // `minVotes` en una superficie con eje rotativo no hace absolutamente nada.
  minVotesPorEje?: PisoPorEje;
  // Reusa un eje YA resuelto en vez de elegir uno. Lo usa la página extra de
  // fallback del Home: tiene que continuar el paginado de la misma receta con
  // la que se armó la ventana, o los candidatos no serían comparables. Con esto
  // `startPage` vuelve a mandar (que es lo que se quiere ahí) y no se vuelve a
  // correr la verificación del guard, que ya se hizo.
  ejeFijo?: Eje;
}): Promise<{ candidatos: RawTitle[]; startPage: number; eje: Eje | null; degradado: boolean }> {
  if (!opts.providers.length) return { candidatos: [], startPage: 1, eje: null, degradado: false };
  const ids = codesToTmdbIds(opts.providers);
  const rule = opts.genre && opts.genre !== "todos" ? resolveCategory(opts.genre, opts.tipo) : {};
  const pages = Math.max(1, opts.pages ?? 1);
  // startPage: desde qué página de discover arrancar (default 1, compatible con
  // todos los llamadores existentes). Pide startPage..startPage+pages-1.
  const startPage = Math.max(1, opts.startPage ?? 1);

  // Los parámetros que definen QUÉ trae el pool, sin plataforma ni página: esos
  // dos son ejes propios de la clave.
  //
  // `withoutGenres` entra acá y es importante que así sea: depende del conjunto
  // COMPLETO de plataformas del usuario (tener Crunchyroll apaga el filtro de
  // animación en toda la app). Como el hash de la receta lo incluye, dos
  // usuarios con filtros distintos usan pools distintos sin que haya que
  // pensarlo — y los que comparten filtro comparten pool.
  // Unión de las dos fuentes de exclusión: la de audiencia (`scope`) y la que
  // declara la superficie. Ordenada y sin repetidos para que el hash de la
  // receta no dependa del orden en que se escribieron.
  const sinTodo = [...new Set([
    ...(opts.scope
      ? excludedGenres({ scope: opts.scope, genre: opts.genre, providers: opts.providers }) ?? []
      : []),
    ...(opts.sinGeneros ?? []),
  ])].sort((a, b) => a - b);
  const base = {
    genres: rule.genres?.length ? rule.genres : undefined,
    keywords: rule.keywords?.length ? rule.keywords : undefined,
    // Igual que listByCategory: lo pide el llamador. Hoy solo lo hace el Home.
    withoutGenres: sinTodo.length ? sinTodo : undefined,
    originCountry: rule.originCountry,
    sortBy: opts.sortBy,
    minVotes: opts.minVotes,
    extra: opts.extra,
  };
  // Nombre legible de la receta: es lo que hace auditables las claves en Redis.
  // El que invalida es el hash de `params` (ver lib/pools.ts), así que mover un
  // piso de votos no exige acordarse de renombrar nada.
  const nombre = `g-${opts.genre ?? "todos"}${opts.scope ? `-${opts.scope}` : ""}`;
  const params: ParamsReceta = base;
  const desde = startPage;

  // Con eje rotativo: lo elige `candidatosConEje`, que además VERIFICA que ese
  // eje pueda llenar y cae a `pop` páginas 1-3 si no (ver el comentario largo en
  // lib/pools.ts). Sin esto, el día que a un chip angosto le tocaba `hondo` los
  // pools volvían vacíos y el chip no mostraba nada.
  //
  // Con POOL_CACHE=0 no hay ejes: se cae al camino de abajo, que es popularidad
  // páginas 1..pages. Es deliberado —ese interruptor existe para volver al
  // comportamiento previo a los pools— y coincide con el eje base, así que lo
  // que se pierde es la rotación, no el contenido.
  if (opts.superficie && poolsHabilitados) {
    const suf = `${opts.superficie}-${opts.genre ?? "todos"}`;
    if (opts.ejeFijo) {
      const r = recetaDeEje(opts.ejeFijo, {
        superficie: suf, tipo: opts.tipo, base, minVotesPorEje: opts.minVotesPorEje,
      });
      const candidatos = await candidatosDePools({
        tipo: opts.tipo, providers: opts.providers, receta: r.receta, pages, startPage,
      });
      return { candidatos, startPage, eje: opts.ejeFijo, degradado: false };
    }
    const r = await candidatosConEje({
      superficie: suf, tipo: opts.tipo, providers: opts.providers,
      semilla: dailySeed(), base, pages, minVotesPorEje: opts.minVotesPorEje,
    });
    return { candidatos: r.candidatos, startPage: r.startPage, eje: r.eje, degradado: r.degradado };
  }

  // Camino viejo: UNA consulta por página con el conjunto entero de plataformas.
  if (!poolsHabilitados) {
    const res = await Promise.all(Array.from({ length: pages }, (_, i) =>
      discover(opts.tipo, { ...params, providers: ids, page: desde + i })
        .then(async (r) => (await repararLote(r.results, () => pedirRespaldoIdioma(
          `superficie:${opts.tipo}:p${desde + i}`,
          async () => (await discover(opts.tipo, {
            ...params, providers: ids, page: desde + i,
            extra: { ...(params.extra ?? {}), language: IDIOMA_FALLBACK },
          })).results,
        ), `superficie-sin-pools ${opts.tipo}/p${desde + i}`, { clave: clavePorId })).items)));
    return { candidatos: res.flat(), startPage: desde, eje: null, degradado: false };
  }
  const candidatos = await candidatosDePools({
    tipo: opts.tipo,
    providers: opts.providers,
    receta: { nombre, params },
    pages,
    startPage: desde,
  });
  return { candidatos, startPage: desde, eje: null, degradado: false };
}

// --- "Miniseries para ansiosos": la lista paginada ---------------------------
// La página de /lista/miniseries. Mismas reglas de elegibilidad que el riel
// (`consultaListaMiniseries` las comparte) pero con dos diferencias deliberadas:
// no rota por ejes —la exploración tiene que ser estable— y NO deduplica contra
// el Home: "Ver todas" muestra el catálogo entero, incluidos los títulos que el
// riel ya está mostrando.
//
// Una página de la lista ES una página de TMDB. Con eso, `hayMas` sale de
// `total_pages` en vez de deducirse, y el orden no se reconstruye de nuestro
// lado, que era la causa de los salteos. La garantía llega hasta donde llega
// TMDB: si ellos recalculan el ranking entre dos pedidos, las páginas se pueden
// mover — es la limitación normal de paginar una API ajena, y por eso el cliente
// conserva su dedup al concatenar (ver `candidatosCombinados`).
//
// El único filtro que puede achicar una página es el estricto de plataformas de
// `enrichRaw`, y sobre esta superficie casi no corta: medido, 100% sobrevive en
// n,d,m a lo largo de 8 páginas. Por eso `hayMas` NO se calcula sobre lo
// visible: una página que quedara corta no puede cortar la lista.
export async function miniseriesLista(
  providers: PlatformCode[], pagina: number,
): Promise<{ items: UITitle[]; hayMas: boolean; pagina: number; totalPaginas: number; total: number }> {
  const p = Math.max(1, Math.floor(pagina) || 1);
  if (!providers.length) return { items: [], hayMas: false, pagina: p, totalPaginas: 0, total: 0 };
  const q = consultaListaMiniseries();
  const sinTodo = [...new Set([
    ...(excludedGenres({ scope: q.scope, genre: q.genre, providers }) ?? []),
    ...q.sinGeneros,
  ])].sort((a, b) => a - b);
  const receta: Receta = {
    nombre: "lista-mini",
    params: {
      withoutGenres: sinTodo.length ? sinTodo : undefined,
      sortBy: q.sortBy,
      minVotes: q.minVotes,
      extra: { ...q.extra },
    },
  };
  const r = await candidatosCombinados({ tipo: q.tipo, providers, receta, pagina: p });
  const items = soloMiniseries(
    await enrichRaw(r.candidatos, q.tipo, providers),
    providers,
    (m) => console.error(`[lista-mini] descartado — ${m}`),
  );
  return { items, hayMas: p < r.totalPaginas, pagina: p, totalPaginas: r.totalPaginas, total: r.total };
}

// Enriquece una tanda de raw (providers por título, cacheado) y filtra a las
// plataformas del usuario. Contraparte de categoryCandidates.
export async function enrichRaw(
  raws: RawTitle[], tipo: MediaType, providers: PlatformCode[],
): Promise<UITitle[]> {
  if (!raws.length) return [];
  const pub = await publishedIds(tipo);
  const items = await settleAll(raws.map((t) => toUITitle(t, tipo, pub)), `enrichRaw ${tipo}`);
  return items.filter((i) => onUserPlatforms(i, providers));
}

export { categoryLabel };
export type { RawTitle };
