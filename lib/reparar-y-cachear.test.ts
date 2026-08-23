// El caché de la reparación, sobre la implementación REAL.
//
// `resolverConCache` es la MISMA función que usa `cachedIf`/`cachedLocIf` en
// producción (lib/cache.ts la envuelve con el backend de Upstash). Acá se le
// inyecta un backend en memoria y TMDB falso: nadie reimplementa la decisión de
// cachear.
//
// La versión anterior de este archivo replicaba esa semántica adentro del test,
// y por eso tres bugs reales quedaron verdes. Un test que reimplementa lo que
// dice probar no prueba nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";
import {
  adaptadorCard, adaptadorPaginaCombinada, adaptadorRiel, adaptadorTopPop,
} from "./idioma-adaptadores.ts";

// --- Backend en memoria, con la misma forma que el real ---------------------
function backendMemoria() {
  const almacen = new Map<string, unknown>();
  let escrituras = 0;
  const backend: BackendCache = {
    async leer<T>(k: string) { return (almacen.has(k) ? almacen.get(k) as T : null); },
    async escribir<T>(k: string, v: T) { almacen.set(k, v); escrituras++; },
  };
  return { backend, almacen, get escrituras() { return escrituras; } };
}

const roto = (id: number, media_type = "movie") => ({
  id, media_type, title: "런닝맨", overview: "", original_language: "ko",
});
const sano = (id: number, media_type = "movie") => ({
  id, media_type, title: "Running Man", overview: "Un programa.",
});

/** Respaldo que falla la primera vez y anda de la segunda en adelante. */
function fallaUnaVez<T>(valor: () => T) {
  let n = 0;
  return {
    get intentos() { return n; },
    pedir: async () => { n++; if (n === 1) throw new Error("TMDB 500"); return valor(); },
  };
}

/** Los cinco pasos, con el adaptador REAL que corresponda. */
async function cincoPasos(
  clave: string,
  producir: () => Promise<{ valor: unknown; fallo: boolean }>,
  leerTitulo: (v: never) => string,
  reintentos: () => number,
) {
  const m = backendMemoria();
  let ejecuciones = 0;
  const pedir = () => resolverConCache({
    clave, ttl: 3600, backend: m.backend,
    producir: () => { ejecuciones++; return producir(); },
  });

  // 1 y 2. Falla el respaldo: devuelve la base y NO escribe.
  const a = await pedir();
  assert.equal(leerTitulo(a as never), "런닝맨", `${clave}: base sin reparar`);
  assert.equal(m.escrituras, 0, `${clave}: NO escribe con el respaldo caído`);
  assert.equal(m.almacen.has(clave), false);

  // 3 y 4. Segundo: vuelve a ejecutar, el respaldo anda, y guarda.
  const b = await pedir();
  assert.equal(ejecuciones, 2, `${clave}: el fetcher volvió a correr`);
  assert.equal(reintentos(), 2, `${clave}: se reintentó el respaldo`);
  assert.equal(leerTitulo(b as never), "Running Man", `${clave}: reparado`);
  assert.equal(m.escrituras, 1, `${clave}: ahora SÍ escribe`);

  // 5. Tercero: HIT.
  const c = await pedir();
  assert.equal(ejecuciones, 2, `${clave}: HIT, no volvió a ejecutar`);
  assert.equal(leerTitulo(c as never), "Running Man");
  return m;
}

test("card: — falla, no cachea, reintenta, repara, cachea, HIT", async () => {
  const r = fallaUnaVez(() => sano(1));
  await cincoPasos(
    "card:movie:1",
    () => adaptadorCard({
      pedirBase: async () => roto(1),
      pedirRespaldo: r.pedir,
    }),
    (v: { title: string }) => v.title,
    () => r.intentos,
  );
});

test("top:pop: — falla, no cachea, reintenta, repara, cachea, HIT", async () => {
  const r = fallaUnaVez(() => [sano(1), sano(2)]);
  await cincoPasos(
    "top:pop:n:movie",
    () => adaptadorTopPop({
      pedirBase: async () => [roto(1), roto(2)],
      pedirRespaldo: r.pedir,
    }),
    (v: { title: string }[]) => v[0].title,
    () => r.intentos,
  );
});

test("reco:v2 — el riel COMPUESTO tampoco se guarda si una capa falló", async () => {
  const r = fallaUnaVez(() => [sano(1)]);
  await cincoPasos(
    "reco:v2:huella",
    () => adaptadorRiel({
      armar: async (reparar) => ({ items: await reparar([roto(1)]) }),
      pedirRespaldo: r.pedir,
    }),
    (v: { items: { title: string }[] }) => v.items[0].title,
    () => r.intentos,
  );
});

test("reco:v2 — un RETORNO TEMPRANO con fallo tampoco se cachea", async () => {
  // `armar()` puede salir por `sin-candidatos` o `filtrado` DESPUÉS de que una
  // reparación falló. La decisión se toma al final, mirando las métricas, así
  // que no depende de acordarse de marcar nada antes de cada `return`.
  const m = backendMemoria();
  const producir = () => adaptadorRiel({
    armar: async (reparar) => {
      await reparar([roto(1)]);              // falla acá
      return { items: [], motivo: "sin-candidatos" };   // y sale temprano
    },
    pedirRespaldo: async () => { throw new Error("TMDB 500"); },
  });
  const v = await resolverConCache({ clave: "reco:v2:temprano", ttl: 3600, backend: m.backend, producir });
  assert.deepEqual((v as { items: unknown[] }).items, []);
  assert.equal(m.escrituras, 0, "el retorno temprano con fallo NO se guarda");
});

test("disc combinada — conserva totalPaginas y total, y no cachea si falló", async () => {
  const r = fallaUnaVez(() => [sano(1)]);
  const m = backendMemoria();
  const producir = () => adaptadorPaginaCombinada({
    pedirBase: async () => ({ results: [roto(1)], total_pages: 32, total_results: 627 }),
    pedirRespaldo: r.pedir,
  });
  const pedir = () => resolverConCache({ clave: "disc:combo:p1", ttl: 3600, backend: m.backend, producir });

  const a = await pedir() as { candidatos: { title: string }[]; totalPaginas: number; total: number };
  assert.equal(a.totalPaginas, 32, "la paginación sobrevive al fallo");
  assert.equal(a.total, 627);
  assert.equal(a.candidatos[0].title, "런닝맨");
  assert.equal(m.escrituras, 0);

  const b = await pedir() as typeof a;
  assert.equal(b.candidatos[0].title, "Running Man");
  assert.equal(b.totalPaginas, 32);
  assert.equal(b.total, 627);
  assert.equal(m.escrituras, 1);

  await pedir();
  assert.equal(r.intentos, 2, "el tercero fue HIT: no volvió a pedir");
});

test("lista VACÍA válida: fallo=false, sin reparaciones, y SÍ se cachea", async () => {
  const m = backendMemoria();
  const v = await resolverConCache({
    clave: "disc:vacio", ttl: 3600, backend: m.backend,
    producir: () => adaptadorTopPop({
      pedirBase: async () => [roto(1)],
      pedirRespaldo: async () => [],
    }),
  }) as { title: string }[];
  assert.equal(v[0].title, "런닝맨", "no había con qué reparar");
  assert.equal(m.escrituras, 1, "una respuesta válida se cachea igual");
});

test("null del respaldo: fallo, y no se cachea", async () => {
  const m = backendMemoria();
  await resolverConCache({
    clave: "k", ttl: 3600, backend: m.backend,
    producir: () => adaptadorTopPop({
      pedirBase: async () => [roto(1)],
      pedirRespaldo: async () => null,
    }),
  });
  assert.equal(m.escrituras, 0);
});
