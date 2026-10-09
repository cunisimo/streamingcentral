// Reconciliación del estado con Producción tras una carga manual del dueño.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reconciliarConProduccion, colaVigente, resumenEstado, ConflictoReconciliacion } from "./reconciliar.mjs";
import { llenarObjetivo } from "./seleccion.mjs";

const t = (id, extra = {}) => ({ tmdb_id: id, media_type: "movie", title: `T${id}`, year: 2015, runtime: 100, genres: ["Drama"], providers: ["Netflix"], providers_flatrate: ["Netflix"], overview: "x", ...extra });
const AHORA = "2026-10-09T15:00:00.000Z";

// Escenario de 2026-10-08 en miniatura: 2 viejos (1, 2), 3 traídos pendientes
// (10, 11, 12) de los que se cargaron 10 y 11, y uno promovido de la reserva (20).
function escenario() {
  return {
    titulos: { 1: t(1), 2: t(2), 10: t(10), 11: t(11), 12: t(12) },
    reserva: { 20: { ...t(20), reserva_motivo: "cupo-2020s-lleno", reserva_pos: 7 }, 21: { ...t(21), reserva_motivo: "cupo-2020s-lleno", reserva_pos: 8 } },
    excluidos_editoriales: { 30: { motivo: "anime" } },
    descartados: { 40: { motivo: "sin-flatrate-yump", at: "2026-10-07T00:00:00Z" } },
    carga_pendiente: { nuevos: [10, 11, 12], disponibilidad: [10, 11, 12], desde: "2026-10-07T20:00:00Z" },
    metadatos_pendientes_sql: [1, 12],
    sagas: {}, region: "AR",
  };
}
const foto = (ids, { sinDisp = [], excl = {} } = {}) => ({
  at: "2026-10-09T14:00:00.000Z",
  rt: ids.map((id) => ({ id, mt: "movie", excl: excl[id] ?? null })),
  ta: ids.filter((id) => !sinDisp.includes(id)).map((id) => ({ id, mt: "movie" })),
});

test("el pool queda igual a Producción: lo no cargado vuelve a reserva y lo promovido sale de ella", () => {
  const { estado: s, resumen } = reconciliarConProduccion(escenario(), foto([1, 2, 10, 11, 20], { excl: { 2: "anime" } }), { ahoraIso: AHORA, motivoDe: () => "no-cargado-sin-pero" });
  assert.deepEqual(Object.keys(s.titulos).map(Number).sort((a, b) => a - b), [1, 2, 10, 11, 20]);
  assert.deepEqual(Object.keys(s.reserva).map(Number).sort((a, b) => a - b), [12, 21]);
  assert.equal(s.reserva[12].reserva_motivo, "no-cargado-sin-pero");
  assert.equal(s.titulos[20].reserva_motivo, undefined, "el promovido pierde las marcas de reserva");
  assert.equal(s.carga_pendiente, undefined, "todo lo cargado tiene disponibilidad: no queda nada pendiente");
  assert.deepEqual(s.cargas.at(-1).ids, [10, 11, 20]);
  assert.equal(s.cargas.at(-1).desde_reserva, 1);
  assert.deepEqual(s.metadatos_pendientes_sql, [1], "el 12 no está en Producción: no hay metadatos que actualizar");
  assert.deepEqual(s.excluidos_produccion, { 2: "anime" });
  assert.equal(resumen.titulosAntes, 5);
  assert.equal(resumen.titulosDespues, 5);
  assert.deepEqual(resumen.aReserva, { "no-cargado-sin-pero": 1 });
});

test("es idempotente: reconciliar dos veces con la misma foto no cambia nada ni duplica la carga", () => {
  const f = foto([1, 2, 10, 11, 20]);
  const a = reconciliarConProduccion(escenario(), f, { ahoraIso: AHORA }).estado;
  const b = reconciliarConProduccion(a, f, { ahoraIso: AHORA }).estado;
  assert.deepEqual(b, a);
  assert.equal(b.cargas.length, 1);
});

test("un título cargado sin disponibilidad queda pendiente SÓLO de disponibilidad", () => {
  const { estado: s } = reconciliarConProduccion(escenario(), foto([1, 2, 10, 11], { sinDisp: [11] }), { ahoraIso: AHORA });
  assert.deepEqual(s.carga_pendiente.nuevos, []);
  assert.deepEqual(s.carga_pendiente.disponibilidad, [11]);
});

test("conflictos: aborta ante lo que no puede explicar, sin devolver estado", () => {
  const e = escenario();
  assert.throws(() => reconciliarConProduccion(e, foto([1, 2, 99]), { ahoraIso: AHORA }), ConflictoReconciliacion, "un id de Producción desconocido");
  assert.throws(() => reconciliarConProduccion({ ...e, titulos: { ...e.titulos, 30: t(30) } }, foto([1, 2, 30]), { ahoraIso: AHORA }), ConflictoReconciliacion, "un excluido cargado");
  assert.throws(() => reconciliarConProduccion(e, foto([1, 10, 11]), { ahoraIso: AHORA }), ConflictoReconciliacion, "un viejo que desapareció");
  const tv = foto([1, 2]); tv.rt.push({ id: 5, mt: "tv" });
  assert.throws(() => reconciliarConProduccion(e, tv, { ahoraIso: AHORA }), ConflictoReconciliacion, "otro media_type");
  assert.ok(e.carga_pendiente && e.titulos[12], "el estado de entrada no se toca");
});

test("la próxima selección no vuelve a proponer lo cargado aunque la cola sea vieja", async () => {
  const { estado: s } = reconciliarConProduccion(escenario(), foto([1, 2, 10, 11, 20]), { ahoraIso: AHORA });
  const cola = [10, 11, 12, 20, 21, 30, 50, 51].map((id, i) => ({ pos: i + 1, id, prevista: "2010s", cortaProbable: false }));
  const { cola: vigente, quitados } = colaVigente(cola, s);
  assert.deepEqual(vigente.map((c) => c.id), [50, 51]);
  assert.equal(quitados, 6);
  const cuotas = { total: 2, cortaMin: 0, decadas: { "<1980": 0, "1980s": 0, "1990s": 0, "2000s": 0, "2010s": 2, "2020s": 0 } };
  const r = await llenarObjetivo(vigente, cuotas, async (c) => t(c.id));
  assert.deepEqual(r.aceptados.map((x) => x.tmdb_id), [50, 51]);
});

test("el resumen distingue pool, última carga, reserva y excluidos/descartados", () => {
  const { estado: s } = reconciliarConProduccion(escenario(), foto([1, 2, 10, 11, 20], { excl: { 1: "anime" } }), { ahoraIso: AHORA, motivoDe: () => "no-cargado-sin-texto" });
  const r = resumenEstado(s);
  assert.equal(r.titulos, 5);
  assert.equal(r.excluidosEnProduccion, 1);
  assert.equal(r.ultimaCarga.total, 3);
  assert.deepEqual(r.reservaPorMotivo, { "no-cargado-sin-texto": 1, "cupo-2020s-lleno": 1 });
  assert.deepEqual(r.excluidosEditoriales, { anime: 1 });
  assert.deepEqual(r.descartados, { "sin-flatrate-yump": 1 });
  assert.equal(r.cargaPendiente, null);
});

test("la foto de Producción es de sólo lectura: el script sólo hace GET", () => {
  const src = readFileSync(resolve(import.meta.dirname, "snapshot-produccion.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /method: "GET"/);
  assert.ok(!/POST|PATCH|PUT|DELETE|\/rpc\//.test(src));
  assert.ok(!/console\.log\([^)]*key/.test(src), "no imprime la clave");
});
