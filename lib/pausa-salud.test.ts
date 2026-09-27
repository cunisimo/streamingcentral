// Etapa 3.c.1 (#19): lo que /api/health expone de la pausa — SÓLO agregados
// (§41.4): la pausa vigente y las sumas de los últimos 60 cubos. Ningún uuid,
// id de evento, familia, ruta ni evento crudo. La forma que devuelve el script
// SALUD se VALIDA: cualquier otra cosa (Redis caído, `"Aborted"`, null) es
// `null`, nunca ceros que parezcan "todo bien". Escrito ANTES del módulo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { saludDeLaPausa } from "./pausa-salud.ts";

test("la tupla de SALUD se convierte en agregados con nombre; PTTL ≤ 0 es pausaVigenteMs 0", () => {
  assert.deepEqual(saludDeLaPausa([4000, 3, 2, 1, 5, 0, 7, 1]), {
    pausaVigenteMs: 4000,
    ultimos60min: { "429": 3, pausas: 2, yaMayor: 1, yaAplicada: 5, pausaNoLeida: 0, pausadosUB: 7, pausados503: 1 },
  });
  assert.equal(saludDeLaPausa([-2, 0, 0, 0, 0, 0, 0, 0])!.pausaVigenteMs, 0);
  assert.equal(saludDeLaPausa([-1, 0, 0, 0, 0, 0, 0, 0])!.pausaVigenteMs, 0);
});

test("🔴 una forma inesperada NO se disfraza de agregados: null, 'Aborted', tupla corta o con no enteros → null", () => {
  for (const raro of [null, undefined, "Aborted", 7, [], [4000], [4000, 1, 2, 3, 4, 5, 6], [4000, "1", 2, 3, 4, 5, 6, 7], [4000, 1.5, 2, 3, 4, 5, 6, 7], [4000, 1, 2, 3, 4, 5, 6, 7, 8]]) {
    assert.equal(saludDeLaPausa(raro), null, JSON.stringify(raro));
  }
});

test("el JSON de salida no contiene nada que no sea un agregado", () => {
  const s = JSON.stringify(saludDeLaPausa([1000, 1, 1, 0, 0, 0, 0, 0]));
  assert.doesNotMatch(s, /uuid|familia|eventos|"id"|proc|ev:/);
  assert.deepEqual(Object.keys(JSON.parse(s)).sort(), ["pausaVigenteMs", "ultimos60min"]);
});
