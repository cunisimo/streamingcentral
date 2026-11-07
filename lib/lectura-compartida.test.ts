import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lecturaCompartida } from "./lectura-compartida.ts";

const enrich = readFileSync(new URL("./enrich.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("toda la tanda comparte una sola lectura y el mismo valor", async () => {
  let n = 0;
  const leer = lecturaCompartida(async () => { n++; return new Map([["movie:1", ["n"]]]); });
  const [a, b, c] = await Promise.all([leer(), leer(), leer()]);
  assert.equal(n, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(await leer(), a, "quien llega después reusa el resultado");
  assert.equal(n, 1);
});

test("un fallo le llega a toda la tanda y no se reintenta dentro de ella", async () => {
  let n = 0;
  const leer = lecturaCompartida(async () => { n++; throw new Error("supabase"); });
  await assert.rejects(leer(), /supabase/);
  await assert.rejects(leer(), /supabase/);
  assert.equal(n, 1);
});

test("otra tanda vuelve a leer: el fallo y el valor no cruzan pedidos", async () => {
  let n = 0;
  const fabrica = () => lecturaCompartida(async () => { n++; return n; });
  assert.equal(await fabrica()(), 1);
  assert.equal(await fabrica()(), 2);
});

test("en enrich la lectura se crea por tanda, nunca a nivel de módulo", () => {
  const usos = enrich.match(/lecturaCompartida\(evidenciaTopManual\)/g) ?? [];
  assert.equal(usos.length, 2, "se esperaba persona/«Ver más» y relacionados de la ficha");
  assert.doesNotMatch(enrich, /^(const|let|export const) [^\n]*lecturaCompartida\(/m);
  const tanda = /function plataformasDeObra\(\) \{[\s\S]*?\n\}/.exec(enrich);
  assert.ok(tanda, "no se encontró plataformasDeObra");
  assert.match(tanda![0], /lecturaCompartida\(evidenciaTopManual\)/);
  assert.match(tanda![0], /disponibilidadDe\(.*leerTopManual\)/);
});
