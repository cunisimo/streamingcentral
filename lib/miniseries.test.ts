import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINISERIES_KEY, MINISERIES_LISTA_HREF, MINISERIES_LISTA_KEY, MINISERIES_LISTA_TAM,
  MINISERIES_OBJETIVO, MINISERIES_PISO, MINISERIES_PISO_VOTOS, MINISERIES_TITULO,
  alcanzaElPiso, consultaListaMiniseries, consultaMiniseries, rielMiniseriesActivo, soloMiniseries,
} from "./miniseries.ts";
import type { MediaType, PlatformCode, UITitle } from "./types.ts";

const card = (
  id: number, type: MediaType, platforms: PlatformCode[], title = `t${id}`,
): UITitle => ({
  id, type, title, year: 2020, runtime: null, poster: null, country: null,
  genres: [], platforms, tmdb: 7.5, hasEditorial: false,
});

// --- Título exacto -----------------------------------------------------------

test("el título visible es exactamente el pedido", () => {
  // Se compara contra el literal y no contra una constante derivada: el punto
  // del test es que nadie lo "mejore" con un emoji o un cambio de mayúsculas
  // sin que salte. Los otros rieles del Home llevan emoji al frente y la
  // tentación de emparejarlos es real.
  assert.equal(MINISERIES_TITULO, "Miniseries para ansiosos");
});

test("el objetivo del riel es 20 tarjetas y el piso 15", () => {
  assert.equal(MINISERIES_OBJETIVO, 20);
  assert.equal(MINISERIES_PISO, 15);
  assert.ok(MINISERIES_PISO < MINISERIES_OBJETIVO, "el piso tiene que dejar margen");
});

// --- Consulta ----------------------------------------------------------------

test("la consulta pide miniseries finalizadas y nada más que series", () => {
  const q = consultaMiniseries();
  assert.equal(q.extra.with_type, "2", "with_type=2 ES la condición de miniserie");
  assert.equal(q.extra.with_status, "3", "marcada finalizada por TMDB");
  assert.equal(q.tipo, "tv", "solo series: no lleva toggle Películas/Series");
});

test("la consulta excluye documental y deja animación/infantil a la regla de audiencia", () => {
  const q = consultaMiniseries();
  assert.deepEqual(q.sinGeneros, [99], "documental fuera por decisión de producto");
  // Animación (16) e infantil (10751, 10762) NO se listan acá a propósito: los
  // aporta `excludedGenres` con `scope: "home"`, que trae la excepción de
  // Crunchyroll. Listarlos acá la rompería — a quien elige Crunchyroll no se le
  // filtra animación en ninguna superficie.
  assert.ok(!q.sinGeneros.includes(16), "la animación la decide la regla de audiencia");
  assert.equal(q.scope, "home", "sin scope, `excludedGenres` no excluye nada");
  assert.equal(q.genre, MINISERIES_KEY, "hace falta un slug para que el scope aplique");
});

test("la consulta es una copia: mutarla no contamina la siguiente", () => {
  // `consultaMiniseries` la consume el composer en cada request. Si devolviera
  // las constantes por referencia, un llamador que le agrega un parámetro se lo
  // agregaría a TODOS los requests siguientes del mismo proceso — y en Vercel
  // conviven varios requests en la misma instancia.
  const a = consultaMiniseries();
  a.extra.with_type = "4";
  a.sinGeneros.push(16);
  a.minVotesPorEje.pop = 999;
  const b = consultaMiniseries();
  assert.equal(b.extra.with_type, "2");
  assert.deepEqual(b.sinGeneros, [99]);
  assert.equal(b.minVotesPorEje.pop, 0);
});

// --- Piso de votos -----------------------------------------------------------

test("el piso de votos está declarado para los cinco ejes, no heredado", () => {
  // El `minVotes` de una superficie no llega nunca: `recetaDeEje` arma
  // {...base, ...paramsEje} y el del eje gana. Este riel lo declara explícito.
  // El tipo es Record<Eje, number> (no Partial), así que sumar un eje rompe la
  // compilación; esto verifica además los valores medidos.
  assert.deepEqual(MINISERIES_PISO_VOTOS, { pop: 0, top: 10, nuevo: 0, taquilla: 0, hondo: 0 });
});

test("solo `top` lleva piso, y porque ordena POR la nota", () => {
  // No es un piso de calidad: es que `vote_average.desc` sin un mínimo de votos
  // pone primero un 10.0 con un voto. En los otros cuatro ejes el orden no
  // depende de la nota, así que no hay nada que proteger y el piso solo dejaría
  // afuera cine regional (medido: 23 títulos LatAm contra 34).
  const conPiso = Object.entries(MINISERIES_PISO_VOTOS).filter(([, v]) => v > 0);
  assert.deepEqual(conPiso, [["top", 10]]);
});

// --- Piso para mostrarse -----------------------------------------------------

test("el riel se oculta debajo de 15 y se muestra desde 15", () => {
  assert.equal(alcanzaElPiso(14), false);
  assert.equal(alcanzaElPiso(15), true);
  assert.equal(alcanzaElPiso(20), true);
  assert.equal(alcanzaElPiso(0), false, "vacío nunca se muestra");
});

// --- Kill switch -------------------------------------------------------------

test("el kill switch apaga el riel solo con RIEL_MINISERIES=0", () => {
  assert.equal(rielMiniseriesActivo("0"), false);
  assert.equal(rielMiniseriesActivo(undefined), true, "por defecto, encendido");
  assert.equal(rielMiniseriesActivo("1"), true);
  // "false" NO lo apaga, y es a propósito: el resto de los interruptores de la
  // app (POOL_CACHE, EJES_RIELES) usan el mismo criterio y tener dos formas de
  // apagar cosas es cómo se apaga la equivocada.
  assert.equal(rielMiniseriesActivo("false"), true);
});

// --- "Ver todas" -------------------------------------------------------------

test("el enlace del riel apunta a la ruta que la página registra", () => {
  // Los dos salen de la misma constante; el test es contra el literal para que
  // mover la ruta sea una decisión y no un typo que deja un 404 en el Home.
  assert.equal(MINISERIES_LISTA_HREF, "/lista/miniseries");
  assert.equal(MINISERIES_LISTA_HREF, `/lista/${MINISERIES_LISTA_KEY}`);
});

test("la lista comparte con el riel qué es una miniserie elegible", () => {
  // Si divergen, "Ver todas" mostraría cosas que el riel nunca mostraría. Por eso
  // `consultaListaMiniseries` deriva de `consultaMiniseries` en vez de repetir.
  const riel = consultaMiniseries();
  const lista = consultaListaMiniseries();
  assert.deepEqual(lista.extra, riel.extra, "with_type / with_status idénticos");
  assert.deepEqual(lista.sinGeneros, riel.sinGeneros, "mismas exclusiones de género");
  assert.equal(lista.tipo, "tv");
  assert.equal(lista.scope, riel.scope, "la excepción de Crunchyroll vale igual en las dos");
});

test("la lista NO rota: orden fijo por popularidad y minVotes 0 explícito", () => {
  const lista = consultaListaMiniseries();
  assert.equal(lista.sortBy, "popularity.desc", "exploración estable, sin ejes");
  // Explícito y no omitido: `discover()` mete 60 por defecto (`o.minVotes ?? 60`),
  // que es el piso que deja afuera el catálogo regional. Un 0 omitido sería un 60.
  assert.equal(lista.minVotes, 0);
  assert.ok(!("minVotesPorEje" in lista), "la lista no tiene ejes que puedan pisarlo");
});

test("la página de la lista es la página de TMDB", () => {
  // 20 no es una elección de diseño: es el tamaño de página de TMDB. Con otro
  // número habría que recortar o juntar páginas, que es justo lo que abre la
  // puerta a los salteos entre páginas.
  assert.equal(MINISERIES_LISTA_TAM, 20);
});

// --- Guard final -------------------------------------------------------------

test("no deja pasar ninguna película", () => {
  const r = soloMiniseries([
    card(1, "tv", ["n"]),
    card(2, "movie", ["n"]),
    card(3, "tv", ["d"]),
  ], ["n", "d"]);
  assert.deepEqual(r.map((t) => t.id), [1, 3]);
});

test("no deja pasar títulos fuera de las plataformas elegidas", () => {
  const r = soloMiniseries([
    card(1, "tv", ["n"]),
    card(2, "tv", ["p"]),      // Prime, que el usuario no eligió
    card(3, "tv", []),         // sin plataforma en AR
    card(4, "tv", ["p", "d"]), // está en una que sí eligió
  ], ["n", "d"]);
  assert.deepEqual(r.map((t) => t.id), [1, 4]);
});

test("no deja duplicados dentro del riel", () => {
  const r = soloMiniseries([
    card(7, "tv", ["n"]),
    card(7, "tv", ["n"]),
    card(8, "tv", ["n"]),
  ], ["n"]);
  assert.deepEqual(r.map((t) => t.id), [7, 8]);
});

test("un id repetido entre movie y tv NO es un duplicado", () => {
  // Los ids de TMDB son por tipo: la película 550 y la serie 550 no tienen nada
  // que ver. El dedup del Home usa `tipo:id` justamente por esto, y el guard
  // tiene que usar la misma clave o descartaría un título legítimo.
  const r = soloMiniseries([card(550, "movie", ["n"]), card(550, "tv", ["n"])], ["n"]);
  assert.deepEqual(r.map((t) => t.type), ["tv"]);
});

test("lo descartado se avisa, no se filtra en silencio", () => {
  const motivos: string[] = [];
  soloMiniseries([card(1, "movie", ["n"]), card(2, "tv", ["p"])], ["n"], (m) => motivos.push(m));
  assert.equal(motivos.length, 2);
  assert.match(motivos[0], /no es serie/);
  assert.match(motivos[1], /plataformas/);
});

test("sin plataformas elegidas no pasa nada", () => {
  assert.deepEqual(soloMiniseries([card(1, "tv", ["n"])], []), []);
});
