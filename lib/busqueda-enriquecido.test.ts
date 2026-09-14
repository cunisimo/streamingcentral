// El enriquecido de los resultados de búsqueda, tolerante al fallo OPCIONAL
// de `providersOf` (auditoría de Codex sobre e930a1d, hallazgo 2).
//
// En e930a1d, `search()` recuperaba un 429 de `providersOf` con
// `tituloSinPlataformas`… y acto seguido `identidadDeBusqueda()` volvía a
// llamar a `providersOf()` para ese mismo título, sin protección: con un 429
// persistente, el dato opcional convertía TODA la búsqueda en 503. Acá se
// prueba la composición real con dobles: un `providersOf` que devuelve 429
// siempre para un título deja ese título sin plataformas, NO se vuelve a pedir
// durante la deduplicación, el resultado se marca (`fallo`) y NO se guarda; un
// fallo de las páginas principales sigue propagando (→ 503 en la ruta).
import { test } from "node:test";
import assert from "node:assert/strict";
import { enriquecerElegidos, producirBusquedaConFallos } from "./busqueda-enriquecido.ts";
import { resolverConCache } from "./reparar-y-cachear.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import { withFallosTmdb } from "./fallos-tmdb.ts";
import type { BackendCache } from "./reparar-y-cachear.ts";
import type { UITitle } from "./types.ts";

const e429 = () => new ErrorTmdb({ estado: 429, clase: "http429", path: "/movie/x/watch/providers", retryAfterMs: 2000 });
const raw = (id: number) => ({ id, title: `T${id}`, poster_path: null, vote_average: 7, vote_count: 100 });
const ui = (id: number, platforms: string[]): UITitle => ({
  id, type: "movie", title: `T${id}`, year: null, runtime: null, poster: null, country: null, genres: [],
  platforms: platforms as UITitle["platforms"], tmdb: 7, hasEditorial: false,
});

function doble(caidos: Set<number>) {
  const llamadasProviders: number[] = [];
  const llamadasIdentidad: number[] = [];
  return {
    llamadasProviders, llamadasIdentidad,
    // `enriquecer` es `toUITitle`: adentro pide providersOf UNA vez.
    enriquecer: async (c: E) => { llamadasProviders.push(c.raw.id); if (caidos.has(c.raw.id)) throw e429(); return ui(c.raw.id, ["n"]); },
    sinPlataformas: (c: E) => ui(c.raw.id, []),
    // `identidadDe` es `identidadDeBusqueda`: en e930a1d volvía a pedir providersOf.
    identidadDe: async (_t: string, id: number) => { llamadasIdentidad.push(id); if (caidos.has(id)) throw e429(); return null; },
  };
}
type E = { raw: ReturnType<typeof raw>; tipo: "movie" };
const elegidos: E[] = [1, 2, 3].map((id) => ({ raw: raw(id), tipo: "movie" as const }));

test("providersOf con 429 persistente en un título → 200 con ese título sin plataformas, sin repetir la consulta en la deduplicación", async () => {
  const d = doble(new Set([2]));
  const { res, fallos } = await withFallosTmdb(() => enriquecerElegidos(elegidos, d));
  assert.deepEqual(res.titles.map((t) => [t.id, t.platforms]), [[1, ["n"]], [2, []], [3, ["n"]]]);
  assert.equal(res.sinProveedores, 1);
  assert.equal(fallos, 1, "el descarte queda registrado en el contexto");
  assert.deepEqual(d.llamadasProviders, [1, 2, 3], "providersOf se pidió UNA vez por título");
  assert.deepEqual(d.llamadasIdentidad, [1, 3], "🔴 la identidad NO se pide para el título degradado: sería el segundo providersOf");
});

test("CONTROL: si la identidad se pidiera igual para el degradado, el 429 persistente tumbaría la búsqueda entera", async () => {
  // Reproduce e930a1d: identidad para todos, incluido el que ya falló.
  const d = doble(new Set([2]));
  const comoAntes = async () => {
    const titles = await Promise.all(elegidos.map((c) => d.enriquecer(c).catch(() => d.sinPlataformas(c))));
    await Promise.all(titles.map((t) => d.identidadDe("movie", t.id)));
    return titles;
  };
  await assert.rejects(comoAntes(), (e: unknown) => e instanceof ErrorTmdb && e.estado === 429);
  assert.equal(d.llamadasProviders.filter((id) => id === 2).length, 1);
  assert.equal(d.llamadasIdentidad.includes(2), true, "el segundo pedido es el que rompe");
});

test("con TMDB sano el resultado es el de siempre: identidad para todos, ninguno degradado", async () => {
  const d = doble(new Set());
  const { res, fallos } = await withFallosTmdb(() => enriquecerElegidos(elegidos, d));
  assert.deepEqual(res.titles.map((t) => t.platforms), [["n"], ["n"], ["n"]]);
  assert.equal(res.sinProveedores, 0);
  assert.equal(fallos, 0);
  assert.deepEqual(d.llamadasIdentidad, [1, 2, 3]);
});

test("un error que NO es de TMDB en el enriquecido propaga (un bug propio no se degrada)", async () => {
  const d = doble(new Set());
  d.enriquecer = async (_c: E) => { throw new TypeError("propio"); };
  await assert.rejects(enriquecerElegidos(elegidos, d), TypeError);
});

// ============================================================================
// El resultado degradado no se guarda; el fallo principal propaga
// ============================================================================

function backend(): BackendCache & { escrituras: number } {
  const datos = new Map<string, unknown>();
  return {
    escrituras: 0,
    async leer(clave: string) { return datos.has(clave) ? datos.get(clave) : null; },
    async escribir(clave: string, valor: unknown) { this.escrituras++; datos.set(clave, valor); },
  } as BackendCache & { escrituras: number };
}

test("búsqueda cacheada: páginas correctas + providersOf en 429 persistente → responde y NO guarda; al recuperarse, guarda", async () => {
  const cache = backend();
  const caidos = new Set([2]);
  const d = doble(caidos);
  const paginas = async () => ({ elegidos, people: [], falloIdioma: false });
  // La MISMA composición que `search()`: `cachedIf` es `resolverConCache` con
  // el productor y su verdicto (lib/cache-delega.test.ts lo fija).
  const resolver = () => resolverConCache({ clave: "search:x", ttl: 60, backend: cache, producir: () => producirBusquedaConFallos({ paginas, ...d }) });
  const primera = await resolver();
  assert.equal(primera.titles.find((t) => t.id === 2)?.platforms.length, 0);
  assert.equal(primera.degradacion?.proveedores, 1);
  assert.equal(cache.escrituras, 0, "🔴 el resultado degradado NO se guarda");
  caidos.clear();
  const segunda = await resolver();
  assert.equal(segunda.degradacion, undefined);
  assert.equal(cache.escrituras, 1);
});

test("búsqueda cacheada: un fallo de las páginas principales propaga el ErrorTmdb (la ruta responde 503) y no guarda nada", async () => {
  const cache = backend();
  const d = doble(new Set());
  const paginas = async () => { throw new ErrorTmdb({ estado: 503, clase: "http5xx", path: "/search/movie" }); };
  await assert.rejects(resolverConCache({ clave: "search:x", ttl: 60, backend: cache, producir: () => producirBusquedaConFallos({ paginas, ...d }) }), (e: unknown) => e instanceof ErrorTmdb && e.estado === 503);
  assert.equal(cache.escrituras, 0);
  assert.deepEqual(d.llamadasProviders, []);
});
