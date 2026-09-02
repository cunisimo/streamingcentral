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

test("el script que corre antes de hidratar CREA la meta y fija el tema", () => {
  // Las metas de `viewport.themeColor` llevan `media`, así que siguen a
  // `prefers-color-scheme` y NO al tema elegido. Con el sistema en claro y la
  // app en oscuro, la que aplicaba valía #FAFAFD —casi blanca— desde el parseo
  // hasta el efecto de ThemeContext: 301 ms medidos en escritorio.
  //
  // El script tiene que resolverlo antes del primer pintado, y tiene que
  // CREARLA él (ver el test de abajo).
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const script = /const THEME_INIT_SCRIPT = `([\s\S]*?)`;/.exec(layout);
  assert.ok(script, "no se encontró el script de arranque");
  assert.match(script![1], /theme-color/, "el script no toca la meta");
  assert.match(script![1], /createElement\("meta"\)/,
    "el script no crea la meta: si la rendereara React, React la duplicaría");
  assert.match(script![1], /data-theme/, "dejó de fijar el tema");
});

test("React no renderea ninguna meta theme-color", () => {
  // 🔴 EL DEFECTO QUE ESTE TEST EXISTE PARA IMPEDIR, Y ESTÁ MEDIDO.
  //
  // React administra las metas que rendereа como *hoistable resources*. Si
  // antes de hidratar les cambiás el `content` —que es justo lo que hace el
  // script de arranque—, al hidratar NO adopta el nodo: le agrega una COPIA con
  // el valor original. Con la app en oscuro esa copia queda viva en #FAFAFD,
  // casi blanca, que es el color de la queja original.
  //
  // Se probaron las dos formas de declararla en React y las DOS duplican, sin
  // emitir una sola advertencia:
  //
  //     viewport.themeColor                          -> duplica
  //     <meta ... suppressHydrationWarning /> en JSX -> duplica
  //
  // La única que no duplica es que React no renderee ninguna. Por eso acá se
  // vigilan las dos puertas.
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

  // Se recorta entre los dos `export` en vez de balancear llaves con una
  // expresión regular: si vuelve `themeColor`, vuelve con objetos anidados.
  const desde = layout.indexOf("export const viewport");
  const hasta = layout.indexOf("export const metadata");
  assert.ok(desde >= 0 && hasta > desde, "no se encontró el bloque del viewport");
  assert.doesNotMatch(layout.slice(desde, hasta), /themeColor/,
    "volvió `themeColor` al viewport: React va a duplicar la meta al hidratar");

  for (const rel of ["../app/layout.tsx", "../components/ThemeContext.tsx"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.doesNotMatch(src, /<meta\s+name="theme-color"/,
      `${rel} declara la meta en el JSX: React va a duplicarla al hidratar`);
  }
});

test("el toggle busca la meta y la crea si falta, sin recrear la que hay", () => {
  // `applyTheme` corre en cada cambio de tema. Tiene que mutar LA MISMA meta
  // que creó el script, no agregar otra ni remover la existente.
  const src = readFileSync(new URL("../components/ThemeContext.tsx", import.meta.url), "utf8");
  const desde = src.indexOf("function applyTheme");
  const hasta = src.indexOf("export function ThemeProvider");
  assert.ok(desde >= 0 && hasta > desde, "no se encontró applyTheme");
  const fn = src.slice(desde, hasta);
  assert.match(fn, /querySelector</, "no busca la meta existente");
  assert.match(fn, /createElement\("meta"\)/, "no la crea si falta");
  assert.doesNotMatch(fn, /removeChild|\.remove\(\)/,
    "remover la meta la deja huérfana y rompe el desmontaje");
});
