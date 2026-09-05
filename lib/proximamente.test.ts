// La selección editorial de Próximamente.
//
// Se prueba la función pura, sin red: los datos entran como `UIUpcoming[]`
// armados a mano, que es justamente por qué `lib/proximamente.ts` no toca
// Supabase ni TMDB.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esAnime, nivelEditorial, ordenCronologico, paginarProximamente,
  seleccionarProximamente, SERIES_POR_FECHA, TOPE_ANIME,
} from "./proximamente.ts";
import type { PlatformCode, UIUpcoming } from "./types.ts";

let siguienteId = 1;
function item(p: Partial<UIUpcoming> & { releaseDate: string }): UIUpcoming {
  return {
    id: p.id ?? siguienteId++,
    type: p.type ?? "tv",
    title: p.title ?? `t${p.id ?? siguienteId}`,
    poster: null, backdrop: null, overview: "",
    releaseDate: p.releaseDate,
    genres: p.genres ?? [],
    platforms: p.platforms ?? (["n"] as PlatformCode[]),
    popularity: p.popularity ?? 10,
    voteAverage: null,
    seasonNumber: p.seasonNumber ?? null,
    episodeNumber: p.episodeNumber ?? null,
    episodeName: null,
    isSeasonPremiere: p.isSeasonPremiere ?? false,
    originalLanguage: p.originalLanguage ?? "en",
  };
}
const serie = (d: string, pop: number, extra: Partial<UIUpcoming> = {}) =>
  item({ releaseDate: d, popularity: pop, type: "tv", ...extra });
const premiere = (d: string, pop: number, temporada = 2, extra: Partial<UIUpcoming> = {}) =>
  serie(d, pop, { isSeasonPremiere: true, seasonNumber: temporada, ...extra });
const pelicula = (d: string, pop = 5) => item({ releaseDate: d, popularity: pop, type: "movie" });
const anime = (d: string, pop: number, extra: Partial<UIUpcoming> = {}) =>
  serie(d, pop, { genres: ["animacion"], originalLanguage: "ja", ...extra });
const titulos = (l: UIUpcoming[]) => l.map((i) => i.title);

// ============================================================================
// Clasificación de anime
// ============================================================================

test("Crunchyroll es anime por sí solo, sin mirar género ni idioma", () => {
  assert.equal(esAnime(serie("2026-09-04", 10, { platforms: ["cr"] })), true);
});

test("Animación + idioma japonés es anime", () => {
  assert.equal(esAnime(serie("2026-09-04", 10, { genres: ["animacion"], originalLanguage: "ja" })), true);
});

test("ANIMACIÓN NO ES ANIME: los Simpson y South Park no cuentan", () => {
  // El caso real que motivó separar las dos cosas. Con género Animación a secas,
  // el tope del 20% habría estado sacando a los Simpson.
  const simpson = serie("2026-09-27", 242, { genres: ["animacion"], originalLanguage: "en" });
  const southPark = premiere("2026-09-16", 107, 29, { genres: ["animacion"], originalLanguage: "en" });
  assert.equal(esAnime(simpson), false);
  assert.equal(esAnime(southPark), false);
});

test("animación no japonesa tampoco: Masha y el Oso (ru), Super Wings (ko)", () => {
  assert.equal(esAnime(serie("2026-09-04", 20, { genres: ["animacion"], originalLanguage: "ru" })), false);
  assert.equal(esAnime(serie("2026-09-04", 20, { genres: ["animacion"], originalLanguage: "ko" })), false);
});

test("idioma japonés SIN género Animación no es anime (un dorama)", () => {
  assert.equal(esAnime(serie("2026-09-04", 20, { genres: ["drama"], originalLanguage: "ja" })), false);
});

test("sin originalLanguage sólo queda la señal de Crunchyroll, y no rompe", () => {
  // La ventana entre la migración y la primera corrida del sync.
  const sinIdioma = serie("2026-09-04", 20, { genres: ["animacion"], originalLanguage: null });
  assert.equal(esAnime(sinIdioma), false);
  assert.equal(esAnime(serie("2026-09-04", 20, { platforms: ["cr"], originalLanguage: null })), true);
});

// ============================================================================
// Prioridad editorial
// ============================================================================

test("los cuatro niveles editoriales", () => {
  assert.equal(nivelEditorial(pelicula("2026-09-30")), 1);
  assert.equal(nivelEditorial(premiere("2026-09-04", 10, 1)), 2);
  assert.equal(nivelEditorial(premiere("2026-09-04", 10, 5)), 3);
  assert.equal(nivelEditorial(serie("2026-09-04", 10)), 4);
});

// ============================================================================
// El cupo por fecha
// ============================================================================

test("una fecha nunca aporta más de 3 series", () => {
  const l = seleccionarProximamente(
    Array.from({ length: 12 }, (_, n) => serie("2026-09-04", 100 - n, { title: `s${n}` })),
  );
  assert.equal(l.length, SERIES_POR_FECHA);
});

test("sin premieres entran las TRES series más populares", () => {
  const l = seleccionarProximamente([
    serie("2026-09-04", 5, { title: "flojo" }),
    serie("2026-09-04", 90, { title: "alto" }),
    serie("2026-09-04", 50, { title: "medio" }),
    serie("2026-09-04", 70, { title: "casi" }),
  ]);
  assert.deepEqual(titulos(l), ["alto", "casi", "medio"]);
});

test("un lugar reservado para el premiere, aunque tenga popularidad baja", () => {
  // Reproduce el 07/09 real: 21 episodios, uno solo premiere con popularidad 3.
  const l = seleccionarProximamente([
    ...Array.from({ length: 20 }, (_, n) => serie("2026-09-07", 100 - n, { title: `epi${n}` })),
    premiere("2026-09-07", 3, 2, { title: "housewives" }),
  ]);
  assert.equal(l.length, 3);
  assert.ok(titulos(l).includes("housewives"), "el premiere flojo perdió su lugar reservado");
  assert.deepEqual(titulos(l).filter((t) => t !== "housewives"), ["epi0", "epi1"]);
});

test("una temporada 1 le gana el lugar reservado a una premiere más popular", () => {
  const l = seleccionarProximamente([
    premiere("2026-09-04", 300, 9, { title: "temporada9-popular" }),
    premiere("2026-09-04", 4, 1, { title: "serie-nueva" }),
    serie("2026-09-04", 200, { title: "epi-fuerte" }),
    serie("2026-09-04", 150, { title: "epi-medio" }),
  ]);
  assert.ok(titulos(l).includes("serie-nueva"), "la temporada 1 no ganó el lugar reservado");
  // El lugar reservado es UNO: los otros dos van por popularidad, y ahí la
  // premiere popular compite de igual a igual con los episodios.
  assert.deepEqual(titulos(l).sort(), ["epi-fuerte", "serie-nueva", "temporada9-popular"].sort());
});

test("SÓLO UN lugar se reserva: la 4ta premiere del día no entra", () => {
  // La regla que reemplazó a "3 episodios + premieres ilimitadas". Con el
  // 2026-10-07 real: cinco premieres de la franquicia Chicago.
  const l = seleccionarProximamente([
    premiere("2026-10-07", 137, 15, { title: "chicago-fire" }),
    premiere("2026-10-07", 122, 14, { title: "chicago-pd" }),
    premiere("2026-10-07", 87, 12, { title: "chicago-med" }),
    premiere("2026-10-07", 48, 6, { title: "abbott" }),
    premiere("2026-10-07", 4, 2, { title: "machos" }),
  ]);
  assert.equal(l.length, 3);
  assert.deepEqual(titulos(l), ["chicago-fire", "chicago-pd", "chicago-med"]);
});

test("un episodio popular le gana el lugar a una premiere menos popular", () => {
  // El 2026-10-04 real: Ranma1/2 (episodio, 70) entra y Marshals (premiere, 43) no.
  const l = seleccionarProximamente([
    premiere("2026-10-04", 65, 4, { title: "tracker" }),
    premiere("2026-10-04", 51, 20, { title: "heartland" }),
    premiere("2026-10-04", 43, 2, { title: "marshals" }),
    serie("2026-10-04", 70, { title: "ranma" }),
  ]);
  assert.deepEqual(titulos(l).sort(), ["heartland", "ranma", "tracker"].sort());
  assert.ok(!titulos(l).includes("marshals"));
});

test("un día con una sola serie floja la muestra: no hay piso de popularidad", () => {
  const l = seleccionarProximamente([serie("2026-11-30", 0.4, { title: "casi-nada" })]);
  assert.deepEqual(titulos(l), ["casi-nada"]);
});

// ============================================================================
// Las películas
// ============================================================================

test("las películas NO consumen el cupo de series", () => {
  const l = seleccionarProximamente([
    pelicula("2026-09-04", 1),
    pelicula("2026-09-04", 2),
    serie("2026-09-04", 90, { title: "s1" }),
    serie("2026-09-04", 80, { title: "s2" }),
    serie("2026-09-04", 70, { title: "s3" }),
    serie("2026-09-04", 60, { title: "s4" }),
  ]);
  assert.equal(l.filter((i) => i.type === "movie").length, 2, "se perdió una película");
  assert.equal(l.filter((i) => i.type === "tv").length, 3, "las series pasaron su cupo");
});

test("una película floja entra igual: el requisito es la plataforma, no la nota", () => {
  // El caso real: Libera nos, popularidad 0.60, la ÚNICA película de la agenda.
  const l = seleccionarProximamente([pelicula("2026-09-30", 0.6)]);
  assert.equal(l.length, 1);
});

// ============================================================================
// El tope de anime
// ============================================================================

test("el tope del 20% se cumple en CADA tanda acumulada, no sólo al final", () => {
  // 30 fechas con dos anime muy populares y una serie común cada una: si el tope
  // sólo se mirara al final, la primera página sería casi toda anime.
  const entrada: UIUpcoming[] = [];
  for (let d = 1; d <= 30; d++) {
    const f = `2026-10-${String(d).padStart(2, "0")}`;
    entrada.push(anime(f, 900, { title: `a${d}` }), anime(f, 800, { title: `b${d}` }),
      serie(f, 5, { title: `c${d}` }));
  }
  const l = seleccionarProximamente(entrada);
  for (let n = 1; n <= l.length; n++) {
    const prefijo = l.slice(0, n);
    const cuantos = prefijo.filter(esAnime).length;
    assert.ok(cuantos <= TOPE_ANIME * n,
      `el prefijo de ${n} tiene ${cuantos} anime = ${(cuantos * 100 / n).toFixed(1)}%`);
  }
});

test("ningún anime de baja popularidad entra: el cupo se reserva para los de arriba", () => {
  const entrada: UIUpcoming[] = [];
  for (let d = 1; d <= 10; d++) {
    const f = `2026-10-${String(d).padStart(2, "0")}`;
    // La popularidad del anime crece con la fecha: los mejores llegan al final.
    entrada.push(anime(f, d * 100, { title: `anime${d}` }), serie(f, 500, { title: `x${d}` }),
      serie(f, 400, { title: `y${d}` }));
  }
  const cuales = titulos(seleccionarProximamente(entrada)).filter((t) => t.startsWith("anime"));
  assert.ok(cuales.length > 0, "no entró ningún anime");
  // M = 20 no-anime, así que el cupo es floor(20 * 0.25) = 5: sólo anime6..anime10
  // son elegibles. Los cinco de abajo no tienen ninguna chance.
  for (const bajo of ["anime1", "anime2", "anime3", "anime4", "anime5"]) {
    assert.ok(!cuales.includes(bajo), `entró uno de baja popularidad: ${cuales.join(",")}`);
  }
});

/** El tope se cumple en TODO prefijo de la lista, no sólo al final. */
function topeEnTodoPrefijo(l: UIUpcoming[]): { ok: boolean; detalle: string } {
  for (let n = 1; n <= l.length; n++) {
    const a = l.slice(0, n).filter(esAnime).length;
    if (a > TOPE_ANIME * n) {
      return { ok: false, detalle: `prefijo ${n}: ${a} anime = ${(a * 100 / n).toFixed(1)}%` };
    }
  }
  return { ok: true, detalle: "" };
}

const esCronologico = (l: UIUpcoming[]) =>
  l.every((x, i) => i === 0 || l[i - 1].releaseDate <= x.releaseDate);

test("varios anime tempranos flojos NO le sacan el lugar a uno posterior más popular", () => {
  // 🔴 EL CASO QUE LA VERSIÓN ANTERIOR FALLABA. El cupo se elegía por popularidad
  // pero se gastaba en orden cronológico, así que los anime del medio lo
  // consumían y el del día 10 —el más popular de todos— quedaba afuera: entraban
  // anime6..anime9. Ahora entran anime7..anime10.
  const entrada: UIUpcoming[] = [];
  for (let d = 1; d <= 10; d++) {
    const f = `2026-10-${String(d).padStart(2, "0")}`;
    entrada.push(anime(f, d * 100, { title: `anime${d}` }), serie(f, 500, { title: `x${d}` }),
      serie(f, 400, { title: `y${d}` }));
  }
  const l = seleccionarProximamente(entrada);
  const cuales = titulos(l).filter((t) => t.startsWith("anime"));

  assert.ok(cuales.includes("anime10"),
    `quedó afuera el más popular; entraron ${cuales.join(",")}`);
  assert.ok(!cuales.includes("anime6"),
    `entró uno menos popular en lugar del mejor: ${cuales.join(",")}`);
  assert.deepEqual(cuales, ["anime7", "anime8", "anime9", "anime10"]);

  // Y el intercambio no rompió ninguna de las otras dos garantías.
  const t = topeEnTodoPrefijo(l);
  assert.ok(t.ok, `se violó el tope acumulado — ${t.detalle}`);
  assert.ok(esCronologico(l), "el orden final dejó de ser cronológico");
  // Mismo tamaño que antes: es un intercambio, no un aflojamiento del tope.
  assert.equal(cuales.length, 4);
});

test("el intercambio elige el conjunto de MÁXIMA popularidad, no sólo uno mejor", () => {
  // Cuatro anime tempranos de popularidad baja y uno final altísimo, con el tope
  // tan justo que sólo cabe UNO. Tiene que ser el mejor.
  const entrada: UIUpcoming[] = [];
  for (let d = 1; d <= 5; d++) {
    const f = `2026-11-${String(d).padStart(2, "0")}`;
    entrada.push(serie(f, 500, { title: `x${d}` }));
    entrada.push(anime(f, d === 5 ? 900 : d * 10, { title: `anime${d}` }));
  }
  const l = seleccionarProximamente(entrada);
  const cuales = titulos(l).filter((t) => t.startsWith("anime"));
  assert.deepEqual(cuales, ["anime5"], "no eligió el único anime que convenía");
  assert.ok(topeEnTodoPrefijo(l).ok);
  assert.ok(esCronologico(l));
});

test("con el tope holgado entran TODOS los anime, no sólo los mejores", () => {
  // La otra dirección: el intercambio no puede volverse un recorte. Con mucho
  // material no-anime delante, los dos anime del final caben los dos.
  const entrada: UIUpcoming[] = [];
  for (let d = 1; d <= 20; d++) {
    const f = `2026-11-${String(d).padStart(2, "0")}`;
    entrada.push(serie(f, 500, { title: `x${d}` }), serie(f, 400, { title: `y${d}` }));
  }
  entrada.push(anime("2026-11-21", 10, { title: "flojo" }));
  entrada.push(anime("2026-11-22", 900, { title: "popular" }));
  const cuales = titulos(seleccionarProximamente(entrada)).filter(
    (t) => t === "flojo" || t === "popular");
  assert.deepEqual(cuales, ["flojo", "popular"]);
});

test("el tope entero y TOPE_ANIME no pueden divergir", () => {
  // `TOPE_ANIME` es el número documentado; la decisión se toma con la fracción
  // 1/5 para no depender de coma flotante. Si alguien cambia uno y no el otro,
  // esto falla.
  assert.equal(TOPE_ANIME, 1 / 5);
});

test("sin material fuera de anime la lista queda CORTA, no se rellena con anime", () => {
  const entrada = Array.from({ length: 10 }, (_, d) =>
    anime(`2026-10-${String(d + 1).padStart(2, "0")}`, 100, { title: `a${d}` }));
  const l = seleccionarProximamente(entrada);
  // Con 0 títulos no-anime el cupo es 0: la lista queda vacía antes que violar
  // el tope en silencio.
  assert.equal(l.filter(esAnime).length, 0);
  assert.equal(l.length, 0);
});

test("un anime rechazado NO reaparece más adelante", () => {
  const entrada: UIUpcoming[] = [];
  for (let d = 1; d <= 20; d++) {
    const f = `2026-10-${String(d).padStart(2, "0")}`;
    entrada.push(anime(f, 100, { title: `a${d}` }), serie(f, 50, { title: `s${d}` }));
  }
  const l = seleccionarProximamente(entrada);
  assert.equal(new Set(l.map((i) => `${i.type}:${i.id}`)).size, l.length, "hay repetidos");
});

// ============================================================================
// Orden, determinismo y dedup
// ============================================================================

test("el orden final es cronológico", () => {
  const l = seleccionarProximamente([
    serie("2026-11-01", 10, { title: "c" }), serie("2026-09-04", 10, { title: "a" }),
    serie("2026-10-01", 10, { title: "b" }),
  ]);
  assert.deepEqual(titulos(l), ["a", "b", "c"]);
});

test("dentro de un día ordena por popularidad, no por nivel editorial", () => {
  // El premiere flojo del 07/09 no puede abrir el día por delante de WWE Raw.
  const l = seleccionarProximamente([
    premiere("2026-09-07", 3, 2, { title: "housewives" }),
    serie("2026-09-07", 107, { title: "wwe-raw" }),
  ]);
  assert.deepEqual(titulos(l), ["wwe-raw", "housewives"]);
});

test("la película va primero en su día", () => {
  const l = seleccionarProximamente([
    serie("2026-09-30", 400, { title: "serie-popular" }),
    pelicula("2026-09-30", 1),
  ]);
  assert.equal(l[0].type, "movie");
});

test("es determinística: la misma entrada en otro orden da la MISMA salida", () => {
  const base: UIUpcoming[] = [];
  for (let d = 1; d <= 12; d++) {
    const f = `2026-10-${String(d).padStart(2, "0")}`;
    base.push(serie(f, 50 + d, { title: `s${d}` }), premiere(f, 20 + d, 3, { title: `p${d}` }),
      anime(f, 90 + d, { title: `a${d}` }), pelicula(f, d));
  }
  const a = seleccionarProximamente(base);
  const b = seleccionarProximamente([...base].reverse());
  const c = seleccionarProximamente([...base].sort((x, y) => x.title.localeCompare(y.title)));
  assert.deepEqual(titulos(a), titulos(b));
  assert.deepEqual(titulos(a), titulos(c));
});

test("empate de popularidad: desempata el id, así el orden es TOTAL", () => {
  const l = seleccionarProximamente([
    item({ releaseDate: "2026-09-04", popularity: 50, id: 900, title: "id-alto" }),
    item({ releaseDate: "2026-09-04", popularity: 50, id: 100, title: "id-bajo" }),
  ]);
  assert.deepEqual(titulos(l), ["id-bajo", "id-alto"]);
});

test("deduplica por tipo:id y no gasta dos lugares en el mismo título", () => {
  const repetido = serie("2026-09-04", 90, { id: 77, title: "uno" });
  const l = seleccionarProximamente([
    repetido, { ...repetido }, { ...repetido },
    serie("2026-09-04", 80, { title: "dos" }), serie("2026-09-04", 70, { title: "tres" }),
    serie("2026-09-04", 60, { title: "cuatro" }),
  ]);
  assert.deepEqual(titulos(l), ["uno", "dos", "tres"]);
});

test("un movie y un tv con el MISMO id no se pisan", () => {
  const l = seleccionarProximamente([
    item({ releaseDate: "2026-09-04", id: 42, type: "movie", title: "peli" }),
    item({ releaseDate: "2026-09-04", id: 42, type: "tv", title: "serie" }),
  ]);
  assert.equal(l.length, 2);
});

test("ordenCronologico se exporta y sirve para ordenar a mano", () => {
  const l = [serie("2026-10-01", 10, { title: "b" }), serie("2026-09-01", 10, { title: "a" })];
  assert.deepEqual(titulos([...l].sort(ordenCronologico)), ["a", "b"]);
});

// ============================================================================
// Paginación 20 + 20
// ============================================================================

const largo = (n: number) => Array.from({ length: n }, (_, i) =>
  serie(`2026-10-${String((i % 28) + 1).padStart(2, "0")}`, 100, { title: `t${i}` }));

test("20 + 20 sin repetidos y sin saltos", () => {
  const sel = largo(50);
  const p1 = paginarProximamente(sel, 1, 20);
  const p2 = paginarProximamente(sel, 2, 20);
  const p3 = paginarProximamente(sel, 3, 20);
  assert.equal(p1.items.length, 20);
  assert.equal(p2.items.length, 20);
  assert.equal(p3.items.length, 10);
  const juntas = [...p1.items, ...p2.items, ...p3.items];
  assert.equal(juntas.length, 50);
  assert.equal(new Set(juntas.map((i) => `${i.type}:${i.id}`)).size, 50, "hay repetidos entre páginas");
  assert.deepEqual(titulos(juntas), titulos(sel), "el orden se rompió al paginar");
});

test("hayMas sale del largo de la selección, no de si la página vino llena", () => {
  const sel = largo(40);
  assert.equal(paginarProximamente(sel, 1, 20).hayMas, true);
  assert.equal(paginarProximamente(sel, 2, 20).hayMas, false, "dijo que había más y no hay");
  // Exactamente un múltiplo: la página 2 llena y NO hay una 3ra vacía.
  assert.equal(paginarProximamente(sel, 2, 20).items.length, 20);
});

test("una selección más corta que una página no promete más", () => {
  const r = paginarProximamente(largo(7), 1, 20);
  assert.equal(r.items.length, 7);
  assert.equal(r.hayMas, false);
  assert.equal(r.total, 7);
});

test("total es el largo de la selección en toda página", () => {
  const sel = largo(50);
  for (const p of [1, 2, 3]) assert.equal(paginarProximamente(sel, p, 20).total, 50);
});

test("una página más allá del final viene vacía y sin prometer nada", () => {
  const r = paginarProximamente(largo(30), 9, 20);
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
});

test("páginas inválidas caen en la 1 en vez de romper", () => {
  const sel = largo(30);
  for (const p of [0, -3, NaN, 0.5]) {
    assert.deepEqual(titulos(paginarProximamente(sel, p, 20).items),
      titulos(paginarProximamente(sel, 1, 20).items), `pagina=${p}`);
  }
});

// ============================================================================
// La lista vacía
// ============================================================================

test("sin entrada devuelve una lista vacía, no explota", () => {
  assert.deepEqual(seleccionarProximamente([]), []);
  const r = paginarProximamente([], 1, 20);
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
  assert.equal(r.total, 0);
});
