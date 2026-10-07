// Reglas editoriales de exclusión de "No sé qué ver" (decisión del dueño, 2026-10-07).
// Son PERMANENTES: valen para los seleccionados, la reserva y toda ampliación futura.
//
// 1. Sin ANIME, aunque el usuario tenga Crunchyroll. Criterio del proyecto
//    (lib/proximamente.ts → esAnime): está en Crunchyroll, o tiene género
//    Animación y original_language "ja". La animación occidental NO es anime.
// 2. Sin stand-up ni especiales no narrativos (conciertos, making-of, entrevistas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  esAnime, esStandUp, motivoNoServible, llenarObjetivo, FIN_DE_DATOS, construirCola, OBJETIVO_500,
} from "./seleccion.mjs";
import { aplicarExclusiones } from "./exclusiones.mjs";

const base = (extra = {}) => ({
  tmdb_id: 1, title: "X", overview: "Una historia.", genres: ["Drama"], year: 2015, runtime: 85,
  original_language: "en", providers: ["Netflix"], providers_flatrate: ["Netflix"], ...extra,
});

test("anime: Crunchyroll en cualquier modalidad, o Animación + japonés", () => {
  assert.equal(esAnime(base({ providers: ["Crunchyroll"], providers_flatrate: [] })), true, "Crunchyroll aunque sea gratis/ads");
  assert.equal(esAnime(base({ providers_flatrate: ["Crunchyroll Amazon Channel"] })), true);
  assert.equal(esAnime(base({ genres: ["Animación", "Acción"], original_language: "ja" })), true);
  assert.equal(esAnime(base({ genres: ["Animacion"], original_language: "ja" })), true, "sin tilde también");
});

test("NO es anime: animación occidental, South Park, Pixar, live action japonés", () => {
  assert.equal(esAnime(base({ genres: ["Animación", "Comedia"], original_language: "en", title: "South Park" })), false);
  assert.equal(esAnime(base({ genres: ["Animación", "Familia"], original_language: "en", title: "Toy Story" })), false);
  assert.equal(esAnime(base({ genres: ["Animación"], original_language: "fr" })), false);
  assert.equal(esAnime(base({ genres: ["Drama"], original_language: "ja", title: "Tokyo Story" })), false, "cine japonés no animado");
});

test("un título anime nunca es servible, aunque tenga Netflix y todos los datos", () => {
  assert.equal(motivoNoServible(base({ genres: ["Animación"], original_language: "ja" })), "anime");
  assert.equal(motivoNoServible(base({ providers: ["Netflix", "Crunchyroll"] })), "anime");
  assert.equal(motivoNoServible(base()), null);
});

test("stand-up se detecta por la sinopsis; una ficción sobre humoristas no", () => {
  assert.equal(esStandUp(base({ genres: ["Comedia"], runtime: 64, overview: "Ricky Gervais vuelve con un especial de comedia sobre la humanidad." })), true);
  assert.equal(esStandUp(base({ genres: ["Comedia"], runtime: 75, overview: "Captura la gira de stand-up de 2012." })), true);
  assert.equal(esStandUp(base({ genres: ["Comedia"], runtime: 70, overview: "El nuevo especial de uno de los mejores monologuistas." })), true);
  assert.equal(esStandUp(base({ genres: ["Comedia"], runtime: 75, overview: "Dos humoristas condenados al éxito más estruendoso." })), false);
  assert.equal(esStandUp(base({ genres: ["Drama"], runtime: 120, overview: "Un comediante de stand-up enfrenta su pasado." })), false, "drama largo sobre un comediante");
  assert.equal(motivoNoServible(base({ genres: ["Comedia"], runtime: 64, overview: "Un especial de comedia en el Palladium." })), "stand-up");
});

test("la lista editorial excluye por id (especiales no narrativos) con su motivo", () => {
  const excluidos = new Map([[7, { motivo: "especial-no-narrativo" }]]);
  assert.equal(motivoNoServible(base({ tmdb_id: 7 }), { excluidos }), "especial-no-narrativo");
  assert.equal(motivoNoServible(base({ tmdb_id: 8 }), { excluidos }), null);
});

test("el recorrido de la cola descarta anime y el último recurso nunca lo promueve desde la reserva", async () => {
  const cuotas = { total: 3, cortaMin: 3, decadas: { "<1980": 0, "1980s": 0, "1990s": 0, "2000s": 0, "2010s": 1, "2020s": 0 } };
  const fichas = {
    1: base({ tmdb_id: 1, year: 2015, runtime: 80 }),
    2: base({ tmdb_id: 2, year: 2016, runtime: 80, genres: ["Animación"], original_language: "ja" }), // anime
    3: base({ tmdb_id: 3, year: 2017, runtime: 80 }),                                                // reserva por cupo
  };
  const cola = [1, 2, 3, 4].map((id, i) => ({ pos: i + 1, id, prevista: "2010s", cortaProbable: true }));
  const r = await llenarObjetivo(cola, cuotas, async (c) => fichas[c.id] ?? FIN_DE_DATOS);
  assert.ok(r.descartes.some((d) => d.id === 2 && d.motivo === "anime"));
  assert.ok(!r.aceptados.some((t) => t.tmdb_id === 2));
  assert.ok(!r.reserva.some((t) => t.tmdb_id === 2));
  // Y una reserva heredada que contenga anime (clasificada antes de la regla) tampoco se promueve.
  const r2 = await llenarObjetivo([], { total: 2, cortaMin: 2, decadas: { "2010s": 0 } }, async () => FIN_DE_DATOS, {
    reservaInicial: [{ ...fichas[2], _pos: 1 }, { ...fichas[3], _pos: 2 }],
  });
  assert.deepEqual(r2.completadosDesdeReserva.map((t) => t.tmdb_id), [3]);
});

test("la cola no vuelve a ofrecer títulos ya conocidos como anime o excluidos", () => {
  const inv = { candidatos: {
    10: { fams: ["principal"], wp: "2010-2019", wc: null, vc: 400, va: 7 },
    11: { fams: ["principal"], wp: "2010-2019", wc: null, vc: 500, va: 7 },
    12: { fams: ["principal"], wp: "2010-2019", wc: null, vc: 600, va: 7 },
  } };
  const estado = { titulos: {}, reserva: {}, descartados: { 10: { motivo: "anime", at: "2026-10-07T00:00:00Z" } }, excluidos_editoriales: { 11: { motivo: "stand-up" } } };
  const ids = construirCola(inv, estado, OBJETIVO_500, { ahoraMs: Date.parse("2026-10-08T00:00:00Z"), ttlDescartesDias: 0 }).map((c) => c.id);
  assert.deepEqual(ids, [12], "el anime no se reintenta aunque su descarte 'venza'; el excluido editorial tampoco");
});

test("aplicarExclusiones saca anime/stand-up/excluidos de los NUEVOS y de la reserva, y nunca toca los ya cargados", () => {
  const estado = {
    titulos: {
      1: base({ tmdb_id: 1 }),                                                   // ya cargado (no está en carga_pendiente)
      2: base({ tmdb_id: 2, genres: ["Animación"], original_language: "ja" }), // ya cargado y anime: NO se toca acá
      3: base({ tmdb_id: 3 }),                                                   // nuevo, se queda
      4: base({ tmdb_id: 4, providers: ["Crunchyroll"] }),                       // nuevo anime
      5: base({ tmdb_id: 5, genres: ["Comedia"], runtime: 70, overview: "Un especial de comedia stand-up." }), // nuevo stand-up
      6: base({ tmdb_id: 6 }),                                                   // nuevo, lista editorial
    },
    reserva: { 7: base({ tmdb_id: 7, genres: ["Animación"], original_language: "ja" }), 8: base({ tmdb_id: 8 }) },
    descartados: {},
    carga_pendiente: { nuevos: [3, 4, 5, 6], disponibilidad: [3, 4, 5, 6], desde: "x" },
  };
  const excluidos = new Map([[6, { motivo: "especial-no-narrativo" }]]);
  const { estado: e, resumen } = aplicarExclusiones(estado, { excluidos, ahoraIso: "2026-10-07T23:00:00Z" });
  assert.deepEqual(Object.keys(e.titulos).map(Number).sort(), [1, 2, 3]);
  assert.deepEqual(e.carga_pendiente.nuevos, [3]);
  assert.deepEqual(e.carga_pendiente.disponibilidad, [3]);
  assert.deepEqual(Object.keys(e.reserva).map(Number), [8]);
  assert.equal(e.excluidos_editoriales[4].motivo, "anime");
  assert.equal(e.excluidos_editoriales[5].motivo, "stand-up");
  assert.equal(e.excluidos_editoriales[6].motivo, "especial-no-narrativo");
  assert.equal(e.excluidos_editoriales[7].motivo, "anime");
  assert.ok(e.excluidos_editoriales[4].titulo, "conserva los datos para auditar");
  assert.deepEqual(resumen.yaCargadosQueSonAnime, [2], "se informan, no se tocan");
  assert.equal(estado.titulos[4].tmdb_id, 4, "no muta la entrada");
});

test("la lista editorial versionada existe, tiene motivo para cada id y excluye Baki y los stand-up", () => {
  const lista = JSON.parse(readFileSync(new URL("../../data/ruleta-exclusiones.json", import.meta.url), "utf8"));
  for (const [id, x] of Object.entries(lista.excluidos)) {
    assert.ok(["anime", "stand-up", "especial-no-narrativo"].includes(x.motivo), `${id}: ${x.motivo}`);
    assert.ok(x.titulo, id);
  }
  assert.equal(lista.excluidos[1263421]?.motivo, "anime", "Baki Hanma vs. Kengan Ashura");
  assert.equal(lista.excluidos[1015606]?.motivo, "especial-no-narrativo", "Obi-Wan Kenobi: El retorno del Jedi");
});

test("un título promovido desde la reserva sale de la reserva al incorporarse", async () => {
  const { fusionar } = await import("./pipeline.mjs");
  const t = base({ tmdb_id: 9 });
  const estado = { titulos: {}, reserva: { 9: t }, descartados: {}, sagas: {} };
  const { estado: e } = fusionar(estado, { candidatos: new Map(), nuevos: [{ ...t, _existente: false }], reservaNueva: [], descartados: {}, disp: {}, sagasNuevas: {}, ahoraIso: "x", cfg: { ttlDispDias: 30 } });
  assert.ok(e.titulos[9]);
  assert.equal(e.reserva[9], undefined);
});
