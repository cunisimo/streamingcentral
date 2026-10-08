// Sincronización de con_texto y estimación de colecciones pendientes (sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sincronizarTextos } from "./textos.mjs";
import { planificar } from "./nucleo.mjs";

test("sincronizarTextos marca con_texto según copy-ruleta (conoce + razon) en pool y reserva, sin tocar nada más", () => {
  const estado = {
    titulos: { 1: { tmdb_id: 1, con_texto: false, title: "A" }, 2: { tmdb_id: 2, con_texto: true, title: "B" }, 3: { tmdb_id: 3, con_texto: false } },
    reserva: { 4: { tmdb_id: 4, con_texto: false } },
  };
  const rows = [
    { tmdb_id: 1, conoce: true, razon: "r" },
    { tmdb_id: 2, conoce: false, razon: null },
    { tmdb_id: 4, conoce: true, razon: "r" },
  ];
  const { estado: e, cambios } = sincronizarTextos(estado, rows);
  assert.equal(e.titulos[1].con_texto, true);
  assert.equal(e.titulos[2].con_texto, false);
  assert.equal(e.titulos[3].con_texto, false, "sin fila: sin texto");
  assert.equal(e.reserva[4].con_texto, true);
  assert.equal(e.titulos[1].title, "A");
  assert.deepEqual(cambios, { aTrue: 2, aFalse: 1 });
  assert.equal(estado.titulos[1].con_texto, false, "no muta la entrada");
});

test("con la selección cerrada, las colecciones pendientes son sólo las sagas SIN resolver (no una fórmula sobre el total)", () => {
  const t = (id, extra) => ({ tmdb_id: id, year: 2015, runtime: 100, overview: "x", vote_count: 500, vote_average: 7, disp_at: "2026-10-07T00:00:00Z", ...extra });
  const estado = {
    titulos: {
      1: t(1, { coleccion: { id: 50 }, es_secuela: true }),
      2: t(2, { coleccion: { id: 60 }, es_secuela: null }),   // sin resolver
      3: t(3, { coleccion: { id: 60 }, es_secuela: null }),   // misma saga
      4: t(4, { coleccion: null, es_secuela: false }),
    },
    sagas: { 50: {} }, descartados: {}, reserva: {},
    descubrimiento: { at: "x", candidatos: {} },
  };
  const cfg = {
    fases: { descubrir: false, enriquecer: true, disponibilidad: false }, ahoraMs: Date.parse("2026-10-08T00:00:00Z"),
    ttlDispDias: 30, ttlDescartesDias: 90,
    seleccion: { cola: [], cuotas: { total: 500 }, pendientes: { p50: 0, p90: 0 } },
  };
  const p = planificar(estado, new Map(), cfg);
  assert.equal(p.llamadas.porOperacion.detalle, 0);
  assert.equal(p.llamadas.porOperacion.coleccion, 1, "una sola saga sin resolver (la 60)");
});
