// Home Composer — pipeline que arma TODO el Home en un solo lugar.
//
//   TMDB → Audience Filter (lib/audience.ts, ya existente)
//        → Compose (orden + prioridad)
//        → Dedup (tmdb_id + media_type)
//        → [rotate: reservado, hoy identidad]
//        → [personalize: reservado, hoy identidad]
//        → HomePayload
//
// Reglas (ver docs/superpowers/plans/2026-08-06-home-composer.md):
//  - Un título aparece UNA sola vez en todo el Home.
//  - La prioridad es el orden visual: lo que toma un riel se lo quita a los de abajo.
//  - "Para vos hoy" (hero) tiene la prioridad más alta y reserva sus títulos.
//  - "Próximamente" y "Desempatá" NO participan (no reservan ni se filtran):
//    no se construyen acá, siguen siendo sus propios componentes.
//  - Si un riel pierde ítems por dedup, se rellena con más candidatos hasta
//    completar VISIBLE_CARDS. Página extra de TMDB solo como fallback.
//
// FETCH EN PARALELO / TAKE EN SERIE
// El dedup (`used`) condiciona QUÉ se toma, no QUÉ se pide: ninguna de las
// fuentes lee `used` para armar su request. Por eso todas se piden a la vez
// (etapa 1) y recién después se aplica `take()` una por una en el orden visual
// del Home (etapa 2). El resultado es idéntico a hacerlo secuencial — está
// verificado comparando la salida byte a byte — pero el Home pasó de ~6 s a
// ~2-4 s de tiempo de servidor.
// La ÚNICA excepción es el enriquecido de los rieles de género: ahí sí importa
// `used`, porque `providersOf` cuesta 1 request por título y no tiene sentido
// pagarlo por títulos que un riel de más arriba ya se llevó.
import "server-only";
import {
  categoryCandidates, enrichRaw, latestReleases, mostVoted, mostPanned,
  audienceTitles, recommendations, VOTED_ROWS, type RawTitle,
} from "./enrich";
// HOME_GENRES / defaultTypeFor viven en components/data.ts (módulo client-safe):
// el cliente los necesita para el estado de los toggles, y si los importara de
// acá arrastraría lib/enrich → lib/cache → Upstash Redis al bundle del navegador.
import { HOME_GENRES, defaultTypeFor } from "@/components/data";
import { soloAnimePlatform } from "./audience";
import type { MediaType, PlatformCode, UITitle } from "./types";

export const VISIBLE_CARDS = 20;
// Los rieles de audiencia (family / adult-anime) mergean movie+tv (~40 títulos) y
// siempre se mostraron completos. Cortarlos a VISIBLE_CARDS reduciría tarjetas
// visibles, así que el composer los recorta con su propio límite.
export const AUDIENCE_CARDS = 40;
// Páginas de discover que se piden de entrada (20 por página). Con 2 (=40
// candidatos) se cubre el peor solapamiento medido (7 de 20). La 3ª página solo
// se pide si tras dedup + filtro de plataformas el riel quedó corto.
export const FETCH_BUFFER = 2;

export interface HomeRail {
  key: string;
  title?: string;
  genre?: string;
  items: UITitle[];
  seeAllHref?: string;
  typeToggle?: "refetch" | "filter";
  shelfKey?: string;
  activeType?: MediaType;
}

export interface HomePayload {
  hero: UITitle[];
  rails: HomeRail[];
  // true SOLO cuando el usuario no eligió ninguna plataforma. Un Home vacío por
  // esta razón no es un fallo de carga y no se arregla reintentando: el cliente
  // tiene que invitar a elegir plataformas, no ofrecer un botón inútil.
  sinPlataformas?: boolean;
  // Cuántas fuentes se cayeron (`safe` las degradó a vacío) y el booleano
  // derivado. Con todo envuelto en `safe`, composeHome NO puede rechazar: sin
  // esto una caída total de TMDB llegaba al cliente como un 200 con 11 rieles
  // vacíos, indistinguible de "no hay nada en tus plataformas" — mensaje falso y
  // sin forma de reintentar.
  fallos: number;
  degradado: boolean;
}

const keyOf = (t: { id: number; type: MediaType }) => `${t.type}:${t.id}`;
const rawKey = (t: RawTitle, tipo: MediaType) => `${tipo}:${t.id}`;

// --- Tolerancia a fallos -----------------------------------------------------
// Un riel que se cae devuelve [] y se auto-oculta; el resto del Home sobrevive.
// Antes, con ~316 llamadas a TMDB por request, un solo 429 rechazaba
// composeHome entero → 500 → pantalla sin un solo riel. Nunca en silencio: lo
// que se cayó queda logueado en server Y contado en `Contador`, que viaja en el
// payload: degradar sin decirlo convertía una caída de TMDB en el mensaje
// "Nada en tus plataformas", que es mentira y no ofrece reintentar.
interface Contador { fallos: number }

async function safe<T>(c: Contador, etiqueta: string, vacio: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    c.fallos++;
    // El error COMPLETO (con stack): con solo `.message`, un TypeError propio
    // era indistinguible de un 429 de TMDB.
    console.error(`[home] "${etiqueta}" falló, se degrada a vacío —`, e);
    // Fuera de producción se re-lanza: un bug propio tiene que verse en
    // desarrollo (500 + stack), no esconderse detrás de un riel vacío.
    if (process.env.NODE_ENV !== "production") throw e;
    return vacio;
  }
}

// --- Etapa: Dedup -----------------------------------------------------------
// Reserva las claves de `items` en `used` y devuelve solo las no vistas.
function take(items: UITitle[], used: Set<string>, limit = VISIBLE_CARDS): UITitle[] {
  const out: UITitle[] = [];
  if (limit <= 0) return out;
  for (const t of items) {
    const k = keyOf(t);
    if (used.has(k)) continue;
    used.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// --- Etapa: Source (con buffer y relleno) ------------------------------------
// Consume los candidatos crudos ya pedidos (etapa 1), descarta los ya usados
// ANTES de enriquecer (que es lo caro: 1 request de providers por título),
// enriquece con margen, filtra a las plataformas y completa VISIBLE_CARDS.
// Los candidatos que sobran de una tanda se arrastran a la siguiente: recién
// cuando el pool se agota de verdad se pide UNA página extra a TMDB.
// Tope de tandas de enriquecido por riel. `tanda = ceil(faltan * 1.4)` se achica
// junto con `faltan` (mínimo 2), así que sin tope, con cobertura baja de
// plataformas, un género podía encadenar 10-20 round-trips SECUENCIALES (y cada
// providersOf puede costar hasta 8 s de timeout) × 6 géneros. Termina, pero la
// latencia de cola queda abierta. Con 4 vueltas se conserva el beneficio de
// arrastrar el pool sin dejar el peor caso sin techo.
const MAX_VUELTAS = 4;

async function genreRail(
  c: Contador, genre: string, tipo: MediaType, providers: PlatformCode[], used: Set<string>,
  candidatos: RawTitle[],
): Promise<UITitle[]> {
  const out: UITitle[] = [];
  let pool = candidatos;
  let pedidaExtra = false;
  let vueltas = 0;
  // La página extra es la SIGUIENTE al buffer inicial (FETCH_BUFFER + 1) y se
  // pide una sola vez: 1..FETCH_BUFFER ya vinieron en la etapa paralela.
  const pedirExtra = async () => {
    pedidaExtra = true;
    return safe(c, `genre:${genre} página extra`, [] as RawTitle[], () =>
      categoryCandidates({ tipo, genre, providers, startPage: FETCH_BUFFER + 1, pages: 1, scope: "home" }));
  };

  while (out.length < VISIBLE_CARDS) {
    // Dedup sobre raw: contra lo ya usado por rieles anteriores y contra lo que
    // este mismo riel ya tomó en la tanda previa.
    pool = pool.filter((r) => !used.has(rawKey(r, tipo)));
    if (!pool.length) {
      if (pedidaExtra) break;
      pool = await pedirExtra();
      if (!pool.length) break;
      continue;
    }
    // El tope cuenta tandas de enriquecido (lo caro), no la recarga del pool.
    if (vueltas >= MAX_VUELTAS) break;
    vueltas++;
    // Margen del 40% para absorber lo que se caiga por el filtro de plataformas.
    const faltan = VISIBLE_CARDS - out.length;
    const tanda = pool.slice(0, Math.ceil(faltan * 1.4));
    // Lo que no entró en la tanda NO se tira: queda en el pool para la vuelta
    // siguiente. Antes se descartaban ~12 candidatos ya pagados y se compraba
    // una página nueva para reemplazarlos.
    pool = pool.slice(tanda.length);
    const enriquecidos = await safe(c, `genre:${genre} enrich`, [] as UITitle[], () =>
      enrichRaw(tanda, tipo, providers));
    out.push(...take(enriquecidos, used, faltan));
    if (!pool.length && pedidaExtra) break;
  }
  return out;
}

// --- Etapas reservadas (hoy identidad) --------------------------------------
// Puntos de extensión ya cableados en el pipeline para no tener que volver a
// tocar la estructura cuando se implementen. NO implementar todavía.
function rotate(rails: HomeRail[]): HomeRail[] { return rails; }
function personalize(rails: HomeRail[]): HomeRail[] { return rails; }

// --- Pipeline ---------------------------------------------------------------
export async function composeHome(opts: {
  providers: PlatformCode[];
  types?: Record<string, MediaType>;
}): Promise<HomePayload> {
  const { providers } = opts;
  const types = opts.types ?? {};
  const used = new Set<string>();
  // Contador de fuentes caídas, compartido por todos los `safe` de este request.
  const c: Contador = { fallos: 0 };

  if (!providers.length) {
    return { hero: [], rails: [], sinPlataformas: true, fallos: 0, degradado: false };
  }

  // Tipo activo de cada riel de género, resuelto antes de pedir nada (define el
  // endpoint de discover de cada uno).
  const generosTipo = HOME_GENRES.map((g) => ({ g, tipo: types[g] ?? defaultTypeFor(g) }));

  // === Etapa 1: todas las fuentes en paralelo ===============================
  // Nadie de acá lee `used`, así que el orden de resolución no afecta la salida.
  const [heroRaw, latestP1, votadosPool, cargoPool, generosRaw, familyPool, animePool] =
    await Promise.all([
      // Hero "Para vos hoy" — prioridad más alta, reserva sus títulos.
      // Solo el estado base (genre=todos, offset=0): los chips y "Mostrame otras"
      // son exploración puntual y no rearman el Home.
      safe(c, "hero", [] as UITitle[], () => recommendations({ tipo: "all", providers, n: 6, offset: 0 })),
      // Últimos lanzamientos. Sin toggle (hoy es solo movie, por fecha de estreno).
      // La página 2 es fallback y NO se prefetchea: cuesta 1 discover + 20
      // providersOf y casi nunca hace falta (la página 1 alcanza para los 20).
      safe(c, "ultimos p1", [] as UITitle[], () => latestReleases(providers, "movie", 1)),
      // Votos: se pide el conjunto AMPLIO (hasta VOTED_ROWS filas) para que el
      // dedup tenga de dónde rellenar. El corte final lo hace `take` acá abajo.
      safe(c, "mas-votados", [] as UITitle[], () => mostVoted(providers, 7, VOTED_ROWS)),
      safe(c, "hacete-cargo", [] as UITitle[], () => mostPanned(providers, 7, VOTED_ROWS)),
      // Candidatos crudos de cada riel de género (páginas 1..FETCH_BUFFER).
      // Crudos = sin providersOf: enriquecer sí depende de `used` y va en etapa 2.
      Promise.all(generosTipo.map(({ g, tipo }) =>
        safe(c, `genre:${g} candidatos`, [] as RawTitle[], () =>
          categoryCandidates({ tipo, genre: g, providers, startPage: 1, pages: FETCH_BUFFER, scope: "home" })))),
      // Audiencia. NO se toca su lógica (lib/audience.ts): se consume su salida y
      // solo se deduplica. Devuelve movie+tv mergeados (~40), hay margen.
      // LIMITACIÓN: a diferencia de los votos y de los rieles de género, acá no
      // hay un "conjunto más amplio" que pedir — audienceTitles trae una sola
      // página fija por tipo y no acepta paginado. Si el dedup se lleva muchos,
      // estos dos carruseles se acortan y no hay con qué rellenarlos.
      safe(c, "family", [] as UITitle[], () => audienceTitles("family", providers)),
      safe(c, "adult-anime", [] as UITitle[], () => audienceTitles("adult-anime", providers)),
    ]);

  // === Etapa 2: take() en el orden de prioridad del Home =====================
  // Estrictamente secuencial: cada `take` reserva en `used` y se lo quita a los
  // de abajo. Este orden ES la prioridad visual.

  // 1. Hero.
  const hero = take(heroRaw, used, 6);

  // 2. Últimos lanzamientos. Si el hero ya reservó títulos de la página 1, se
  //    rellena con la página 2 (como mucho una vuelta de fallback).
  const latest = take(latestP1, used, VISIBLE_CARDS);
  // Página 1 vacía = no hay más resultados; pedir la 2 sería un request al pedo.
  if (latestP1.length && latest.length < VISIBLE_CARDS) {
    const p2 = await safe(c, "ultimos p2", [] as UITitle[], () => latestReleases(providers, "movie", 2));
    latest.push(...take(p2, used, VISIBLE_CARDS - latest.length));
  }

  // 3. Votos. Modo "filter": la lista es mixta movie+tv y el cliente acota por
  //    tipo, así que acá NO se corta a VISIBLE_CARDS por tipo.
  const votados = take(votadosPool, used, VISIBLE_CARDS * 2);
  const cargo = take(cargoPool, used, VISIBLE_CARDS * 2);

  // 4. Rieles de género, en orden. Cada uno deduplica contra todo lo anterior y
  //    enriquece solo lo que va a mostrar (por eso este tramo sigue en serie).
  const generos: HomeRail[] = [];
  for (let i = 0; i < generosTipo.length; i++) {
    const { g, tipo } = generosTipo[i];
    generos.push({
      key: `genre:${g}`,
      genre: g,
      items: await genreRail(c, g, tipo, providers, used, generosRaw[i]),
      typeToggle: "refetch",
      shelfKey: g,
      activeType: tipo,
      seeAllHref: `/categoria/${g}?tipo=${tipo}`,
    });
  }

  // 5. Audiencia.
  // Con Crunchyroll SOLA el Home entero ya es anime (los rieles de género no lo
  // filtran, ver excludedGenres), así que un carrusel "Animación para adultos"
  // sería una repetición de lo mismo con otro título. Con Crunchyroll + otra
  // plataforma sí se mantiene: Max y Netflix también tienen animación adulta.
  const ocultarAnime = soloAnimePlatform(providers);
  const family = take(familyPool, used, AUDIENCE_CARDS);
  const anime = ocultarAnime ? [] : take(animePool, used, AUDIENCE_CARDS);

  const rails: HomeRail[] = [
    { key: "ultimos", title: "Últimos lanzamientos", items: latest, seeAllHref: "/lista/ultimos" },
    { key: "mas-votados", title: "Lo más votados", items: votados, seeAllHref: "/lista/mas-votados", typeToggle: "filter", shelfKey: "mas-votados", activeType: types["mas-votados"] ?? "movie" },
    { key: "hacete-cargo", title: "Hacete cargo", items: cargo, seeAllHref: "/lista/hacete-cargo", typeToggle: "filter", shelfKey: "hacete-cargo", activeType: types["hacete-cargo"] ?? "movie" },
    ...generos,
    { key: "family", title: "🍿 Para toda la familia", items: family, seeAllHref: "/lista/familia" },
    ...(ocultarAnime
      ? []
      : [{ key: "adult-anime", title: "🎬 Animación para adultos", items: anime, seeAllHref: "/lista/anime-adulto" }]),
  ];

  if (c.fallos) console.error(`[home] payload degradado: ${c.fallos} fuente(s) caída(s)`);
  return { hero, rails: personalize(rotate(rails)), fallos: c.fallos, degradado: c.fallos > 0 };
}
