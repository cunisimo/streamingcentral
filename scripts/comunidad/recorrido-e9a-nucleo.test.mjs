// Decisiones puras de la limpieza del recorrido E9a (auditoría E9a, A1).
//   node --test scripts/comunidad/recorrido-e9a-nucleo.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { decidirActividadAjena, decidirMeses, evaluarVerificacion, sqlActividadAjena, sqlBorrarComunidad, sqlBorrarParticipantes, sqlResiduos, unirObjetivos } from "./recorrido-e9a-nucleo.mjs";

const P1 = "11111111-1111-4111-8111-111111111111", P2 = "22222222-2222-4222-8222-222222222222";
const U1 = "33333333-3333-4333-8333-333333333333";
const VACIO = { cuentas: [], participantes: [], versiones: [] };

test("objetivos: lo guardado ∪ el registro, sin duplicados; nada más", () => {
  const o = unirObjetivos({ cuentas: [U1], participantes: [P1], versiones: ["7"] }, { cuentas: [U1], participantes: [P2], versiones: ["7", "9"] });
  assert.deepEqual(o, { cuentas: [U1], participantes: [P1, P2], versiones: ["7", "9"] });
  assert.deepEqual(unirObjetivos(null, VACIO), VACIO);
  assert.throws(() => unirObjetivos(null, { ...VACIO, participantes: ["x' or true --"] }), /participante inválido/);
});

test("meses: sólo se borra un ranking formado enteramente por datos propios", () => {
  const r = decidirMeses([
    { mes: "2026-09-01", consolidado: true, tramosAjenos: 0, resultadosAjenos: 0 },
    { mes: "2026-08-01", consolidado: true, tramosAjenos: 3, resultadosAjenos: 0 },
    { mes: "2026-07-01", consolidado: true, tramosAjenos: 0, resultadosAjenos: 1 },
    { mes: "2026-06-01", consolidado: true, tramosAjenos: 0, resultadosAjenos: 0 },
    { mes: "2026-10-01", consolidado: false, tramosAjenos: 0, resultadosAjenos: 0 },
  ], ["2026-06-01"]);
  assert.deepEqual(r.borrar, ["2026-09-01"]);
  assert.deepEqual(r.conservar, ["2026-06-01", "2026-07-01", "2026-08-01"]);
  assert.equal(r.discrepancias.length, 3);
  assert.match(r.discrepancias.join("\n"), /2026-06-01: ya estaba consolidado al preparar/);
});

test("un mes ajeno que no toca participantes propios ni siquiera se evalúa (no entra en la lista)", () => {
  // sqlMeses sólo trae meses con tramos o resultados de participantes propios;
  // con la lista vacía no hay nada que decidir.
  assert.deepEqual(decidirMeses([], []), { borrar: [], conservar: [], discrepancias: [] });
});

test("sin objetivos, los borrados no alcanzan ninguna fila (el caso de la auditoría)", () => {
  const sql = sqlBorrarComunidad(VACIO, []) + ";" + sqlBorrarParticipantes(VACIO);
  // Nada de fechas, huérfanos ni "mes no visto al preparar".
  assert.doesNotMatch(sql, /creado_en|iniciada_en|user_id is null|not in|>=|json_array_elements/);
  const deletes = sql.split(";").map((s) => s.trim()).filter((s) => /^(delete|update)/.test(s));
  assert.equal(deletes.length, 20);
  for (const d of deletes) {
    const where = d.slice(d.indexOf(" where ") + 7);
    // Cada condición positiva es una pertenencia a una lista vacía.
    const positivas = where.replace(/not \([^)]*\)/g, "").match(/(= any\(|&& )'\{[^}]*\}'::\w+\[\]/g) ?? [];
    assert.ok(positivas.length > 0, `sin lista: ${d}`);
    for (const x of positivas) assert.match(x, /'\{\}'/, d);
  }
});

test("con objetivos, sólo listas de ids validadas", () => {
  const sql = sqlBorrarComunidad({ cuentas: [U1], participantes: [P1], versiones: ["5"] }, ["2026-09-01"]);
  assert.match(sql, new RegExp(`participante_id = any\\('\\{${P1}\\}'::uuid\\[\\]\\)`));
  assert.match(sql, /mes = any\('\{2026-09-01\}'::date\[\]\)/);
  assert.match(sql, /admin_id = any\('\{33333333-3333-4333-8333-333333333333\}'::uuid\[\]\)/);
  assert.throws(() => sqlBorrarComunidad(VACIO, ["2026-09-15"]), /mes inválido/);
  assert.match(sqlResiduos(VACIO, ["2026-08-01"]), /not \(mes = any\('\{2026-08-01\}'::date\[\]\)\)/);
});

test("verificación: cualquier resto o discrepancia impide informar éxito", () => {
  const ok = { residuos: { cuentas: 0, tramos: "0" }, sinRegistrar: [], configIgual: true, purgaIgual: true, permisosPendientes: [],
    editorialRestante: false, relojPropio: false, discrepanciasMeses: [] };
  assert.deepEqual(evaluarVerificacion(ok), []);
  assert.deepEqual(evaluarVerificacion({ ...ok, residuos: { tramos: "2" } }), ["quedan 2 fila(s) propias en tramos"]);
  assert.match(evaluarVerificacion({ ...ok, sinRegistrar: ["x@recorrido.test"] })[0], /SIN registrar: no se tocaron/);
  assert.deepEqual(evaluarVerificacion({ ...ok, discrepanciasMeses: ["2026-08-01: …"] }), ["2026-08-01: …"]);
  assert.equal(evaluarVerificacion({ ...ok, configIgual: false, purgaIgual: false, permisosPendientes: ["anon t select"], editorialRestante: true, relojPropio: true }).length, 5);
});

test("residual A1: un voto ajeno en un mes SIN consolidar no lo frena decidirMeses, pero sí la actividad ajena", () => {
  // El caso puro de la auditoría sobre 092aceb.
  const m = decidirMeses([{ mes: "2026-10-01", consolidado: false, tramosAjenos: 1, resultadosAjenos: 0 }], []);
  assert.deepEqual(m, { borrar: [], conservar: [], discrepancias: [] }, "un mes sin consolidar no es un ranking que conservar");
  assert.deepEqual(decidirActividadAjena({ evaluaciones: 1, tramos: 1, denuncias: 0, bloqueos: 0, decisiones: 0 }), [
    "actividad ajena sobre lo propio: 1 voto(s); borrar lo propio la eliminaría",
    "actividad ajena sobre lo propio: 1 tramo(s) de votos; borrar lo propio la eliminaría",
  ]);
  assert.equal(decidirActividadAjena({ evaluaciones: "0", tramos: "0", denuncias: "2", bloqueos: "1", decisiones: "1" }).length, 3);
  assert.deepEqual(decidirActividadAjena({ evaluaciones: 0, tramos: 0, denuncias: 0, bloqueos: 0, decisiones: 0 }), []);
});

test("la consulta de actividad ajena mira sólo lo ajeno SOBRE lo propio, en cualquier mes", () => {
  const sql = sqlActividadAjena({ cuentas: [U1], participantes: [P1], versiones: ["5"] });
  assert.doesNotMatch(sql, /mes|consolid|creado_en|creada_en/, "sin filtro de mes ni de fecha");
  assert.ok(sql.includes(`evaluaciones where autor_participante = any('{${P1}}'::uuid[]) and not (evaluador_participante = any('{${P1}}'::uuid[]))`));
  assert.ok(sql.includes(`tramos where autor_participante = any('{${P1}}'::uuid[]) and not (evaluador_participante = any(`));
  assert.ok(sql.includes(`bloqueos where bloqueado_participante = any('{${P1}}'::uuid[]) and not (bloqueador_participante = any(`));
  assert.ok(sql.includes(`decisiones where admin_id is not null and not (admin_id = any('{${U1}}'::uuid[]))`));
});
