// Sección "RESEÑAS" de la ficha (pedido del dueño, 5/10): acordeón cerrado que
// abre una ventana con scroll propio. Hoy sólo existe la reseña de Yump; la
// lista ya está pensada para sumar las de usuarios sin rehacer la sección.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resenasDeFicha, tituloResenas, type ResenaFicha } from "./resenas.ts";

const fuente = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const yump = { texto: "Muy buena.", rating: 8, fecha: "3 oct 2026" };
const usuario = (n: number): ResenaFicha => ({ id: `u${n}`, origen: "usuario", autor: `Persona ${n}`, texto: `Texto ${n}`, fecha: "4 oct 2026", rating: null });

test("sin reseñas no hay sección: lista vacía", () => {
  assert.deepEqual(resenasDeFicha(null), []);
  assert.deepEqual(resenasDeFicha(null, []), []);
});

test("hoy: la de Yump es la única, firmada como Reseña Yump", () => {
  const r = resenasDeFicha(yump);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { id: "yump", origen: "yump", autor: "Reseña Yump", texto: "Muy buena.", fecha: "3 oct 2026", rating: 8 });
});

test("a futuro: la de Yump va SIEMPRE primera y después las de usuarios en su orden", () => {
  const r = resenasDeFicha(yump, [usuario(1), usuario(2)]);
  assert.deepEqual(r.map((x) => x.id), ["yump", "u1", "u2"]);
  assert.deepEqual(resenasDeFicha(null, [usuario(1)]).map((x) => x.id), ["u1"]);
});

test("el encabezado cuenta las reseñas: \"RESEÑAS · n\"", () => {
  assert.equal(tituloResenas(1), "RESEÑAS · 1");
  assert.equal(tituloResenas(12), "RESEÑAS · 12");
});

test("acordeón: arranca SIEMPRE cerrado, con la bajada de spoilers y accesible", () => {
  const s = fuente("components/ResenasAcordeon.tsx");
  assert.match(s, /useState\(false\)/, "tiene que arrancar cerrado");
  assert.match(s, /Cuidado, puede contener spoilers\./);
  assert.match(s, /aria-expanded=\{abierto\}/);
  assert.match(s, /aria-controls=/);
  // Cerrado no se renderiza el texto: ni una línea a la vista (spoilers).
  assert.match(s, /\{abierto && \(/);
});

test("ficha: reemplaza a \"Reseña editorial\" y se reinicia (cerrada) al cambiar de título", () => {
  const s = fuente("components/DetailView.tsx");
  assert.ok(!/Reseña editorial/.test(s), "quedó el título viejo");
  assert.match(s, /<ResenasAcordeon key=\{`\$\{t\.type\}:\$\{t\.id\}`\}/, "sin key, al ir de una ficha a otra quedaría abierta");
});

test("ventana interior: alto máximo y scroll propio que no arrastra a la página", () => {
  const css = fuente("app/globals.css");
  const regla = css.match(/\.resenas-ventana\{[^}]*\}/)?.[0] ?? "";
  assert.match(regla, /max-height:/);
  assert.match(regla, /overflow-y:auto/);
  assert.match(regla, /overscroll-behavior:contain/);
});
