// Las señales del fallback y la fusión por campo.
//
// Los casos NO son inventados: salen de las mediciones de
// docs/medidas/2026-08-23-idioma-*.json, corridas contra TMDB real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_ACTIVO, HUELLA_EN_CLAVES, IDIOMA_BASE, IDIOMA_FALLBACK,
  fusionarPorCampo, necesitaReparacion,
} from "./idioma.ts";

// Un crudo de discover con lo mínimo que miran las señales.
const crudo = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 1, title: "Un título", overview: "Una sinopsis.",
  original_title: "A Title", original_language: "en", ...o,
} as Parameters<typeof necesitaReparacion>[0]);

// --- Configuración por default ----------------------------------------------

test("el idioma base por default es es-ES: la tanda 1 no cambia el idioma", () => {
  // Si esto falla es porque alguien puso IDIOMA_TITULOS en el entorno de tests,
  // o cambió el default. Las dos cosas son un cambio de comportamiento.
  assert.equal(IDIOMA_BASE, "es-ES");
});

test("con el idioma base en es-ES el fallback está INERTE", () => {
  assert.equal(IDIOMA_FALLBACK, "es-ES");
  assert.equal(FALLBACK_ACTIVO, false, "base === fallback ⇒ no puede cambiar nada");
});

test("modo compatible: las claves no llevan huella en la tanda 1", () => {
  assert.equal(HUELLA_EN_CLAVES, "");
});

// --- Señal 1: alfabeto no latino ---------------------------------------------

test("tv:33238 — título en hangul es reparable", () => {
  // Medido: con language=es-MX, TMDB devuelve `런닝맨` porque no hay traducción
  // MX y cae al ORIGINAL, no a es-ES.
  assert.equal(necesitaReparacion(crudo({ title: "런닝맨", original_language: "ko" })), true);
});

test("movie:615173 — título en hangul, aunque tenga sinopsis", () => {
  assert.equal(necesitaReparacion(crudo({
    title: "마녀 2", overview: "Tiene sinopsis.", original_language: "ko",
  })), true);
});

test("acentos y eñes NO son alfabeto no latino", () => {
  for (const t of ["Máxima ansiedad", "El código enigma", "Los años ñandú", "Malèna"]) {
    assert.equal(necesitaReparacion(crudo({ title: t })), false, t);
  }
});

// --- Señal 2: sin sinopsis ---------------------------------------------------

test("sin sinopsis es reparable — es el caso más frecuente (54 de 57)", () => {
  for (const ref of ["tv:117217", "movie:1510795", "tv:12513"]) {
    assert.equal(necesitaReparacion(crudo({ overview: "" })), true, ref);
  }
  assert.equal(necesitaReparacion(crudo({ overview: "   " })), true, "solo espacios");
  assert.equal(necesitaReparacion(crudo({ overview: undefined })), true, "ausente");
});

// --- Señal 3: cayó al original, y la excepción del inglés --------------------

test("cayó al original en un idioma que no es ni español ni inglés", () => {
  assert.equal(necesitaReparacion(crudo({
    title: "Nihon no eiga", original_title: "Nihon no eiga", original_language: "ja",
  })), true);
});

test("EL PASAJE AL INGLÉS NO SE REPARA — está verificado con 12 casos", () => {
  // En Argentina estos SON los nombres publicados. Medido en Disney+: con
  // "Zootopia 2" la película aparece y con "Zootrópolis 2" NO aparece. Repararlos
  // rompería lo único que funciona. Es la regresión más fácil de introducir con
  // un fallback ingenuo.
  const ingles = [
    ["tv:1399", "Game of Thrones"],
    ["movie:1084242", "Zootopia 2"],
    ["movie:585", "Monsters, Inc."],
    ["tv:85271", "WandaVision"],
    ["movie:497698", "Black Widow"],
    ["tv:4607", "Lost"],
  ];
  for (const [ref, titulo] of ingles) {
    assert.equal(
      necesitaReparacion(crudo({ title: titulo, original_title: titulo, original_language: "en" })),
      false, `${ref} «${titulo}» NO se repara`,
    );
  }
});

test("un título en español que coincide con el original tampoco se repara", () => {
  assert.equal(necesitaReparacion(crudo({
    title: "El Capo", original_title: "El Capo", original_language: "es",
  })), false);
});

// --- Fusión POR CAMPO --------------------------------------------------------

test("si solo falta la sinopsis, el título es-MX SE CONSERVA", () => {
  // Es el punto de fusionar por campo: reemplazar el objeto entero perdería el
  // nombre latinoamericano, que es justo lo que se fue a buscar.
  const base = crudo({ title: "Duro de matar", overview: "" });
  const respaldo = crudo({ title: "Jungla de cristal", overview: "Un policía…" });
  const out = fusionarPorCampo(base, respaldo);
  assert.equal(out.title, "Duro de matar", "el título mexicano no se pisa");
  assert.equal(out.overview, "Un policía…", "la sinopsis sí se repara");
});

test("si el título no es latino, se toma el del respaldo", () => {
  const out = fusionarPorCampo(
    crudo({ title: "런닝맨", overview: "" }),
    crudo({ title: "Running Man", overview: "Un programa…" }),
  );
  assert.equal(out.title, "Running Man");
  assert.equal(out.overview, "Un programa…");
});

test("sin respaldo devuelve la base tal cual", () => {
  const base = crudo({ title: "런닝맨", overview: "" });
  assert.deepEqual(fusionarPorCampo(base, undefined), base);
});

test("un respaldo con la sinopsis vacía no borra la que había", () => {
  const out = fusionarPorCampo(crudo({ overview: "La buena." }), crudo({ overview: "" }));
  assert.equal(out.overview, "La buena.");
});

test("fusionar no muta la base", () => {
  const base = crudo({ title: "런닝맨", overview: "" });
  fusionarPorCampo(base, crudo({ title: "Running Man", overview: "x" }));
  assert.equal(base.title, "런닝맨");
  assert.equal(base.overview, "");
});
