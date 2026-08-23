// El fallo del respaldo NO puede envenenar el caché.
//
// Estos tests atraviesan un caché REAL en memoria con la misma semántica que
// `lib/cache.ts` (`cachedIf` solo escribe si el predicado lo aprueba), y
// recorren los cinco pasos por cada camino:
//
//   1. primer request: falla el respaldo → base sin reparar, NO escribe
//   2. segundo request: vuelve a ejecutar el fetcher
//   3. el respaldo funciona
//   4. devuelve y GUARDA la versión reparada
//   5. tercer request: HIT de la versión reparada
//
// Se replica la semántica de `cachedIf` y no se importa `lib/cache.ts` porque
// ese módulo arrastra el cliente de Upstash y no se puede cargar con
// `node --test`. Lo que se prueba es el CONTRATO —qué se guarda y qué no—, que
// es lo que decide si el contenido roto queda congelado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clavePorId, repararLote, repararUno } from "./idioma.ts";

// --- Caché en memoria con la semántica de `cachedIf` -------------------------
function crearCache() {
  const almacen = new Map<string, unknown>();
  let escrituras = 0;
  let ejecucionesDelFetcher = 0;
  return {
    almacen,
    get escrituras() { return escrituras; },
    get ejecuciones() { return ejecucionesDelFetcher; },
    tiene: (k: string) => almacen.has(k),
    async cachedIf<T>(k: string, fetcher: () => Promise<T>, vale: () => boolean): Promise<T> {
      if (almacen.has(k)) return almacen.get(k) as T;
      ejecucionesDelFetcher++;
      const v = await fetcher();
      if (vale()) { almacen.set(k, v); escrituras++; }
      return v;
    },
  };
}

const roto = (id: number) => ({
  id, title: "런닝맨", overview: "", original_language: "ko",
});
const sano = (id: number) => ({ id, title: "Running Man", overview: "Un programa." });

/** Respaldo que falla la primera vez y anda de la segunda en adelante. */
function respaldoQueFallaUnaVez(items: () => unknown[]) {
  let n = 0;
  return {
    get intentos() { return n; },
    pedir: async () => {
      n++;
      if (n === 1) throw new Error("TMDB 500");
      return items() as never;
    },
  };
}

// Los cinco pasos, para un camino de LOTE (pools, top:pop, categorías).
async function cincoPasos(clave: string) {
  const cache = crearCache();
  const r = respaldoQueFallaUnaVez(() => [sano(1)]);
  const base = [roto(1)];

  const pedirYCachear = () => {
    let fallo = false;
    return cache.cachedIf(clave, async () => {
      const rep = await repararLote(base, r.pedir, "test", { clave: clavePorId, activo: true });
      fallo = rep.fallo;
      return rep.items;
    }, () => !fallo);
  };

  // 1. Primer request: el respaldo falla.
  const primero = await pedirYCachear();
  assert.equal(primero[0].title, "런닝맨", "devuelve la base sin reparar");
  assert.equal(cache.escrituras, 0, "NO escribe el caché");
  assert.equal(cache.tiene(clave), false);

  // 2 y 3. Segundo request: vuelve a ejecutar el fetcher, y el respaldo anda.
  const segundo = await pedirYCachear();
  assert.equal(cache.ejecuciones, 2, "el fetcher volvió a correr");
  assert.equal(r.intentos, 2, "se reintentó el respaldo");

  // 4. Devuelve y guarda la reparada.
  assert.equal(segundo[0].title, "Running Man", "reparada");
  assert.equal(cache.escrituras, 1, "ahora SÍ escribe");

  // 5. Tercer request: HIT.
  const tercero = await pedirYCachear();
  assert.equal(cache.ejecuciones, 2, "no volvió a ejecutar el fetcher: fue HIT");
  assert.equal(tercero[0].title, "Running Man");
  return cache;
}

test("card: — falla, no cachea, reintenta, repara, cachea, HIT", async () => {
  // `titleCard` va por `repararUno`, pero el contrato de caché es el mismo.
  const cache = crearCache();
  const r = respaldoQueFallaUnaVez(() => sano(1) as never);
  const pedir = () => {
    let fallo = false;
    return cache.cachedIf("card:movie:1", async () => {
      const rep = await repararUno(roto(1), r.pedir as never, "card", true);
      fallo = rep.fallo;
      return rep.item;
    }, () => !fallo);
  };

  const a = await pedir();
  assert.equal(a.title, "런닝맨");
  assert.equal(cache.escrituras, 0, "no escribe con el respaldo caído");

  const b = await pedir();
  assert.equal(cache.ejecuciones, 2, "reintentó");
  assert.equal(b.title, "Running Man");
  assert.equal(cache.escrituras, 1);

  await pedir();
  assert.equal(cache.ejecuciones, 2, "HIT");
});

test("top:pop: — falla, no cachea, reintenta, repara, cachea, HIT", async () => {
  await cincoPasos("top:pop:n:movie");
});

test("reco:v2 — el riel COMPUESTO tampoco se guarda si una capa falló", async () => {
  // El riel se cachea aparte de las cards. Aunque cada `card:` de adentro se
  // proteja sola, el compuesto podría guardar items sin reparar.
  const cache = crearCache();
  const r = respaldoQueFallaUnaVez(() => [sano(1), sano(2)]);
  const base = [roto(1), roto(2)];

  const armarRiel = () => {
    const senal = { fallo: false };
    return cache.cachedIf("reco:v2:huella", async () => {
      const rep = await repararLote(base, r.pedir, "reco", { clave: clavePorId, activo: true });
      if (rep.fallo) senal.fallo = true;
      return { items: rep.items };
    }, () => !senal.fallo);
  };

  const a = await armarRiel();
  assert.equal(a.items[0].title, "런닝맨");
  assert.equal(cache.escrituras, 0, "el riel NO se guarda a medias");

  const b = await armarRiel();
  assert.equal(cache.ejecuciones, 2);
  assert.equal(b.items[0].title, "Running Man");
  assert.equal(b.items[1].title, "Running Man");
  assert.equal(cache.escrituras, 1);

  await armarRiel();
  assert.equal(cache.ejecuciones, 2, "HIT del riel reparado");
});

test("disc: (pool) — mismo contrato", async () => {
  await cincoPasos("disc:v1:AR:2026-08-23:movie:n:pop.x:p1");
});

// ============================================================================
// La consulta PAGINADA, con el helper real
// ============================================================================
// `candidatosCombinados` arma { candidatos, totalPaginas, total } DESPUÉS de
// reparar. Se reproduce ese orden exacto para comprobar que un fallo del
// respaldo no pierde la paginación ni la cachea.

async function paginaCombinada(
  cache: ReturnType<typeof crearCache>,
  base: ReturnType<typeof roto>[],
  pedirRespaldo: () => Promise<never>,
  meta: { totalPaginas: number; total: number },
) {
  let fallo = false;
  return cache.cachedIf("disc:combo:p1", async () => {
    const rep = await repararLote(base, pedirRespaldo, "combinada", {
      clave: clavePorId, activo: true,
    });
    fallo = rep.fallo;
    return { candidatos: rep.items, totalPaginas: meta.totalPaginas, total: meta.total };
  }, () => !fallo);
}

test("paginada: el fallo del respaldo conserva totalPaginas y total, y no cachea", async () => {
  const cache = crearCache();
  const r = respaldoQueFallaUnaVez(() => [sano(1)]);
  const meta = { totalPaginas: 32, total: 627 };

  const a = await paginaCombinada(cache, [roto(1)], r.pedir, meta);
  assert.equal(a.totalPaginas, 32, "la paginación sobrevive al fallo");
  assert.equal(a.total, 627);
  assert.equal(a.candidatos[0].title, "런닝맨", "items sin reparar");
  assert.equal(cache.escrituras, 0, "no se cachea");

  const b = await paginaCombinada(cache, [roto(1)], r.pedir, meta);
  assert.equal(cache.ejecuciones, 2, "reintenta");
  assert.equal(b.candidatos[0].title, "Running Man");
  assert.equal(b.totalPaginas, 32);
  assert.equal(b.total, 627);
  assert.equal(cache.escrituras, 1);

  await paginaCombinada(cache, [roto(1)], r.pedir, meta);
  assert.equal(cache.ejecuciones, 2, "HIT");
});

test("paginada: timeout del respaldo, mismo comportamiento", async () => {
  const cache = crearCache();
  const timeout = () => Promise.reject(new DOMException("aborted", "TimeoutError")) as Promise<never>;
  const a = await paginaCombinada(cache, [roto(1)], timeout, { totalPaginas: 5, total: 90 });
  assert.equal(a.totalPaginas, 5);
  assert.equal(cache.escrituras, 0);
});

// ============================================================================
// Vacío válido NO es caída
// ============================================================================

test("lista VACÍA: fallo=false, sin reparaciones, y SÍ se cachea", async () => {
  // Una `[]` devuelta correctamente por TMDB es una respuesta válida que no
  // trae con qué reparar. Tratarla como caída dejaría esa clave sin cachear
  // para siempre, reintentando en cada request algo que nunca va a mejorar.
  const cache = crearCache();
  let fallo = false;
  const v = await cache.cachedIf("disc:vacio", async () => {
    const rep = await repararLote([roto(1)], async () => [], "vacío", {
      clave: clavePorId, activo: true,
    });
    fallo = rep.fallo;
    return rep.items;
  }, () => !fallo);
  assert.equal(fallo, false, "vacío válido NO es fallo");
  assert.equal(v[0].title, "런닝맨", "no había con qué reparar");
  assert.equal(cache.escrituras, 1, "se cachea igual");
});

test("null y undefined SÍ son fallo, y no se cachean", async () => {
  for (const malo of [async () => null, async () => undefined]) {
    const cache = crearCache();
    let fallo = false;
    await cache.cachedIf("k", async () => {
      const rep = await repararLote([roto(1)], malo, "malo", { clave: clavePorId, activo: true });
      fallo = rep.fallo;
      return rep.items;
    }, () => !fallo);
    assert.equal(fallo, true);
    assert.equal(cache.escrituras, 0);
  }
});

test("respaldo PARCIAL: repara lo que hay, no declara caída, y cachea", async () => {
  const cache = crearCache();
  let fallo = false;
  const v = await cache.cachedIf("k", async () => {
    // Vienen 2 rotos y el respaldo solo trae uno.
    const rep = await repararLote([roto(1), roto(2)], async () => [sano(1)], "parcial", {
      clave: clavePorId, activo: true,
    });
    fallo = rep.fallo;
    return rep.items;
  }, () => !fallo);
  assert.equal(fallo, false, "parcial NO es caída general");
  assert.equal(v[0].title, "Running Man", "el que vino se repara");
  assert.equal(v[1].title, "런닝맨", "el que no vino queda intacto");
  assert.equal(cache.escrituras, 1, "se cachea");
});
