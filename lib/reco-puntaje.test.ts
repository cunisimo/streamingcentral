import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coincidencia, componentes, esAnime, mejorRespaldo, ordenarGlobalConTope,
  ordenarTurnosPonderados, permiteAnime, puntaje,
  type Candidato, type Respaldo,
} from "./reco-puntaje.ts";

const resp = (o: Partial<Respaldo> = {}): Respaldo => ({
  origenId: 1, origenTipo: "movie", origenTitulo: "Origen",
  fuerza: 2, camino: "cruce", tema: 0.5, pos: 5, ...o,
});
const cand = (id: number, o: Partial<Candidato> = {}): Candidato => ({
  tipo: "tv", id, generos: [], idioma: "en", apoyos: 1, respaldo: resp(), ...o,
});

// --- anime -------------------------------------------------------------------

test("anime = animación (16) + idioma japonés", () => {
  assert.equal(esAnime({ generos: [16, 10759], idioma: "ja" }), true);
  assert.equal(esAnime({ generos: [16], idioma: "en" }), false, "animación en inglés no es anime");
  assert.equal(esAnime({ generos: [18], idioma: "ja" }), false, "un drama japonés no es anime");
});

test("BLEACH es anime con los datos que ya vienen del crudo", () => {
  // El caso reportado. genre_ids y original_language son los reales de TMDB.
  assert.equal(esAnime({ generos: [10759, 16, 10765], idioma: "ja" }), true);
});

test("sin ningún origen anime, no se habilita", () => {
  const origenes = [
    { generos: [28, 878], idioma: "en" },   // Matrix
    { generos: [18], idioma: "ko" },        // Parásitos
  ];
  assert.equal(permiteAnime(origenes), false);
});

test("con UN origen anime alcanza para habilitarlo", () => {
  const origenes = [
    { generos: [28, 878], idioma: "en" },
    { generos: [16, 10759], idioma: "ja" },  // Attack on Titan
  ];
  assert.equal(permiteAnime(origenes), true);
});

test("sin orígenes no se habilita", () => {
  assert.equal(permiteAnime([]), false);
});

// --- REGRESIÓN: Bleach desde Matrix -----------------------------------------

test("REGRESIÓN Bleach: el tema NO lo baja, y por eso hace falta el guard", () => {
  // Matrix es acción(28) + scifi(878); mapeados a televisión son 10759 y 10765.
  // Bleach tiene los DOS. Coincidencia total: el puntaje temático lo SUBE.
  // Fue mi error de diagnóstico y quedó como test para no repetirlo.
  const generosEsperadosTv = [10759, 10765];
  const bleach = [10759, 16, 10765];
  assert.equal(coincidencia(bleach, generosEsperadosTv), 1, "coincidencia 2/2");

  const c = cand(30984, {
    generos: bleach, idioma: "ja",
    respaldo: resp({ fuerza: 3, camino: "cruce", tema: 1, pos: 1, origenTitulo: "Matrix" }),
  });
  const flojo = cand(999, { respaldo: resp({ fuerza: 1, tema: 0.2, pos: 15 }) });
  assert.ok(puntaje(c) > puntaje(flojo), "puntúa ALTO: el orden solo no lo saca");

  // Lo que lo saca es el guard, y solo el guard.
  const sinAnime = [{ generos: [28, 878], idioma: "en" }];
  assert.equal(permiteAnime(sinAnime), false);
  assert.equal(esAnime(c), true);
});

// --- coincidencia temática ---------------------------------------------------

test("coincidencia es qué proporción de lo esperado cumple el candidato", () => {
  assert.equal(coincidencia([28, 878], [28, 878]), 1);
  assert.equal(coincidencia([28], [28, 878]), 0.5);
  assert.equal(coincidencia([35], [28, 878]), 0);
});

test("sin géneros esperados la coincidencia es 0, no 1", () => {
  // Un origen sin géneros no "coincide con todo": no aporta evidencia.
  assert.equal(coincidencia([28], []), 0);
});

// --- puntaje -----------------------------------------------------------------

test("más fuerte gana a igual todo lo demás", () => {
  const a = cand(1, { respaldo: resp({ fuerza: 3 }) });
  const b = cand(2, { respaldo: resp({ fuerza: 1 }) });
  assert.ok(puntaje(a) > puntaje(b));
});

test("más apoyos gana a igual todo lo demás", () => {
  assert.ok(puntaje(cand(1, { apoyos: 3 })) > puntaje(cand(2, { apoyos: 1 })));
});

test("mejor coincidencia temática gana a igual todo lo demás", () => {
  const a = cand(1, { respaldo: resp({ tema: 1 }) });
  const b = cand(2, { respaldo: resp({ tema: 0 }) });
  assert.ok(puntaje(a) > puntaje(b));
});

test("mejor posición de TMDB gana a igual todo lo demás", () => {
  const a = cand(1, { respaldo: resp({ pos: 1 }) });
  const b = cand(2, { respaldo: resp({ pos: 20 }) });
  assert.ok(puntaje(a) > puntaje(b));
});

test("una coincidencia débil no empata con una fuerte", () => {
  // El pedido explícito: hoy, con `b.apoyos - a.apoyos`, estos dos empataban y
  // el orden lo decidía quién llegó primero.
  const fuerte = cand(1, { apoyos: 2, respaldo: resp({ fuerza: 3, tema: 1, pos: 2 }) });
  const debil = cand(2, { apoyos: 1, respaldo: resp({ fuerza: 1, tema: 0.1, pos: 18 }) });
  assert.ok(puntaje(fuerte) > puntaje(debil) + 1, "la diferencia tiene que ser grande, no marginal");
});

test("`camino` no suma nada mientras su peso sea 0", () => {
  // No se premia una hipótesis sobre cómo funciona /recommendations: TMDB no lo
  // documenta. El componente existe, con peso 0 hasta que una medición lo pida.
  const mismo = cand(1, { respaldo: resp({ camino: "mismo" }) });
  const cruce = cand(2, { respaldo: resp({ camino: "cruce" }) });
  assert.equal(puntaje(mismo), puntaje(cruce));
  assert.equal(componentes(mismo).camino, 1, "pero el componente se sigue calculando y se ve en el log");
});

test("el cuarto apoyo ya no suma", () => {
  assert.equal(puntaje(cand(1, { apoyos: 3 })), puntaje(cand(2, { apoyos: 9 })));
});

// --- de qué origen se queda ---------------------------------------------------

test("gana el respaldo más FUERTE, no el que llegó primero", () => {
  const primero = resp({ origenId: 1, fuerza: 1, tema: 1 });
  const despues = resp({ origenId: 2, fuerza: 3, tema: 0.2 });
  assert.equal(mejorRespaldo(primero, despues).origenId, 2);
});

test("a igual fuerza gana el más coherente", () => {
  const a = resp({ origenId: 1, fuerza: 2, tema: 0.2 });
  const b = resp({ origenId: 2, fuerza: 2, tema: 0.9 });
  assert.equal(mejorRespaldo(a, b).origenId, 2);
});

test("a igual fuerza y tema, gana el camino del mismo tipo", () => {
  const a = resp({ origenId: 1, fuerza: 2, tema: 0.5, camino: "cruce" });
  const b = resp({ origenId: 2, fuerza: 2, tema: 0.5, camino: "mismo" });
  assert.equal(mejorRespaldo(a, b).origenId, 2);
});

test("el desempate final es estable, no depende del orden de llegada", () => {
  const a = resp({ origenId: 7 });
  const b = resp({ origenId: 3 });
  assert.equal(mejorRespaldo(a, b).origenId, mejorRespaldo(b, a).origenId);
});

// --- orden -------------------------------------------------------------------

const conOrigen = (id: number, origenId: number, fuerza: number, tema = 0.5) =>
  cand(id, { respaldo: resp({ origenId, origenTipo: "movie", fuerza, tema }) });

test("el orden global respeta el tope por origen", () => {
  const items = [
    ...[1, 2, 3, 4, 5].map((i) => conOrigen(i, 100, 3, 1)),   // un origen muy productivo
    conOrigen(6, 200, 1, 0.1),
  ];
  const r = ordenarGlobalConTope(items, (c) => c, 2);
  const primeros = r.slice(0, 3).map((c) => c.respaldo.origenId);
  assert.equal(primeros.filter((o) => o === 100).length, 2, "el origen fuerte aporta 2 y cede");
  assert.ok(primeros.includes(200), "el otro origen entra aunque puntúe menos");
});

test("los que pasan el tope NO se tiran, van después", () => {
  const items = [1, 2, 3, 4, 5].map((i) => conOrigen(i, 100, 3));
  const r = ordenarGlobalConTope(items, (c) => c, 2);
  assert.equal(r.length, 5, "con un solo origen productivo, el riel no se puede quedar vacío");
});

test("los turnos ponderados le dan MÁS lugar a la señal más fuerte", () => {
  // El problema que resuelve: con un turno idéntico por origen, la fuerza 3/2/1
  // no cambiaba nada una vez elegidos los seis.
  const items = [
    ...[1, 2, 3].map((i) => conOrigen(i, 100, 3)),    // Petacular
    ...[4, 5, 6].map((i) => conOrigen(i, 200, 1)),    // Mi lista
  ];
  const r = ordenarTurnosPonderados(items, (c) => c);
  const primeros4 = r.slice(0, 4).map((c) => c.respaldo.origenId);
  assert.equal(primeros4.filter((o) => o === 100).length, 3, "el Petacular entra 3 veces por vuelta");
  assert.equal(primeros4.filter((o) => o === 200).length, 1);
});

test("los turnos ponderados NO pierden variedad: todos los orígenes aparecen", () => {
  const items = [
    ...[1, 2, 3, 4, 5].map((i) => conOrigen(i, 100, 3)),
    conOrigen(6, 200, 1),
    conOrigen(7, 300, 1),
  ];
  const r = ordenarTurnosPonderados(items, (c) => c);
  assert.deepEqual(
    new Set(r.slice(0, 5).map((c) => c.respaldo.origenId)),
    new Set([100, 200, 300]),
    "en la primera vuelta ya aparecen los tres orígenes",
  );
});

test("dentro de un mismo origen ordena por puntaje", () => {
  const items = [
    cand(1, { respaldo: resp({ origenId: 100, fuerza: 2, tema: 0.1, pos: 20 }) }),
    cand(2, { respaldo: resp({ origenId: 100, fuerza: 2, tema: 1, pos: 1 }) }),
  ];
  assert.equal(ordenarTurnosPonderados(items, (c) => c)[0].id, 2);
});

test("el orden es estable: la misma entrada en otro orden da el mismo resultado", () => {
  // Los candidatos llegan en el orden en que resuelven los Promise.all, que
  // cambia entre corridas. Sin desempate estable, dos armados del mismo día
  // darían rieles distintos.
  const items = [
    conOrigen(1, 100, 3, 0.5), conOrigen(2, 200, 3, 0.5), conOrigen(3, 300, 3, 0.5),
  ];
  const a = ordenarGlobalConTope(items, (c) => c, 5).map((c) => c.id);
  const b = ordenarGlobalConTope([...items].reverse(), (c) => c, 5).map((c) => c.id);
  assert.deepEqual(a, b);
});

test("con lista vacía no rompe", () => {
  assert.deepEqual(ordenarTurnosPonderados([], (c: Candidato) => c), []);
  assert.deepEqual(ordenarGlobalConTope([], (c: Candidato) => c, 3), []);
});
