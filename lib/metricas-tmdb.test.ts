// Las unidades de TMDB de la Etapa 3.a, sin ambigüedad (informe §13): la
// llamada lógica (lo que pidió el código), el intento HTTP (lo que salió al
// cable) y el reintento (intentos posteriores al primero de una llamada) son
// tres cuentas distintas. Hasta acá `llamadas` valía como intentos "porque el
// cliente no reintenta"; con el bucle presente —aunque apagado— la igualdad se
// verifica, no se supone. Y dos clases nuevas de error: `timeout` (sale de
// `red`) y `cuerpo` (200 con JSON roto, que antes contaba como `ok`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { anotar, lineaHome, nuevasMetricas, withMetricas } from "./metricas.ts";

test("nuevasMetricas trae las cuentas nuevas de TMDB en cero", () => {
  const m = nuevasMetricas();
  assert.equal(m.tmdb.intentos, 0);
  assert.equal(m.tmdb.reintentos, 0);
  assert.equal(m.tmdb.reintentoNoCupo, 0);
  assert.equal(m.tmdb.rechazadas, 0);
  assert.equal(m.tmdb.errores.timeout, 0);
  assert.equal(m.tmdb.errores.cuerpo, 0);
  assert.deepEqual(m.tmdb.canceladas, { enCola: 0, enEspera: 0, enVuelo: 0 });
  assert.equal(m.tmdb.esperaReintentosMs, 0);
  assert.equal(m.home.descartesTmdb, 0);
});

test("la línea [home] muestra intentos, reintentos, timeout, cuerpo, canceladas y descartes cuando valen", async () => {
  const { metricas } = await withMetricas(async () => {
    anotar((m) => {
      m.tmdb.llamadas = 10; m.tmdb.intentos = 12; m.tmdb.reintentos = 2; m.tmdb.ok = 8;
      m.tmdb.errores.timeout = 1; m.tmdb.errores.cuerpo = 1; m.tmdb.errores.http429 = 2;
      m.tmdb.canceladas.enCola = 3; m.tmdb.rechazadas = 0;
      m.home.degradado = true; m.home.fuentesCaidas = 1; m.home.descartesTmdb = 4;
    });
  });
  const linea = lineaHome(metricas, 100, "home:x");
  assert.match(linea, /tmdb 10 llamadas \/ 12 intentos \(2 reintentos\)/);
  assert.match(linea, /1 timeout/);
  assert.match(linea, /1 cuerpo/);
  assert.match(linea, /2 x429/);
  assert.match(linea, /3 canceladas \(3 en cola\)/);
  assert.match(linea, /DEGRADADO \(1 fuente\(s\), 4 descarte\(s\) tmdb\)/);
});

test("sin reintentos ni clases nuevas, la línea [home] es la de siempre (control: no cambia lo que ya se lee)", async () => {
  const { metricas } = await withMetricas(async () => {
    anotar((m) => { m.tmdb.llamadas = 5; m.tmdb.intentos = 5; m.tmdb.ok = 5; m.tmdb.ms = 40; });
  });
  const linea = lineaHome(metricas, 100);
  assert.match(linea, /tmdb 5 llamadas \(5 ok\) 40ms/);
  assert.doesNotMatch(linea, /reintentos|timeout|cuerpo|canceladas|descarte/);
});
