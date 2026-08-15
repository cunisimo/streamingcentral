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
  personDetails, searchMulti, personPopular,
  type RawTitle, type RawDetail, type CreditEntry,
} from "./tmdb";
import { codeForTmdbId, codesToTmdbIds } from "./providers-ar";
import { resolveCategory, genreIdsToSlugs, categoryLabel, categoryBySlug, CATEGORIES, type Category } from "./categories";
import { curatedTitles, curatedBlocklist, intercalarEstratos } from "./curated";
import { getEditorial, publishedIds } from "./reviews";
import { cached, TTL, dailySeed, pickDaily } from "./cache";
import { candidatosDePools, poolsHabilitados, recetaDelDia, registrarEje, type Candidato } from "./pools";
import { topVotedRows } from "./votes";
import { excludedGenres, audienceRule } from "./audience";
import { primaryCountry } from "./countries";
import { pickTrailer } from "./trailer";
import type {
  MediaType, PlatformCode, UITitle, UITitleDetail, UIPerson,
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

// providers de un título en AR (cacheado) -> { codes, links, watchLink }
async function providersOf(type: MediaType, id: number) {
  return cached(`pv:${type}:${id}`, TTL.providers, async () => {
    const r = await watchProviders(type, id);
    const ar = r.results?.["AR"];
    const codes = new Set<PlatformCode>();
    const links: Partial<Record<PlatformCode, string>> = {};
    for (const p of ar?.flatrate ?? []) {
      const code = codeForTmdbId(p.provider_id);
      if (code) { codes.add(code); links[code] = ar.link; }
    }
    return { codes: [...codes], links, watchLink: ar?.link ?? null };
  });
}

// El link del agregador para un título. Reusa el MISMO `cached` de providersOf
// (clave `pv:${type}:${id}`), así que en un listado ya enriquecido con
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
  const { codes } = await providersOf(type, t.id);
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
  const [res, resAlt] = await Promise.all([
    discover(opts.tipo, {
      ...base,
      withoutGenres: sinTodo([...(rule.withoutGenres ?? []), ...(rule2.withoutGenres ?? [])]),
      genres: genres.length ? genres : undefined,
      keywords: keywords.length ? keywords : undefined,
      extra,
    }),
    rule.alt
      ? discover(opts.tipo, {
          ...base,
          withoutGenres: sinTodo(rule.alt.withoutGenres),
          genres: rule.alt.genres,
          keywords: rule.alt.keywords,
          extra: opts.extra,
        })
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
  return items.filter((i) => onUserPlatforms(i, opts.providers));
}

// --- Últimos lanzamientos (por fecha de estreno, en tus plataformas) ---
export async function latestReleases(
  providers: PlatformCode[], tipo: MediaType = "movie", page = 1,
): Promise<UITitle[]> {
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
export async function recommendations(opts: {
  genre?: string; tipo: MediaType | "all"; providers: PlatformCode[]; n?: number; offset?: number;
}): Promise<UITitle[]> {
  const n = opts.n ?? 6;
  const offset = opts.offset ?? 0;
  const cat = opts.genre ? categoryBySlug(opts.genre) : undefined;

  // --- Ruta curada -----------------------------------------------------------
  if (cat?.curatedSlug) {
    const pool = await curatedPool(cat, opts.providers, n);
    // El RPC ya barajó con la semilla del día y el intercalado fijó el orden:
    // acá solo se pagina. Volver a mezclar rompería ambas cosas.
    if (!pool.length) return [];
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
    return tanda;
  }

  const types: MediaType[] = opts.tipo === "all" ? ["movie", "tv"] : [opts.tipo];
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
    return tanda;
  }

  return pickDaily(pool, n, dailySeed(), offset);
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
    const { receta, eje, startPage } = recetaDelDia({
      superficie: `aud-${slug}`,
      tipo: tp,
      semilla: dailySeed(),
      base: {
        genres: rule.genres,
        withoutGenres: rule.withoutGenres,
        extra: Object.keys(extra).length ? extra : undefined,
      },
    });
    registrarEje(`aud-${slug}/${tp}`, eje);
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
        const traidos = poolsHabilitados
          ? await candidatosDePools({ tipo: tp, providers, receta, pages: 1, startPage: pagina })
          : (await discover(tp, { ...receta.params, providers: ids, page: pagina })).results;
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

// --- Búsqueda multi: títulos (todos, con disponibilidad) + personas ---
export async function search(query: string) {
  const [res, pub] = await Promise.all([searchMulti(query), publishedIds()]);
  const slice = res.results.slice(0, 20);
  const people: UIPerson[] = slice
    .filter((r): r is Extract<typeof r, { media_type: "person" }> => r.media_type === "person")
    .map((r) => ({
      id: r.id, name: r.name,
      profile: img(r.profile_path, "w185"),
      knownFor: (r.known_for ?? []).map(titleOf).filter(Boolean).slice(0, 3),
      department: r.known_for_department,
    }));
  const rawTitles = slice.filter(
    (r): r is RawTitle & { media_type: MediaType } => r.media_type === "movie" || r.media_type === "tv",
  );
  // No filtramos por plataforma: si buscás algo por nombre, querés verlo aunque
  // no lo tengas. La card indica disponibilidad.
  const titles = await Promise.all(rawTitles.map((r) => toUITitle(r, r.media_type, pub)));
  return { titles, people };
}

// --- Actores populares paginados (pestaña Actores del buscador) ---
// TMDB no expone listado alfabético global de personas; el orden disponible
// es por popularidad. Paginamos de a ~20 con "Cargar más".
export async function popularPeople(page = 1): Promise<{ people: UIPerson[]; hasMore: boolean }> {
  return cached(`people:popular:${page}`, TTL.providers, async () => {
    const res = await personPopular(page);
    const people = res.results
      .filter((p) => (p.known_for_department ?? "Acting") === "Acting" && p.profile_path)
      .map((p) => ({
        id: p.id, name: p.name, profile: img(p.profile_path, "w185"),
        knownFor: (p.known_for ?? []).map(titleOf).filter(Boolean).slice(0, 2),
      }));
    return { people, hasMore: res.page < res.total_pages };
  });
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
  const [det, credits] = await Promise.all([personDetails(id), personCombinedCredits(id)]);
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

export async function detail(
  type: MediaType, id: number, providers: PlatformCode[] = [],
): Promise<UITitleDetail> {
  const [d, prov] = await Promise.all([titleDetails(type, id), providersOf(type, id)]);
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

  return {
    id: d.id, type, title: d.title || d.name || "",
    year: (d.release_date || d.first_air_date)?.slice(0, 4) ? Number((d.release_date || d.first_air_date)!.slice(0, 4)) : null,
    releaseDate: (d.release_date || d.first_air_date) || null,
    nextAirDate: d.next_episode_to_air?.air_date || null,
    runtime, poster: img(d.poster_path), backdrop: img(d.backdrop_path, "w780"),
    country: primaryCountry(d),
    genres: [...new Set(genreIdsToSlugs(d.genres.map((g) => g.id)))],
    platforms: prov.codes,
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
  };
}

// --- "Lo más votados": card a partir de (tipo, id) sin listado previo ---
// Los votos guardan solo tmdb_id+tipo, así que reconstruimos la card pidiendo
// el detalle a TMDB (cacheado) y cruzando providers. Devuelve null si falla.
async function titleCard(type: MediaType, id: number): Promise<UITitle | null> {
  return cached(`card:${type}:${id}`, TTL.catalog, async () => {
    try {
      const [d, prov] = await Promise.all([titleDetails(type, id), providersOf(type, id)]);
      const dt = d.release_date || d.first_air_date;
      return {
        id: d.id, type, title: d.title || d.name || "",
        year: dt ? Number(dt.slice(0, 4)) : null,
        runtime: null, poster: img(d.poster_path),
        country: primaryCountry(d),
        genres: [...new Set(genreIdsToSlugs(d.genres.map((g) => g.id)))],
        platforms: prov.codes,
        tmdb: d.vote_average ? Number(d.vote_average.toFixed(1)) : null,
        hasEditorial: false,
      } as UITitle;
    } catch {
      return null;
    }
  });
}

// Cuántas filas de votos se piden a la DB antes de cruzar con plataformas.
// Sobredimensionado a propósito: muchas se caen en el filtro de plataformas.
export const VOTED_ROWS = 60;

// Ventana de días que cuentan los rieles de votos.
//
// El número lo manda el VOLUMEN DE VOTOS, no el producto. Con 7 días —que es la
// promesa natural, "lo más votado esta semana"— y los 27 votos que hay hoy,
// "Hacete cargo" se quedaba con 1 título de 9 y "Lo más votados" con 5 de 17.
// Y como el riel muestra el estado vacío por debajo de 2 ítems, el usuario veía
// los dos rieles vacíos aunque hubiera votado.
//
// Medido el 2026-08-10: con 7 días, 1 y 5 títulos; con 90, 9 y 17.
//
// Cuando haya votos de verdad, bajarlo a 7 y la promesa vuelve a tener sentido.
export const VOTED_DAYS = 90;

// Ranking de votos cruzado con las plataformas del usuario, acotado a un rango
// de rating. Base compartida por "Lo más votados" (positivos) y "Hacete cargo"
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

// "Hacete cargo": las que se llevaron malaso (1).
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
}): Promise<RawTitle[]> {
  if (!opts.providers.length) return [];
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
  const params = {
    genres: rule.genres?.length ? rule.genres : undefined,
    keywords: rule.keywords?.length ? rule.keywords : undefined,
    // Igual que listByCategory: lo pide el llamador. Hoy solo lo hace el Home.
    withoutGenres: opts.scope
      ? excludedGenres({ scope: opts.scope, genre: opts.genre, providers: opts.providers })
      : undefined,
    originCountry: rule.originCountry,
    sortBy: opts.sortBy,
    minVotes: opts.minVotes,
    extra: opts.extra,
  };
  // Nombre legible de la receta: es lo que hace auditables las claves en Redis.
  // El que invalida es el hash de `params` (ver lib/pools.ts), así que mover un
  // piso de votos no exige acordarse de renombrar nada.
  const nombre = `g-${opts.genre ?? "todos"}${opts.scope ? `-${opts.scope}` : ""}`;
  // Camino viejo: UNA consulta por página con el conjunto entero de plataformas.
  if (!poolsHabilitados) {
    const res = await Promise.all(Array.from({ length: pages }, (_, i) =>
      discover(opts.tipo, { ...params, providers: ids, page: startPage + i })));
    return res.flatMap((r) => r.results);
  }
  return candidatosDePools({
    tipo: opts.tipo,
    providers: opts.providers,
    receta: { nombre, params },
    pages,
    startPage,
  });
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
