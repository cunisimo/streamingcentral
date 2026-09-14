// Dos lotes que TRAGABAN errores de TMDB y cacheaban el resultado parcial 24 h
// (auditoría de Codex sobre e930a1d, hallazgos 1 y 3):
//
//   - `directorCards()`: `Promise.allSettled` + `cached` incondicional. Un
//     `ErrorTmdb` en un director dejaba la lista corta guardada `TTL.catalog`.
//     Registraba el descarte, pero FUERA de todo contexto: el registrador no
//     hace nada ahí, así que la marca se perdía.
//   - `genreCovers()`: un `catch` por género convertía el fallo en `[]` y el
//     mapa incompleto quedaba 24 h.
//
// Acá se prueba la composición REAL (`resolverConCache`, la misma que corre en
// producción) con dobles de TMDB: un fallo parcial se responde con lo que hay,
// NO se guarda, y la llamada siguiente vuelve a intentar y, si TMDB volvió,
// obtiene el resultado completo y recién entonces lo guarda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverDirectores, resolverPortadas } from "./lotes-tolerantes.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import { withFallosTmdb } from "./fallos-tmdb.ts";
import type { BackendCache } from "./reparar-y-cachear.ts";

function backend(): BackendCache & { escrituras: number; datos: Map<string, unknown> } {
  const datos = new Map<string, unknown>();
  return {
    datos, escrituras: 0,
    async leer(clave: string) { return datos.has(clave) ? datos.get(clave) : null; },
    async escribir(clave: string, valor: unknown) { this.escrituras++; datos.set(clave, valor); },
  } as BackendCache & { escrituras: number; datos: Map<string, unknown> };
}
const e429 = () => new ErrorTmdb({ estado: 429, clase: "http429", path: "/person/x", retryAfterMs: 2000 });

// ============================================================================
// Directores
// ============================================================================

function directoresConDoble(caidos: Set<number>) {
  const llamadas: number[] = [];
  const pedirDetalle = async (id: number) => {
    llamadas.push(id);
    if (caidos.has(id)) throw e429();
    return { id, name: `Director ${id}`, profile_path: `/p${id}.jpg` as string | null };
  };
  return { pedirDetalle, llamadas };
}

test("directores: un ErrorTmdb parcial responde con los demás y NO se guarda; la siguiente llamada vuelve a intentar", async () => {
  const cache = backend();
  const caidos = new Set([2]);
  const d = directoresConDoble(caidos);
  const primera = await withFallosTmdb(() => resolverDirectores({ ids: [1, 2, 3], ttl: 60, cache, pedirDetalle: d.pedirDetalle }));
  assert.deepEqual(primera.res.map((x) => x.id), [1, 3], "responde con los que sí llegaron");
  assert.equal(primera.fallos, 1, "el descarte queda registrado en el contexto");
  assert.equal(cache.escrituras, 0, "🔴 el resultado parcial NO se guarda");
  // TMDB vuelve: la llamada siguiente reintenta y obtiene los tres, y recién ahí guarda.
  caidos.clear();
  const segunda = await withFallosTmdb(() => resolverDirectores({ ids: [1, 2, 3], ttl: 60, cache, pedirDetalle: d.pedirDetalle }));
  assert.deepEqual(segunda.res.map((x) => x.id), [1, 2, 3]);
  assert.equal(segunda.fallos, 0);
  assert.equal(cache.escrituras, 1);
  assert.equal(d.llamadas.length, 6, "la segunda llamada volvió a pedir los tres (no había nada guardado)");
  // Tercera: HIT, sin pedir nada.
  await resolverDirectores({ ids: [1, 2, 3], ttl: 60, cache, pedirDetalle: d.pedirDetalle });
  assert.equal(d.llamadas.length, 6);
});

test("CONTROL directores: si el resultado parcial se guardara, la segunda llamada NO reintentaría", async () => {
  // Reproduce el comportamiento de e930a1d con el resolver real y un
  // predicado que siempre guarda: la lista corta queda cacheada y el director
  // caído no vuelve a pedirse. Es lo que el test de arriba tiene que impedir.
  const { resolverConCache } = await import("./reparar-y-cachear.ts");
  const cache = backend();
  const d = directoresConDoble(new Set([2]));
  const producirComoAntes = async () => {
    const settled = await Promise.allSettled([1, 2, 3].map((id) => d.pedirDetalle(id)));
    return { valor: settled.filter((s) => s.status === "fulfilled").map((s) => (s as PromiseFulfilledResult<{ id: number }>).value.id), fallo: false };
  };
  await resolverConCache({ clave: "k", ttl: 60, backend: cache, producir: producirComoAntes });
  assert.equal(cache.escrituras, 1, "como antes: guarda la lista corta");
  const otra = await resolverConCache({ clave: "k", ttl: 60, backend: cache, producir: producirComoAntes });
  assert.deepEqual(otra, [1, 3], "y la sirve corta desde caché");
  assert.equal(d.llamadas.length, 3, "sin reintentar al caído");
});

test("directores: un error que NO es de TMDB no cuenta como descarte de TMDB (sigue descartándose y no se guarda por seguridad)", async () => {
  const cache = backend();
  const pedirDetalle = async (id: number) => { if (id === 2) throw new TypeError("propio"); return { id, name: "x", profile_path: null }; };
  const r = await withFallosTmdb(() => resolverDirectores({ ids: [1, 2], ttl: 60, cache, pedirDetalle }));
  assert.deepEqual(r.res.map((x) => x.id), [1]);
  assert.equal(r.fallos, 0);
  assert.equal(cache.escrituras, 0);
});

// ============================================================================
// Portadas de género
// ============================================================================

function portadasConDoble(caidos: Set<string>) {
  const llamadas: string[] = [];
  const pedirPosters = async (slug: string) => {
    llamadas.push(slug);
    if (caidos.has(slug)) throw e429();
    return [`/${slug}-1.jpg`, `/${slug}-2.jpg`];
  };
  return { pedirPosters, llamadas };
}
const img = (p: string | null) => (p ? `https://img${p}` : null);

test("portadas: un fallo parcial usa el fallback visual (null) para ese género y NO guarda el mapa; al volver TMDB, la siguiente llamada trae todas y guarda", async () => {
  const cache = backend();
  const caidos = new Set(["terror"]);
  const d = portadasConDoble(caidos);
  const slugs = ["accion", "terror", "drama"];
  const primera = await withFallosTmdb(() => resolverPortadas({ slugs, ttl: 60, cache, pedirPosters: d.pedirPosters, img }));
  assert.equal(primera.res.accion, "https://img/accion-1.jpg");
  assert.equal(primera.res.terror, null, "el género caído queda con el fallback de siempre");
  assert.equal(primera.fallos, 1);
  assert.equal(cache.escrituras, 0, "🔴 el mapa incompleto NO se guarda");
  caidos.clear();
  const segunda = await withFallosTmdb(() => resolverPortadas({ slugs, ttl: 60, cache, pedirPosters: d.pedirPosters, img }));
  assert.equal(segunda.res.terror, "https://img/terror-1.jpg", "TMDB volvió: la portada aparece");
  assert.equal(cache.escrituras, 1, "y recién ahora se guarda");
  await resolverPortadas({ slugs, ttl: 60, cache, pedirPosters: d.pedirPosters, img });
  assert.equal(d.llamadas.length, 6, "la tercera es HIT");
});

test("portadas: con TMDB sano la asignación es la de siempre (cada género toma el primer póster no usado por otro)", async () => {
  const cache = backend();
  const pedirPosters = async (slug: string) => (slug === "b" ? ["/x.jpg", "/y.jpg"] : ["/x.jpg"]);
  const r = await resolverPortadas({ slugs: ["a", "b"], ttl: 60, cache, pedirPosters, img });
  assert.deepEqual(r, { a: "https://img/x.jpg", b: "https://img/y.jpg" });
  assert.equal(cache.escrituras, 1);
});
