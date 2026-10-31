// Regresión de la auditoría de Codex sobre 43ed967 (hallazgo P2): la huella del
// riel omitía el RANGO que usa MMR. Dos historiales con la misma lista ordenada
// de candidatas elegían orígenes distintos y compartían la clave de `reco:`.
// Datos: P6 de scripts/reco-harness/fixture.json (títulos del catálogo). Sin red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidatasOrigen, elegirOrigenesMMR, huellaSenales, type SenalConRango } from "./reco-seleccion.ts";

const FX = JSON.parse(readFileSync(new URL("../scripts/reco-harness/fixture.json", import.meta.url), "utf8"));
const P6: SenalConRango[] = FX.perfiles.find((p: { id: string }) => p.id === "P6").senales
  .map(({ tipo, id, peso, rango }: SenalConRango) => ({ tipo, id, peso, rango }));
const generos = (s: SenalConRango) => FX.fuentes[`${s.tipo}:${s.id}`].perfil.generosPropios as number[];
const mmr = (xs: SenalConRango[]) =>
  elegirOrigenesMMR(candidatasOrigen(xs), (s) => ({ tipo: s.tipo, generos: generos(s) })).map((s) => `${s.tipo}:${s.id}`);

// Entrada 1: las 12 de P6 + Mi lista (peso 1) de los 4 primeros títulos, rangos 12–15.
const entrada1: SenalConRango[] = [
  ...P6, ...P6.slice(0, 4).map((s, i) => ({ ...s, peso: 1 as const, rango: 12 + i })),
];
// Entrada 2: mismos títulos y pesos; esas 4 de Mi lista en los rangos 4–7, y los
// votos originales desde el rango 4 corridos +4. Las dos, rangos contiguos 0–15.
const entrada2: SenalConRango[] = [
  ...P6.map((s) => ({ ...s, rango: s.rango >= 4 ? s.rango + 4 : s.rango })),
  ...P6.slice(0, 4).map((s, i) => ({ ...s, peso: 1 as const, rango: 4 + i })),
];

test("el caso de Codex existe: mismas candidatas (tipo/id/peso) y MMR distinto", () => {
  const sinRango = (xs: SenalConRango[]) => candidatasOrigen(xs).map((s) => `${s.tipo}:${s.id}:${s.peso}`);
  assert.deepEqual(sinRango(entrada1), sinRango(entrada2));
  assert.notDeepEqual(mmr(entrada1), mmr(entrada2));
});

test("la huella distingue las dos entradas (falla con la huella tipo/id/peso de 43ed967)", () => {
  assert.notEqual(huellaSenales(entrada1, true), huellaSenales(entrada2, true));
});

test("cambiar K o λ cambia la huella: el riel no sobrevive a una recalibración", () => {
  assert.notEqual(huellaSenales(entrada1, true, 10, 1), huellaSenales(entrada1, true, 6, 1));
  assert.notEqual(huellaSenales(entrada1, true, 10, 1), huellaSenales(entrada1, true, 10, 2));
});

test("la misma entrada, aunque llegue en otro orden, da la misma huella (el HIT se conserva)", () => {
  assert.equal(huellaSenales(entrada1, true), huellaSenales([...entrada1].reverse(), true));
  assert.equal(huellaSenales(entrada1, true), huellaSenales(entrada1.map((s) => ({ ...s })), true));
});

test("lib/reco.ts arma la clave del riel con `huellaSenales` (la función probada acá)", () => {
  const src = readFileSync(new URL("./reco.ts", import.meta.url), "utf8");
  assert.match(src, /const senalesClave = huellaSenales\(opts\.senales, conRango\);/);
  assert.match(src, /claveReco\(huella\(\s*senalesClave,/);
});
