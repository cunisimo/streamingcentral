// Etapa 1 de capacidad, primera mitad: CANONIZAR las entradas del Home (#18).
//
// ============================================================================
// EL PROBLEMA, MEDIDO
// ============================================================================
// `/api/home` tomaba `providers` y `t` crudos, y la clave sólo ordenaba. Con
// `claveHome` real: 19 entradas, 17 distintas, 14 claves. Duplicados (`n,n`),
// mayúsculas (`N,D,M`), códigos inexistentes (`zzz`), claves de riel
// arbitrarias y —lo que la Etapa 0 vio con el instrumento nuevo, B4d— el
// toggle por defecto escrito (`t=accion:movie`) y el implícito eran dos claves
// y dos composiciones del mismo Home.
//
// 🔴 EL ERROR QUE NO HAY QUE REPETIR. La primera versión del plan pedía que
// `N,D,M` convergiera a `n`: le borraba Disney+ y Max al usuario. Canonizar no
// es descartar. El orden es: minúsculas → filtrar contra el catálogo →
// deduplicar → ordenar → tope. Bajar a minúsculas ANTES de filtrar es lo que
// conserva las tres.
//
// Escrito ANTES del módulo: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonizarProviders, canonizarTipos, tiposDesdeParam, claveDeTipos, MAX_PLATAFORMAS,
} from "./canonizar-home.ts";
import { PLATFORMS } from "./providers-ar.ts";
import { TOGGLE_KEYS } from "../hooks/home-types-nucleo.ts";

// ===========================================================================
// providers: los casos obligatorios del criterio de cierre del #18
// ===========================================================================

test("🔴 orden y vacíos convergen: n,d,m / d,m,n / n,,d,m → d,m,n", () => {
  for (const raw of ["n,d,m", "d,m,n", "n,,d,m", ["n", "d", "m"], ["d", "m", "n"]]) {
    assert.deepEqual(canonizarProviders(raw), ["d", "m", "n"], JSON.stringify(raw));
  }
});

test("🔴 MAYÚSCULAS: N,D,M y N,d,M → d,m,n, conservando las TRES plataformas", () => {
  assert.deepEqual(canonizarProviders("N,D,M"), ["d", "m", "n"]);
  assert.deepEqual(canonizarProviders("N,d,M"), ["d", "m", "n"]);
  assert.deepEqual(canonizarProviders("  N , D ,M "), ["d", "m", "n"], "espacios alrededor");
});

test("🔴 duplicados: n,n y n,n,n → n", () => {
  assert.deepEqual(canonizarProviders("n,n"), ["n"]);
  assert.deepEqual(canonizarProviders("n,n,n"), ["n"]);
  assert.deepEqual(canonizarProviders("N,n"), ["n"], "duplicado con mayúscula");
});

test("🔴 n,zzz → n: se descarta el desconocido y se conserva el válido", () => {
  assert.deepEqual(canonizarProviders("n,zzz"), ["n"]);
  assert.deepEqual(canonizarProviders("zzz,n,inventado"), ["n"]);
});

test("🔴 zzz y ___ → sin plataformas", () => {
  assert.deepEqual(canonizarProviders("zzz"), []);
  assert.deepEqual(canonizarProviders("___"), []);
  assert.deepEqual(canonizarProviders(""), []);
  assert.deepEqual(canonizarProviders(null), []);
  assert.deepEqual(canonizarProviders(",,,"), []);
});

test("🔴 CONTROL: n / n,d / d,m son TRES conjuntos distintos y conservan su contenido", () => {
  const a = canonizarProviders("n"), b = canonizarProviders("n,d"), c = canonizarProviders("d,m");
  assert.deepEqual(a, ["n"]);
  assert.deepEqual(b, ["d", "n"]);
  assert.deepEqual(c, ["d", "m"]);
  assert.notDeepEqual(a, b); assert.notDeepEqual(b, c); assert.notDeepEqual(a, c);
});

test("el catálogo entero pasa entero: ningún código válido se pierde por canonizar", () => {
  const todos = PLATFORMS.map((p) => p.code);
  const out = canonizarProviders(todos.join(","));
  assert.deepEqual(out, [...todos].sort());
  assert.equal(out.length, PLATFORMS.length);
});

test("🔴 el tope es el tamaño del catálogo: después de filtrar y deduplicar no puede haber más, y se aplica igual", () => {
  // El tope no es un número inventado: es la única cantidad que puede quedar
  // después de filtrar contra el catálogo y deduplicar. Se aplica de todos
  // modos para que la longitud de la clave esté acotada POR CONSTRUCCIÓN.
  assert.equal(MAX_PLATAFORMAS, PLATFORMS.length);
  const muchos = Array.from({ length: 500 }, (_, i) => PLATFORMS[i % PLATFORMS.length].code).join(",");
  assert.equal(canonizarProviders(muchos).length, PLATFORMS.length);
});

test("es idempotente: canonizar lo canonizado no cambia nada", () => {
  const una = canonizarProviders("N,zzz,n,,D");
  assert.deepEqual(canonizarProviders(una), una);
});

// ===========================================================================
// t: sólo rieles conocidos, sólo tipos válidos, una forma canónica única
// ===========================================================================

test("🔴 `t` ausente y `t=accion:movie` (el default de accion) son LA MISMA forma canónica", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam(null)), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:movie")), {});
  assert.equal(claveDeTipos(tiposDesdeParam("accion:movie")), claveDeTipos(tiposDesdeParam(null)));
  assert.equal(claveDeTipos(tiposDesdeParam(null)), "");
});

test("🔴 lo que el cliente manda hoy (las 7 claves, todas en default) es la MISMA clave que sin `t`", () => {
  // `paramDeTipos` emite siempre todas las claves de TOGGLE_KEYS; el Home
  // inicial de todo el mundo lleva los defaults escritos.
  const todoDefault = "accion:movie,comedia:movie,documental:tv,drama:tv,scifi:tv,terror:movie,ultimos:movie";
  assert.equal(claveDeTipos(tiposDesdeParam(todoDefault)), "");
});

test("🔴 un toggle NO default sí cambia la clave, y sólo él aparece", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:tv")), { accion: "tv" });
  assert.equal(claveDeTipos(tiposDesdeParam("accion:tv")), "accion:tv");
  assert.equal(claveDeTipos(tiposDesdeParam("accion:tv,comedia:movie")), "accion:tv", "comedia:movie es default");
});

test("🔴 claves de riel desconocidas NO multiplican entradas", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam("inventado:movie")), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam("a:movie,b:tv,c:movie")), {});
  assert.deepEqual(canonizarTipos({ inventado: "tv", accion: "tv" } as never), { accion: "tv" });
});

test("🔴 tipos inválidos se descartan", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:pelis")), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:")), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion")), {});
  assert.deepEqual(canonizarTipos({ accion: "TV" } as never), {}, "el tipo se compara exacto: no se adivina");
});

test("🔴 duplicados en `t`: política determinista, la ÚLTIMA ocurrencia gana", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:tv,accion:movie")), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:movie,accion:tv")), { accion: "tv" });
});

// ---------------------------------------------------------------------------
// `t` REPETIDO en la query (auditoría de Codex sobre 325e085): la ruta usaba
// `searchParams.get("t")`, que devuelve la PRIMERA aparición, así que
// `?t=accion:movie&t=accion:tv` terminaba en `movie` y contradecía la política
// escrita. La última ocurrencia tiene que ganar también ENTRE parámetros.
// Escritos antes del cambio: fallaban contra 325e085.
// ---------------------------------------------------------------------------

test("🔴 `?t=accion:movie&t=accion:tv` → accion:tv (la última ocurrencia gana entre parámetros repetidos)", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam(["accion:movie", "accion:tv"])), { accion: "tv" });
});

test("🔴 el orden inverso → default movie: accion desaparece de la forma mínima", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam(["accion:tv", "accion:movie"])), {});
  assert.equal(claveDeTipos(tiposDesdeParam(["accion:tv", "accion:movie"])), "");
});

test("🔴 duplicados dentro de un mismo valor y entre parámetros: siempre la última", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam(["accion:tv,accion:movie", "terror:tv,terror:movie,terror:tv"])), { terror: "tv" });
  assert.deepEqual(canonizarTipos(tiposDesdeParam(["accion:movie,accion:tv", "accion:tv,accion:movie"])), {});
});

test("🔴 valores desconocidos o inválidos entre parámetros repetidos no generan claves", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam(["inventado:tv", "accion:pelis", "x:y", ""])), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam(["accion:tv", "inventado:movie"])), { accion: "tv" });
});

test("🔴 con parámetros repetidos, como máximo una entrada por clave de TOGGLE_KEYS", () => {
  const muchos = Array.from({ length: 300 }, (_, i) => `${TOGGLE_KEYS[i % TOGGLE_KEYS.length]}:${i % 3 ? "tv" : "movie"},x${i}:tv`);
  const out = canonizarTipos(tiposDesdeParam(muchos));
  assert.ok(Object.keys(out).length <= TOGGLE_KEYS.length);
  for (const k of Object.keys(out)) assert.ok(TOGGLE_KEYS.includes(k), k);
});

test("un solo string sigue valiendo (es lo que manda el cliente), y sin `t` no hay nada", () => {
  assert.deepEqual(canonizarTipos(tiposDesdeParam("accion:tv")), { accion: "tv" });
  assert.deepEqual(canonizarTipos(tiposDesdeParam([])), {});
  assert.deepEqual(canonizarTipos(tiposDesdeParam(null)), {});
});

test("🔴 no hay crecimiento ilimitado: como máximo una entrada por clave de TOGGLE_KEYS", () => {
  const raw = Array.from({ length: 1000 }, (_, i) => `${i % 2 ? "accion" : `x${i}`}:tv`).join(",");
  const out = canonizarTipos(tiposDesdeParam(raw));
  assert.ok(Object.keys(out).length <= TOGGLE_KEYS.length);
  assert.deepEqual(out, { accion: "tv" });
});

test("los rieles de filtro (mas-votados, hacete-cargo) NO entran en la clave: el cliente nunca los manda", () => {
  assert.deepEqual(canonizarTipos({ "mas-votados": "tv" } as never), {});
});

test("la clave de tipos ordena por nombre de riel: el orden de llegada no importa", () => {
  assert.equal(claveDeTipos(tiposDesdeParam("terror:tv,accion:tv")), claveDeTipos(tiposDesdeParam("accion:tv,terror:tv")));
  assert.equal(claveDeTipos(tiposDesdeParam("terror:tv,accion:tv")), "accion:tv,terror:tv");
});

// ===========================================================================
// QUE PRODUCCIÓN ENTRE POR ACÁ
// ===========================================================================

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const home = sinComentarios("lib/home.ts");
const ruta = sinComentarios("app/api/home/route.ts");

test("🔴 homePayload canoniza providers y tipos, y la lista canonizada va al CONTENIDO y a la CLAVE", () => {
  assert.match(home, /canonizarProviders\(opts\.providers\)/, "homePayload no canoniza providers");
  assert.match(home, /canonizarTipos\(opts\.types/, "homePayload no canoniza los tipos");
  // La clave se arma con lo canonizado, no con lo crudo.
  assert.match(home, /const key = homeKey\(providers, types\)/, "la clave no se arma con la lista canonizada");
  // Y composeHome recibe lo mismo.
  assert.match(home, /composeHome\(\{ providers, types \}\)/, "composeHome no recibe la lista canonizada");
  assert.doesNotMatch(home, /composeHome\(\{ providers: opts\.providers/, "composeHome sigue recibiendo lo crudo");
});

test("🔴 la clave usa claveDeTipos (forma mínima) y no serializa el objeto a mano", () => {
  assert.match(home, /claveDeTipos\(types\)/, "homeKey no usa la forma canónica de los tipos");
  assert.doesNotMatch(home, /Object\.keys\(types\)\.sort\(\)\.map/, "homeKey sigue serializando a mano");
});

test("🔴 la ruta usa TODOS los parámetros `t` (getAll), no sólo el primero, y ya no tiene su propio parseTypes", () => {
  assert.match(ruta, /tiposDesdeParam\(sp\.getAll\("t"\)\)/, "la ruta sigue con get(\"t\"): un `t` repetido pierde la última ocurrencia");
  assert.doesNotMatch(ruta, /sp\.get\("t"\)/);
  assert.doesNotMatch(ruta, /function parseTypes/);
});
