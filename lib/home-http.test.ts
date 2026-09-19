// Etapa 3.c.1 (#19): de un payload del Home a la respuesta HTTP de la ruta.
// Los finales `pausa` de lib/home-servir.ts (sin UB y pausa vigente) NO son un
// Home: viajan como 503 + Retry-After con el cuerpo que el cliente ya reconoce
// (`useApi` → error → "No pudimos cargar el inicio" + Reintentar, §41.5). Un
// 200 vacío con `motivo: "pausa"` sería "Nada en tus plataformas": falso.
// Escrito ANTES del módulo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { respuestaDelHome } from "./home-http.ts";
import { MOTIVO_TMDB_NO_DISPONIBLE } from "./tmdb-http.ts";

const home = { hero: [{ id: 1 }], rails: [{ key: "x" }], fallos: 0, degradado: false };

test("un Home normal (con o sin contenido, degradado o no) responde 200 con el payload tal cual", () => {
  assert.deepEqual(respuestaDelHome(home), { status: 200, headers: {}, body: home });
  const degradado = { ...home, fallos: 2, degradado: true };
  assert.deepEqual(respuestaDelHome(degradado), { status: 200, headers: {}, body: degradado });
  const sinPlataformas = { hero: [], rails: [], fallos: 0, degradado: false, sinPlataformas: true };
  assert.equal(respuestaDelHome(sinPlataformas).status, 200);
});

test("los vacíos de la Etapa 2 (`espera-agotada`, `cancelada`) siguen siendo el 200 de hoy", () => {
  for (const motivo of ["espera-agotada", "cancelada"] as const) {
    const v = { hero: [], rails: [], fallos: 0, degradado: true, motivo };
    assert.deepEqual(respuestaDelHome(v), { status: 200, headers: {}, body: v });
  }
});

test("🔴 los finales de la pausa (`pausa`, `pausa-indeterminada`, `presupuesto-insuficiente`) responden 503 + Retry-After = ⌈reintentarEnMs / 1000⌉ y el cuerpo { error: tmdb-no-disponible, motivo, reintentarEnMs }", () => {
  for (const motivo of ["pausa", "pausa-indeterminada", "presupuesto-insuficiente"] as const) {
    const r = respuestaDelHome({ hero: [], rails: [], fallos: 0, degradado: true, motivo, reintentarEnMs: 4300 });
    assert.equal(r.status, 503);
    assert.deepEqual(r.headers, { "Retry-After": "5" });
    assert.deepEqual(r.body, { error: MOTIVO_TMDB_NO_DISPONIBLE, motivo, reintentarEnMs: 4300 });
  }
});

test("Retry-After nunca es 0: un reintentarEnMs ausente o ≤ 0 cae al default de 5 s", () => {
  const r = respuestaDelHome({ hero: [], rails: [], fallos: 0, degradado: true, motivo: "pausa" });
  assert.equal(r.headers["Retry-After"], "5"); assert.equal((r.body as { reintentarEnMs: number }).reintentarEnMs, 5000);
  const r2 = respuestaDelHome({ hero: [], rails: [], fallos: 0, degradado: true, motivo: "pausa", reintentarEnMs: 0 });
  assert.equal(r2.headers["Retry-After"], "5");
  const r3 = respuestaDelHome({ hero: [], rails: [], fallos: 0, degradado: true, motivo: "pausa", reintentarEnMs: 1 });
  assert.equal(r3.headers["Retry-After"], "1");
});
