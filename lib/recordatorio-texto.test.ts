// El nombre que llega al .ics.
//
// La documentación decía que Recordarme "hereda el título reparado de la ficha".
// No era cierto: la ruta llamaba a `titleDetails()` crudo. Ahora el camino
// DIRECTO pasa por `detalleReparado`, y esto fija qué texto termina en el
// archivo que el usuario agenda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumen, type DatosRecordatorio } from "./recordatorio-texto.ts";

const d = (o: Partial<DatosRecordatorio> = {}): DatosRecordatorio => ({
  titulo: "Sueño de fuga", fecha: "2026-09-01",
  season: null, episode: null, premiere: false, ...o,
});

test("película: el título reparado es el que va al .ics", () => {
  assert.equal(
    resumen(d({ titulo: "Sueño de fuga" }), "movie", "Netflix"),
    "Sueño de fuga — estreno en Netflix",
  );
});

test("el título llega TAL CUAL vino de la ficha: no se re-traduce ni se recorta", () => {
  // Si mañana el idioma base cambia, este texto cambia con él, y no hay una
  // segunda fuente que pueda contradecir lo que el usuario vio.
  for (const t of ["Sueño de fuga", "Máxima ansiedad", "Beetlejuice Beetlejuice", "런닝맨"]) {
    assert.ok(resumen(d({ titulo: t }), "movie", null).startsWith(`${t} — `), t);
  }
});

test("serie: estreno de temporada", () => {
  assert.equal(
    resumen(d({ titulo: "La Ley y el Orden", season: 3, premiere: true }), "tv", "Max"),
    "La Ley y el Orden — estrena la temporada 3 en Max",
  );
});

test("serie: episodio suelto", () => {
  assert.equal(resumen(d({ titulo: "NCIS", season: 2, episode: 7 }), "tv", null), "NCIS — T2 E7");
});

test("serie sin temporada ni episodio", () => {
  assert.equal(resumen(d({ titulo: "Reacher" }), "tv", "Prime Video"),
    "Reacher — nuevo episodio en Prime Video");
});

test("sin plataforma no se inventa un 'en'", () => {
  assert.equal(resumen(d({ titulo: "Moana 2" }), "movie", null), "Moana 2 — estreno");
});
