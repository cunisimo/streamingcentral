// El generador del contrato v1: determinista y con requisito del 100 % sobre
// lo generado (catálogo §8): la salida esperada y el disparo de la regla de
// la propia familia. Un fallo es un defecto del mecanismo, no "otra familia".
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarNombre, evaluarResena } from "./decision.ts";
import { familiasDisparadas } from "./familias.ts";
import { generar, SEMILLA } from "./generador.ts";

const casos = generar();
const evaluar = (c: (typeof casos)[number]) =>
  c.tipo === "resena" ? evaluarResena(c.texto, c.contexto ?? { textosRecientes: [] }) : evaluarNombre(c.texto);
const coincide = (esperado: string, r: string) =>
  esperado === "publicar" ? r === "publicar" : esperado === "retener" ? r === "retener" : r === "rechazo_contenido";

test("el generador es determinista (misma semilla, mismos casos)", () => {
  assert.deepEqual(generar(SEMILLA), casos);
  assert.ok(casos.length > 1000, `${casos.length} casos`);
});

test("todos los textos generados respetan el largo de reseña o nombre", () => {
  for (const c of casos) {
    const n = [...c.texto.normalize("NFC")].length;
    assert.ok(c.tipo === "resena" ? n >= 80 && n <= 600 : n >= 2 && n <= 24, `${c.id} ${c.dimension}: ${n}`);
  }
});

test("100 % de lo generado: salida esperada y disparo de la propia familia", () => {
  const fallos: string[] = [];
  for (const c of casos) {
    const d = evaluar(c);
    const familias = familiasDisparadas(d.disparadas.map((x) => x.regla));
    if (!coincide(c.esperado, d.resultado)) fallos.push(`${c.id} ${c.dimension}: esperado ${c.esperado}, salió ${d.resultado}`);
    else if (c.familia && !familias.has(c.familia)) fallos.push(`${c.id} ${c.dimension}: no disparó ${c.familia} (${[...familias].join(",")})`);
  }
  assert.deepEqual(fallos, []);
});
