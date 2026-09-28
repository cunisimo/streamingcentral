// Contrato versionado de `/api/person/[id]` (lib/filmografia-ruta.ts): qué
// ejecuta cada cliente, y que ninguna petición ejecute dos versiones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { responderFilmografia, VERSION_FILMOGRAFIA, type DepsFilmografia } from "./filmografia-ruta.ts";
import type { DisponibilidadObras, FilmografiaLegado, FilmografiaPersona } from "./types.ts";

function dobles() {
  const llamadas: string[] = [];
  const deps: DepsFilmografia = {
    v1: async (id, providers) => { llamadas.push(`v1:${id}:${providers.join(",")}`); return { person: { id, name: "P", profile: null, knownFor: [] }, titles: [], hidden: 0 } as FilmografiaLegado; },
    v2: async (id) => { llamadas.push(`v2:${id}`); return { person: { id, name: "P", profile: null, knownFor: [] } } as unknown as FilmografiaPersona; },
    items: async (claves) => { llamadas.push(`items:${claves.join(",")}`); return { disponibilidad: {}, sinDisponibilidad: [] } as DisponibilidadObras; },
  };
  return { llamadas, deps };
}
const q = (s: string) => new URLSearchParams(s);

test("cliente ANTIGUO (sin filmografia=v2): recibe v1 y sólo se ejecuta v1", async () => {
  const { llamadas, deps } = dobles();
  const r = await responderFilmografia("137427", q("providers=n,d,m"), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, ["v1:137427:n,d,m"]);
  assert.deepEqual(Object.keys(r.body as object).sort(), ["hidden", "person", "titles"]);
});

test("cliente NUEVO (filmografia=v2): recibe v2 y sólo se ejecuta v2; las plataformas no participan", async () => {
  const { llamadas, deps } = dobles();
  const r = await responderFilmografia("137427", q("filmografia=v2&providers=m"), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, ["v2:137427"]);
  assert.equal(VERSION_FILMOGRAFIA, "v2");
});

test("'Ver más' (items) es de v2: sólo disponibilidad, sin persona ni créditos", async () => {
  const { llamadas, deps } = dobles();
  const r = await responderFilmografia("137427", q("filmografia=v2&items=movie:1,tv:2,movie:1"), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, ["items:movie:1,tv:2"], "deduplica y no llama a v1 ni v2");
});

test("items sin filmografia=v2 se rechaza sin trabajar", async () => {
  const { llamadas, deps } = dobles();
  const r = await responderFilmografia("137427", q("items=movie:1"), deps);
  assert.equal(r.status, 400);
  assert.deepEqual(llamadas, []);
});

test("límites de items: entre 1 y 24 claves tipo:id válidas", async () => {
  const { llamadas, deps } = dobles();
  const veinticinco = Array.from({ length: 25 }, (_, i) => `movie:${i + 1}`).join(",");
  for (const items of ["", veinticinco, "person:1", "movie:1,movie:abc"]) {
    const r = await responderFilmografia("1", q(`filmografia=v2&items=${items}`), deps);
    assert.equal(r.status, 400, items);
  }
  const veinticuatro = Array.from({ length: 24 }, (_, i) => `movie:${i + 1}`).join(",");
  assert.equal((await responderFilmografia("1", q(`filmografia=v2&items=${veinticuatro}`), deps)).status, 200);
  assert.equal(llamadas.length, 1, "sólo el pedido válido trabajó");
});

test("una versión desconocida o un id inválido se rechazan sin trabajar", async () => {
  const { llamadas, deps } = dobles();
  assert.equal((await responderFilmografia("1", q("filmografia=v3"), deps)).status, 400);
  assert.equal((await responderFilmografia("abc", q(""), deps)).status, 400);
  assert.equal((await responderFilmografia("-4", q("filmografia=v2"), deps)).status, 400);
  assert.deepEqual(llamadas, []);
});

test("un error del contrato se responde 500 (como siempre en esta ruta)", async () => {
  const { deps } = dobles();
  deps.v1 = async () => { throw new Error("TMDB 500"); };
  const r = await responderFilmografia("1", q(""), deps);
  assert.equal(r.status, 500);
  assert.match(String((r.body as { error: string }).error), /TMDB 500/);
});

test("la web y el AAB nuevo piden v2 explícitamente: las dos URLs del cliente llevan la versión", async () => {
  const { urlApertura, urlItems } = await import("./filmografia-cliente.ts");
  assert.match(urlApertura("1"), /[?&]filmografia=v2(&|$)/);
  assert.match(urlItems("1", ["movie:1"]), /[?&]filmografia=v2&items=movie:1$/);
  const { readFileSync } = await import("node:fs");
  const vista = readFileSync(new URL("../components/PersonView.tsx", import.meta.url), "utf8");
  assert.ok(vista.includes("crearControladorFilmografia("), "PersonView pide por el controlador (v2)");
});
