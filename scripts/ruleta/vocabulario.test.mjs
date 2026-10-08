// Detector de vocabulario de España (scripts/check-vocabulario.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarVocabulario } from "../check-vocabulario.mjs";

test("detecta vocabulario peninsular real", () => {
  assert.deepEqual(buscarVocabulario("Se suben al coche y no paran."), ["coche"]);
  assert.deepEqual(buscarVocabulario("Vale, es liviana pero funciona."), ["vale"]);
  assert.deepEqual(buscarVocabulario("Si buscáis algo liviano, es esta."), ["buscáis"]);
  assert.deepEqual(buscarVocabulario("Os va a gustar."), ["os"]);
  assert.deepEqual(buscarVocabulario("Llama al móvil de su hermano."), ["móvil"]);
});

test("NO marca usos rioplatenses ni números (falsos positivos del 2026-10-07)", () => {
  assert.deepEqual(buscarVocabulario("Para fans de la saga vale como evento."), []);
  assert.deepEqual(buscarVocabulario("Vale la pena por el elenco."), []);
  assert.deepEqual(buscarVocabulario("Vale para quien quiera un drama sobrio."), []);
  assert.deepEqual(buscarVocabulario("Una adulta con una adolescente de dieciséis."), []);
  assert.deepEqual(buscarVocabulario("Tiene veintiséis años y seis hermanos."), []);
  assert.deepEqual(buscarVocabulario("Los osos pardos y el cosmos."), []);
  assert.deepEqual(buscarVocabulario("Siete samuráis y dos bonsáis."), [], "plurales de sustantivos en -ái");
});
