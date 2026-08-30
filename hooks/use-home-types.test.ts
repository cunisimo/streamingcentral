// El selector de los rieles del Home, probado por COMPORTAMIENTO.
//
// 🔴 EL BUG QUE ESTE ARCHIVO EXISTE PARA IMPEDIR. "Últimos lanzamientos" estrenó
// su selector en `lib/home.ts` y en `Shelf`, pero `TOGGLE_KEYS` seguía siendo
// `HOME_GENRES`: `ultimos` no se leía, no se persistía y NO ENTRABA EN `param`.
// El botón cambiaba de estado en pantalla y `/api/home` seguía recibiendo el
// mismo `t`, así que el Home nunca se rearmaba en Series. Los tests que había
// eran estructurales —miraban el riel en `lib/home.ts`— y no podían verlo.
//
// Por eso acá se prueba la CADENA COMPLETA: qué se lee, qué se guarda y, sobre
// todo, **qué parámetro sale hacia `/api/home`**, que es lo único que decide si
// el Home se reconstruye.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_GENRES, defaultTypeFor } from "../components/data.ts";
import {
  TOGGLE_KEYS, DEFAULTS_TOGGLE, paramDeTipos, tipoDe, tiposIniciales,
} from "./home-types-nucleo.ts";
import type { MediaType } from "../lib/types";

// ============================================================================
// El inventario de claves
// ============================================================================

test("`ultimos` es una clave de refetch", () => {
  assert.ok(TOGGLE_KEYS.includes("ultimos"),
    "sin esto el selector no viaja en `t` y el Home no se rearma");
});

test("están los seis géneros y `ultimos`, sin sobras", () => {
  assert.deepEqual([...TOGGLE_KEYS].sort(), [...HOME_GENRES, "ultimos"].sort());
  // Los rieles de votos usan typeToggle "filter": se resuelven en el cliente
  // sobre la lista mixta y NO tienen que entrar acá.
  assert.equal(TOGGLE_KEYS.includes("mas-votados"), false);
  assert.equal(TOGGLE_KEYS.includes("hacete-cargo"), false);
});

// ============================================================================
// El default: Películas, y explícito
// ============================================================================

test("el default de `ultimos` es Películas", () => {
  assert.equal(tipoDe("ultimos", {}), "movie");
});

test("el default es EXPLÍCITO, no heredado de defaultTypeFor", () => {
  // `defaultTypeFor` alterna movie/tv por posición de género. Si `ultimos`
  // dependiera de eso, el default podría salir "tv" y el Home inicial cambiaría
  // para todo el mundo — que es justo lo que no se quiere.
  assert.equal(DEFAULTS_TOGGLE["ultimos"], "movie");
  const heredado = defaultTypeFor("ultimos");
  if (heredado !== "movie") {
    assert.notEqual(tipoDe("ultimos", {}), heredado,
      "el default se está heredando de defaultTypeFor y da tv");
  }
});

test("los géneros conservan su default alternado", () => {
  for (const g of HOME_GENRES) {
    assert.equal(tipoDe(g, {}), defaultTypeFor(g), `cambió el default de ${g}`);
  }
});

// ============================================================================
// El parámetro que sale hacia /api/home — lo que decide si el Home se rearma
// ============================================================================

function paramDe(store: Record<string, MediaType>): string {
  return paramDeTipos(tiposIniciales(store));
}

test("arranca en Películas: `ultimos:movie` viaja en el parámetro", () => {
  const p = paramDe({});
  assert.match(p, /(^|,)ultimos:movie(,|$)/, `el parámetro no lleva ultimos: ${p}`);
});

test("elegir Series CAMBIA el parámetro que se manda al Home", () => {
  const antes = paramDe({});
  const despues = paramDe({ ultimos: "tv" });
  assert.notEqual(despues, antes, "el parámetro no cambió: el Home no se rearmaría");
  assert.match(despues, /(^|,)ultimos:tv(,|$)/);
});

test("volver a Películas vuelve a cambiar el pedido", () => {
  const enSeries = paramDe({ ultimos: "tv" });
  const devuelta = paramDe({ ultimos: "movie" });
  assert.notEqual(devuelta, enSeries);
  assert.equal(devuelta, paramDe({}), "volver al default tiene que dar el parámetro inicial");
});

test("cambiar `ultimos` no toca el tipo de ningún género", () => {
  const base = tiposIniciales({});
  const conTv = tiposIniciales({ ultimos: "tv" });
  for (const g of HOME_GENRES) assert.equal(conTv[g], base[g], `se movió ${g}`);
});

test("el parámetro tiene una entrada por clave, sin duplicados", () => {
  const partes = paramDe({ ultimos: "tv" }).split(",");
  const claves = partes.map((p) => p.split(":")[0]);
  assert.equal(new Set(claves).size, claves.length, "hay claves repetidas en `t`");
  assert.equal(claves.length, TOGGLE_KEYS.length);
});

// ============================================================================
// Persistencia y restauración
// ============================================================================

test("la preferencia guardada se restaura", () => {
  const store = { ultimos: "tv" as MediaType };
  assert.equal(tipoDe("ultimos", store), "tv");
  assert.match(paramDe(store), /(^|,)ultimos:tv(,|$)/);
});

test("un valor basura en el almacenamiento cae al default, no rompe", () => {
  const store = { ultimos: "peliculas" } as unknown as Record<string, MediaType>;
  assert.equal(tipoDe("ultimos", store), "movie");
});

test("una clave ajena guardada no se cuela en el parámetro", () => {
  // `useShelfType` comparte la MISMA clave de localStorage, así que el objeto
  // puede traer rieles que no son de refetch.
  const store = { ultimos: "tv", "mas-votados": "tv" } as Record<string, MediaType>;
  assert.doesNotMatch(paramDe(store), /mas-votados/);
});
