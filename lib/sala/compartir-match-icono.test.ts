// El ícono del botón "Compartir" del resultado (`CompartirMatch`). El SVG no
// trae width/height: sin una regla de CSS que le dé tamaño, dentro de
// `.sala-acciones-resultado` medía 0×0 y el botón quedaba sin ícono.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

test("CompartirMatch: el botón lleva la clase que le da tamaño al ícono", () => {
  const src = leer("components/sala/CompartirMatch.tsx");
  assert.match(src, /className="rlt-btn sala-compartir-match"/);
  assert.match(src, /<svg viewBox="0 0 24 24"/);
});

test("globals.css: el SVG de .sala-compartir-match mide 18×18 y no se encoge", () => {
  const css = leer("app/globals.css");
  assert.match(css, /\.sala-compartir-match svg\{width:18px;height:18px;flex:none\}/);
});
