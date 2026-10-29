// Los descartes de "No es para mí" tienen que LLEGAR al recomendador.
//
// Hasta el 29/10 se filtraban sólo en el cliente: el servidor devolvía siempre
// los mismos ~20 títulos y cada descarte achicaba el riel para siempre, sin
// reponerse ni al recargar. La ruta no se puede importar en node (next/server),
// así que se verifica sobre el fuente, con controles mutados que tienen que
// hacer fallar el guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const RUTA = fs.readFileSync("app/api/te-va-a-gustar/route.ts", "utf8");
const RECO = fs.readFileSync("lib/reco.ts", "utf8");

function cableado(ruta: string): boolean {
  // Se leen con el token del pedido…
  const leidos = /descartesDeToken\(token\)/.test(ruta);
  // …y se suman a `excluir`, que es lo que se le pasa a `recomendaciones`.
  const sumados = /const excluir = [\s\S]*?\.concat\(descartes \?\? \[\]\);/.test(ruta);
  const pasados = /recomendaciones\(\{ senales, excluir, providers \}\)/.test(ruta);
  return leidos && sumados && pasados;
}

test("la ruta lee los descartes con el token y los suma a las exclusiones", () => {
  assert.ok(cableado(RUTA));
});

test("control: sin la suma o sin la lectura, el guard falla", () => {
  assert.equal(cableado(RUTA.replace(".concat(descartes ?? [])", "")), false);
  assert.equal(cableado(RUTA.replace("descartesDeToken(token)", "Promise.resolve(null)")), false);
});

test("las exclusiones entran en la clave del riel, así un descarte nuevo lo rearma", () => {
  assert.match(RECO, /claveReco\(huella\([\s\S]*?\[\.\.\.opts\.excluir\]\.sort\(\)\.join\(","\)/);
});
