// Terror fuera del riel Drama (películas). Regla del dueño, 2026-11-14.
//
// EL CASO: It: Capítulo 2 (movie/474350) salía en el riel Drama del Home.
// Causa confirmada: TMDB la etiqueta con Terror (27), Suspenso (53) y Drama (18)
// —la ficha de producción devuelve `genres: ["terror","suspenso","drama"]`— y la
// receta del riel Drama era `with_genres=18` a secas, sin exclusión. Entraba por
// la CONSULTA PRINCIPAL (la ventana de 3 páginas del eje del día), no por un
// relleno ni por un caché viejo. La misma consulta alimentaba «Ver todas».
//
// `lib/home.ts` y `lib/enrich.ts` son `server-only` y no se importan en node:
// la lógica pura se prueba directo y el cableado se fija sobre el fuente, como
// en lib/etapa3a-cableado.test.ts y lib/disponibilidad-barrido.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  EXCLUSIONES_RIEL, admiteEnRiel, cruceExcluido, excluidosDelRiel, filtrarRiel, resolveCategory,
} from "./categories.ts";
import { pideRielCategoria } from "./discover-params.ts";

const raiz = path.resolve(import.meta.dirname, "..");
/** El código sin comentarios: la prosa explica las reglas y no las infringe. */
const codigo = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const TERROR = 27, DRAMA = 18, SUSPENSO = 53;
// Crudos de discover con la forma que usa el riel (sólo lo que importa acá).
const IT_2 = { id: 474350, title: "IT: Capítulo 2", genre_ids: [TERROR, SUSPENSO, DRAMA] };
const DRAMA_Y_TERROR = { id: 1, title: "Drama y terror", genre_ids: [DRAMA, TERROR] };
const SOLO_DRAMA = { id: 2, title: "Sólo drama", genre_ids: [DRAMA] };
const DRAMA_Y_SUSPENSO = { id: 3, title: "Drama y suspenso", genre_ids: [DRAMA, SUSPENSO] };

// --- 1. It: Capítulo 2 ---------------------------------------------------------

test("It: Capítulo 2 queda fuera del riel Drama de películas", () => {
  assert.equal(admiteEnRiel("drama", "movie", IT_2.genre_ids), false);
  assert.deepEqual(filtrarRiel("drama", "movie", [IT_2]), []);
  // La receta del riel la saca también del lado de TMDB (`without_genres`).
  assert.deepEqual(excluidosDelRiel("drama", "movie"), [TERROR]);
});

test("It: Capítulo 2 sigue siendo elegible para el riel Terror", () => {
  assert.deepEqual(resolveCategory("terror", "movie").genres, [TERROR]);
  assert.deepEqual(excluidosDelRiel("terror", "movie"), []);
  assert.equal(admiteEnRiel("terror", "movie", IT_2.genre_ids), true);
  assert.deepEqual(filtrarRiel("terror", "movie", [IT_2]), [IT_2]);
});

// --- 2. Drama + Terror, por cualquier vía ---------------------------------------

test("una película Drama + Terror no vuelve por ningún relleno del riel", () => {
  // Ventana, página extra y cualquier tanda pasan por el mismo filtro: aunque el
  // relleno llegara armado con otra receta (un pool cacheado sin la exclusión),
  // no se reincorpora.
  const ventana = [SOLO_DRAMA, DRAMA_Y_TERROR];
  const paginaExtra = [IT_2, DRAMA_Y_SUSPENSO];
  const riel = [...filtrarRiel("drama", "movie", ventana), ...filtrarRiel("drama", "movie", paginaExtra)];
  assert.deepEqual(riel.map((r) => r.id), [SOLO_DRAMA.id, DRAMA_Y_SUSPENSO.id]);
});

test("un crudo sin genre_ids no se descarta por la exclusión (no hay dato para decidir)", () => {
  assert.equal(admiteEnRiel("drama", "movie", undefined), true);
});

test("«Ver todas» de Drama no muestra el cruce Drama × Terror (quedaría vacío)", () => {
  assert.equal(cruceExcluido("drama", "terror", "movie"), true);
  // El resto de los cruces de Drama sigue.
  for (const otro of ["comedia", "suspenso", "crimen", "romance", "accion"]) {
    assert.equal(cruceExcluido("drama", otro, "movie"), false, otro);
  }
});

// --- 3. Drama sin Terror sigue apareciendo ---------------------------------------

test("una película de Drama sin Terror sigue en el riel", () => {
  assert.equal(admiteEnRiel("drama", "movie", SOLO_DRAMA.genre_ids), true);
  assert.equal(admiteEnRiel("drama", "movie", DRAMA_Y_SUSPENSO.genre_ids), true);
  assert.deepEqual(filtrarRiel("drama", "movie", [SOLO_DRAMA, DRAMA_Y_SUSPENSO]), [SOLO_DRAMA, DRAMA_Y_SUSPENSO]);
});

// --- Alcance: series y otros rieles no cambian -----------------------------------

test("el alcance es SÓLO Drama de películas", () => {
  assert.deepEqual(Object.keys(EXCLUSIONES_RIEL), ["drama"]);
  assert.deepEqual(Object.keys(EXCLUSIONES_RIEL.drama), ["movie"]);
  assert.deepEqual(excluidosDelRiel("drama", "tv"), []);
  assert.equal(admiteEnRiel("drama", "tv", [DRAMA, TERROR]), true);
  assert.equal(cruceExcluido("drama", "terror", "tv"), false);
  // "Terror para llorar" (terror × drama) no se toca: la exclusión es del
  // género PRINCIPAL, no del segundo.
  assert.equal(cruceExcluido("terror", "drama", "movie"), false);
  for (const g of ["accion", "scifi", "terror", "comedia", "documental"]) {
    assert.deepEqual(excluidosDelRiel(g, "movie"), [], g);
    assert.deepEqual(excluidosDelRiel(g, "tv"), [], g);
  }
  // La regla de categoría de Drama queda igual: el chip "Drama intenso" del hero
  // y las portadas de género la siguen usando tal cual.
  assert.deepEqual(resolveCategory("drama", "movie"), { genres: [DRAMA] });
});

// --- Cableado (fuente) ------------------------------------------------------------

test("Home: la ventana del riel Y la página extra llevan la misma exclusión y el filtro", () => {
  const src = codigo("lib/home.ts");
  // Ventana (etapa 1): sinGeneros desde las exclusiones del riel.
  assert.match(src, /candidatosDeSuperficie\(\{\s*tipo, genre: g,[\s\S]*?sinGeneros: excluidosDelRiel\(g, tipo\)/);
  // genreRail: página extra con la MISMA receta y filtrada; ventana filtrada.
  const m = /function genreRail\([\s\S]*?\n}\n/.exec(src);
  assert.ok(m, "no se encontró genreRail");
  assert.match(m![0], /const sinRiel = excluidosDelRiel\(genre, tipo\);/);
  assert.match(m![0], /filtrarRiel\(genre, tipo,\s*await categoryCandidates\(\{[\s\S]*?sinGeneros: sinRiel/);
  assert.match(m![0], /armarRiel\([\s\S]*?filtrarRiel\(genre, tipo, candidatos\)/);
});

test("Home: subir VERSION_HOME invalida los payloads y últimos buenos que traían It 2", () => {
  assert.match(codigo("lib/claves.ts"), /export const VERSION_HOME: number =[\s\S]*?: 8;/);
});

test("«Ver todas»: /categoria pide riel=1 en todos sus rieles y la ruta lo aplica", () => {
  const vista = codigo("components/CategoryView.tsx");
  assert.match(vista, /`\/api\/discover\?tipo=\$\{tipo\}&genre=\$\{slug\}&riel=1`/, "Populares sin riel=1");
  assert.match(vista, /`\/api\/discover\?tipo=\$\{tipo\}&genre=\$\{slug\}&genre2=\$\{c\.slug\}&riel=1`/, "cruces sin riel=1");
  assert.match(vista, /cruceExcluido\(slug, c\.slug, tipo\)/);
  assert.match(codigo("app/api/discover/route.ts"), /rielCategoria: pideRielCategoria\(sp\),/);
});

// --- Android publicado (AAB vc3, vc4, vc5): las URLs EXACTAS de su bundle ------
// Copiadas de base/assets/public/_next/static/chunks de cada .aab, con valores.
const P = "providers=n,d,m";
const pide = (q: string) => pideRielCategoria(new URLSearchParams(q));

test("AAB publicado: «Ver todas» de Drama (riel y cruces) se reconoce sin riel=1", () => {
  assert.equal(pide(`tipo=movie&genre=drama&${P}`), true, "Populares en Drama");
  assert.equal(pide(`tipo=movie&genre=drama&${P}&country=ar`), true, "Populares con país");
  assert.equal(pide(`tipo=movie&genre=drama&genre2=comedia&${P}`), true, "Drama con risas");
});

test("AAB publicado: el buscador por género NO se toca (siempre manda page)", () => {
  assert.equal(pide(`tipo=movie&genre=drama&page=1&${P}`), false);
  assert.equal(pide(`tipo=movie&genre=drama&page=3&${P}&country=ar&age=13&decade=1990`), false);
  assert.equal(pide(`tipo=movie&country=ar&${P}`), false, "exploración por país");
});

test("web nueva: riel=1 es explícito", () => {
  assert.equal(pide(`tipo=movie&genre=drama&riel=1&${P}`), true);
  assert.equal(pide(`tipo=movie&genre=drama&genre2=terror&riel=1&${P}`), true);
});

test("cruces intencionales: «Terror para llorar» y series quedan igual aunque se reconozca «Ver todas»", () => {
  // El reconocimiento sólo dice «esto es Ver todas»; qué se excluye lo decide
  // el género PRINCIPAL y el tipo.
  assert.equal(pide(`tipo=movie&genre=terror&genre2=drama&${P}`), true);
  assert.deepEqual(excluidosDelRiel("terror", "movie"), []);
  assert.equal(pide(`tipo=tv&genre=drama&${P}`), true);
  assert.deepEqual(excluidosDelRiel("drama", "tv"), []);
});

test("«Ver todas»: listByCategory excluye en la consulta (toda página) y filtra los crudos", () => {
  const src = codigo("lib/enrich.ts");
  const m = /export async function listByCategory\([\s\S]*?\n}\n/.exec(src);
  assert.ok(m, "no se encontró listByCategory");
  const f = m![0];
  assert.match(f, /const sinRiel = opts\.rielCategoria \? excluidosDelRiel\(opts\.genre, opts\.tipo\) : \[\];/);
  // Consulta principal y alternativa: cada página de TMDB ya viene sin Terror.
  assert.match(f, /withoutGenres: sinTodo\(\[\.\.\.\(rule\.withoutGenres \?\? \[\]\), \.\.\.\(rule2\.withoutGenres \?\? \[\]\), \.\.\.sinRiel\]\)/);
  assert.match(f, /withoutGenres: sinTodo\(\[\.\.\.\(rule\.alt\.withoutGenres \?\? \[\]\), \.\.\.sinRiel\]\)/);
  // Red de seguridad sobre los genre_ids que ya trajo el listado.
  assert.match(f, /if \(opts\.rielCategoria\) crudos = filtrarRiel\(opts\.genre, opts\.tipo, crudos\);/);
});

test("ninguna vía agrega consultas individuales a TMDB para decidir el género", () => {
  // El filtro trabaja sobre `genre_ids`, que ya trae discover y conservan los
  // pools (lib/pools.ts los guarda en cada candidato).
  assert.match(codigo("lib/pools.ts"), /genre_ids: t\.genre_ids,/);
  const cat = codigo("lib/categories.ts");
  assert.doesNotMatch(cat, /import[^;]*tmdb/);
});
