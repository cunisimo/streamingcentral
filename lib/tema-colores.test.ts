// El color de la barra de estado tiene que ser EL MISMO que el fondo de la app.
//
// ============================================================================
// EL BUG QUE ESTE TEST EXISTE PARA IMPEDIR
// ============================================================================
// En la PWA instalada de Android, la barra de estado se pinta con
// `theme-color`. Si ese color no es exactamente `--bg`, queda una franja arriba
// de un tono distinto al de la app.
//
// `ThemeContext` tenía una copia a mano de esos colores, con este comentario:
//
//     // Colores de la barra de estado en app instalada. Tienen que coincidir
//     // con --bg de cada tema en globals.css.
//     const BAR = { light: "#F5F5F2", dark: "#16171B" };
//
// Y no coincidían con ninguno de los dos:
//
//     claro:  barra #F5F5F2  contra  --bg #FAFAFD   (−5, −5, −11)
//     oscuro: barra #16171B  contra  --bg #0F0E13   (+7, +9, +8)
//
// Por eso se veía en los DOS temas, y en direcciones opuestas: en claro la
// franja salía más oscura, en oscuro más clara.
//
// 🔴 UNA COPIA A MANO SE DESINCRONIZA. Ese comentario decía exactamente lo que
// había que cumplir y no se cumplía, porque nada lo verificaba. Ahora hay una
// sola fuente (`lib/tema-colores.ts`) y este test la ata al CSS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLOR_FONDO } from "./tema-colores.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** El `--bg` que declara el CSS para un tema. */
function bgDelCss(selector: RegExp): string {
  const bloque = selector.exec(css);
  assert.ok(bloque, `no se encontró el bloque ${selector}`);
  const bg = /--bg:\s*(#[0-9A-Fa-f]{6})/.exec(bloque![0]);
  assert.ok(bg, `el bloque no declara --bg`);
  return bg![1].toUpperCase();
}

test("el color de barra coincide con --bg en los dos temas", () => {
  assert.equal(COLOR_FONDO.light, bgDelCss(/:root\{[\s\S]*?\}/));
  assert.equal(COLOR_FONDO.dark, bgDelCss(/\[data-theme="dark"\]\{[\s\S]*?\}/));
});

test("los dos temas declaran un color y son distintos entre sí", () => {
  for (const t of ["light", "dark"] as const) {
    assert.match(COLOR_FONDO[t], /^#[0-9A-F]{6}$/, `${t} no es un hex de 6 dígitos`);
  }
  assert.notEqual(COLOR_FONDO.light, COLOR_FONDO.dark);
});

test("nadie vuelve a escribir el color a mano", () => {
  // El bug fue una copia. Si aparece otra en cualquiera de los cuatro lugares
  // que necesitan el color, vuelve a poder desincronizarse.
  for (const rel of ["../components/ThemeContext.tsx", "../app/layout.tsx", "../app/manifest.ts"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    const hex = [...src.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase());
    assert.deepEqual(hex, [], `${rel} tiene colores a mano: ${hex.join(", ")}`);
    assert.match(src, /COLOR_FONDO/, `${rel} no usa la fuente única`);
  }
});

test("el script que corre antes de hidratar también arregla las metas", () => {
  // 🔴 EL SEGUNDO DEFECTO. Las metas `theme-color` llevan `media`, así que hasta
  // que React hidrata siguen a `prefers-color-scheme` y NO al tema elegido. Con
  // el sistema en oscuro y la app en claro, la barra arrancaba negra sobre una
  // app blanca en cada arranque en frío.
  //
  // El script inline ya ponía `data-theme`; tiene que poner el color también.
  // Puede hacerlo porque Next emite las metas ANTES del script (verificado en
  // el HTML servido: metas en 5062 y 5144, script en 5966).
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const script = /const THEME_INIT_SCRIPT = `([\s\S]*?)`;/.exec(layout);
  assert.ok(script, "no se encontró el script de arranque");
  assert.match(script![1], /theme-color/,
    "el script no toca las metas: la barra sigue al sistema hasta que hidrata");
  assert.match(script![1], /data-theme/, "dejó de fijar el tema");
});
