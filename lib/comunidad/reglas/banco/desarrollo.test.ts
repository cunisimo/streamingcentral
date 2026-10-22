// El banco de DESARROLLO contra los criterios de la revisión §3.6. Es el
// único banco con el que se ajustan las reglas; el reservado no se toca acá.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CASOS_DESARROLLO, RETENIDOS_CONOCIDOS } from "./desarrollo.ts";
import { evaluarBanco } from "./evaluar.ts";
import { REGLAS_NOMBRE, REGLAS_RESENA } from "../reglas.ts";

const informe = evaluarBanco(CASOS_DESARROLLO);

test("tamaño mínimo: ≥ 150 reseñas legítimas y ≥ 150 de abuso; ids únicos", () => {
  const n = (grupo: string) => CASOS_DESARROLLO.filter((c) => c.tipo === "resena" && c.grupo === grupo).length;
  assert.ok(n("legitima") >= 150, `legítimas: ${n("legitima")}`);
  assert.ok(n("abuso") >= 150, `abuso: ${n("abuso")}`);
  const ids = CASOS_DESARROLLO.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("al menos 5 variantes ofuscadas distintas por regla de contacto", () => {
  for (const cat of ["contacto.telefono", "contacto.email", "enlace", "contacto.red"]) {
    const textos = new Set(
      CASOS_DESARROLLO.filter((c) => c.tipo === "resena" && c.categoria === cat && c.variante === "ofuscada").map((c) => c.texto),
    );
    assert.ok(textos.size >= 5, `${cat}: ${textos.size}`);
  }
});

test("criterios C0–C4 sobre el banco de desarrollo", () => {
  for (const c of informe.criterios) assert.ok(c.cumple, `${c.id} ${c.descripcion}: ${c.valor}`);
});

test("cada caso da el resultado esperado, salvo los retenidos conocidos (que deben quedar retenidos)", () => {
  const fallidos = informe.resultados
    .filter((r) => !r.coincide && !(r.caso.id in RETENIDOS_CONOCIDOS))
    .map((r) => `${r.caso.id} → ${r.decision.resultado}`);
  assert.deepEqual(fallidos, []);
  for (const id of Object.keys(RETENIDOS_CONOCIDOS)) {
    const r = informe.resultados.find((x) => x.caso.id === id);
    assert.equal(r?.decision.resultado, "retener", id);
  }
});

test("todas las reglas de contenido se disparan con al menos un caso", () => {
  const disparadas = new Set(informe.resultados.flatMap((r) => r.decision.disparadas.map((d) => d.regla)));
  // El formato se prueba en reglas.test.ts: el banco tiene textos de largo válido a propósito.
  const sinCobertura = [...REGLAS_RESENA, ...REGLAS_NOMBRE]
    .map((r) => r.id)
    .filter((id) => !id.startsWith("formato.") && id !== "menores.sexual" && !disparadas.has(id));
  assert.deepEqual(sinCobertura, []);
});
