// La pantalla de inicio de Android muestra la marca COMPLETA, no el símbolo solo.
//
// ============================================================================
// QUÉ PASABA, Y POR QUÉ ESTOS GUARDS
// ============================================================================
// Medido en el teléfono el 2026-09-06: al abrir la app aparecía el ÍCONO DEL
// LANZADOR —el símbolo suelto— recortado en un cuadrado de bordes duros, y la
// pantalla con la palabra "yump" no salía nunca.
//
// La causa: con `targetSdk 36` la pantalla de inicio la maneja la SplashScreen
// API, que **no mira `android:background`**. Usa `windowSplashScreenBackground` y
// `windowSplashScreenAnimatedIcon`; ninguno estaba declarado, así que Android
// caía a su default, que es el ícono de la aplicación.
//
// 🔴 LOS 44 `splash.png` SIGUEN SIENDO PESO MUERTO EN ANDROID 12+, y no se
// borran: `minSdk` es 24 y en Android 11 y anteriores el camino viejo todavía
// puede usarse. Sacarlos pediría evidencia sobre todo el rango, que no se tiene.
//
// ============================================================================
// 🔴 EL TAMAÑO DEL LOGO NO ES DECORATIVO: ES LO QUE EVITA QUE LO RECORTEN
// ============================================================================
// La ranura del ícono del sistema es un lienzo de 288dp del que sólo se ve un
// CÍRCULO de 192dp (66,7%), y Android enmascara. El bloque de marca es casi
// cuadrado, así que su diagonal manda: para entrar entero en ese círculo su
// ancho no puede pasar de 0,667 / 1,44 = **46% del lienzo**. Con ese número
// entra completo y legible —verificado cuadro por cuadro en el teléfono, en
// claro y en oscuro—; más grande, la máscara le come las letras.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const RES = path.join(raiz, "android", "app", "src", "main", "res");
const leer = (p: string) => fs.readFileSync(path.join(RES, p), "utf8");
const existe = (p: string) => fs.existsSync(path.join(RES, p));

/**
 * El XML sin comentarios.
 *
 * Los temas EXPLICAN por qué no declaran ciertos atributos, y un guard que
 * busque esos nombres se dispara con su propia explicación. Ya pasó cuatro veces
 * en este repo; por eso los guards de contenido leen siempre esta versión.
 */
const sinComentarios = (p: string) => leer(p).replace(/<!--[\s\S]*?-->/g, "");

/** Ancho y alto de un PNG, leídos de la cabecera IHDR. */
function tamano(p: string): { w: number; h: number } {
  const b = fs.readFileSync(path.join(RES, p));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ------------------------------------------------- 1. el tema del arranque

test("existe un tema de arranque para Android 12+ (values-v31)", () => {
  // Sin esto, Android ignora todo lo demás y vuelve a poner el ícono suelto.
  assert.ok(existe("values-v31/styles.xml"),
    "falta values-v31/styles.xml: Android 12+ volvería a mostrar el símbolo solo");
  assert.ok(existe("values-night-v31/styles.xml"),
    "falta la variante oscura del tema de arranque");
});

test("el tema declara los DOS atributos que la SplashScreen API sí mira", () => {
  for (const f of ["values-v31/styles.xml", "values-night-v31/styles.xml"]) {
    const x = sinComentarios(f);
    assert.match(x, /windowSplashScreenBackground/, `${f} no declara el fondo del arranque`);
    assert.match(x, /windowSplashScreenAnimatedIcon/, `${f} no declara la imagen del arranque`);
    assert.match(x, /postSplashScreenTheme/, `${f} no declara el tema al que se sale`);
    // La imagen tiene que ser la marca completa, no el ícono del lanzador.
    assert.match(x, /@drawable\/splash_logo/, `${f} no apunta al logotipo completo`);
    assert.doesNotMatch(x, /windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher/,
      `${f} volvió a usar el ícono del lanzador, que es el símbolo solo`);
  }
});

test("no se usa windowSplashScreenBrandingImage", () => {
  // Android la desaconseja y la pone ABAJO, no centrada: serviría para decir que
  // "yump aparece" sin que la marca esté donde tiene que estar.
  for (const f of ["values-v31/styles.xml", "values-night-v31/styles.xml"]) {
    assert.doesNotMatch(sinComentarios(f), /BrandingImage/, `${f} usa la imagen de branding`);
  }
});

test("no se agregó una demora artificial para exhibir la marca", () => {
  // `windowSplashScreenAnimationDuration` sólo alarga la pantalla: el arranque no
  // se frena para lucir el logo.
  for (const f of ["values-v31/styles.xml", "values-night-v31/styles.xml"]) {
    assert.doesNotMatch(sinComentarios(f), /AnimationDuration/, `${f} alarga el arranque a propósito`);
  }
});

// ------------------------------------------- 2. el hueco entre fases

test("el fondo de la ventana coincide con el del arranque, en los dos temas", () => {
  // Entre que la pantalla de inicio se va y la WebView pinta hay un hueco. Si ese
  // hueco no es del mismo color, se ve un destello.
  const x = sinComentarios("values/styles.xml");
  assert.match(x, /AppTheme\.NoActionBar"[\s\S]*?windowBackground">@color\/splash_bg/,
    "el tema de la app no fija windowBackground al color del arranque: puede haber destello");
  for (const f of ["values/colors_splash.xml", "values-night/colors_splash.xml"]) {
    assert.ok(existe(f), `falta ${f}`);
    assert.match(leer(f), /name="splash_bg"/, `${f} no declara splash_bg`);
  }
});

test("los colores del arranque son los de la marca", () => {
  assert.match(leer("values/colors_splash.xml"), /#FAFAFD/i, "el claro no es --bg claro");
  assert.match(leer("values-night/colors_splash.xml"), /#0F0E13/i, "el oscuro no es --bg oscuro");
});

// ----------------------------------------------- 3. el recurso del logo

test("el logotipo del arranque existe en claro y en oscuro", () => {
  assert.ok(existe("drawable/splash_logo.png"), "falta el logotipo claro");
  assert.ok(existe("drawable-night/splash_logo.png"), "falta el logotipo oscuro");
});

test("🔴 el logo entra en el círculo que Android deja ver", () => {
  // El lienzo tiene que ser cuadrado, y la marca ocupar como mucho el 46% de su
  // ancho. Si crece, la máscara circular le corta las letras.
  for (const f of ["drawable/splash_logo.png", "drawable-night/splash_logo.png"]) {
    const { w, h } = tamano(f);
    assert.equal(w, h, `${f} no es cuadrado: la ranura del sistema lo es`);
    assert.ok(w >= 960, `${f} mide ${w}px: poco para 288dp en pantallas densas`);
  }
});

// --------------------------------- 4. lo que NO se puede haber roto

test("el ícono del lanzador sigue siendo el símbolo, no el logotipo", () => {
  // El dueño aprobó el ícono SIN la palabra. Que el arranque la lleve no puede
  // arrastrar al lanzador: a 48px "yump" es una mancha.
  const x = sinComentarios("mipmap-anydpi-v26/ic_launcher.xml");
  assert.match(x, /@mipmap\/ic_launcher_foreground/, "cambió el foreground del ícono");
  assert.match(x, /<monochrome/, "se perdió la capa monocromática");
  assert.doesNotMatch(x, /splash_logo/, "el ícono del lanzador quedó apuntando al logotipo");
});

test("el tema de arranque viejo sigue existiendo para Android 11 y anteriores", () => {
  // `minSdk` es 24. El camino viejo no se borra sin evidencia sobre todo el rango.
  const x = leer("values/styles.xml");
  assert.match(x, /AppTheme\.NoActionBarLaunch/, "desapareció el tema de arranque base");
  assert.ok(existe("drawable/splash.png"), "se borró el splash heredado sin evidencia");
});
