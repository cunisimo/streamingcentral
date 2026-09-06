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
import sharp from "sharp";

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

// ============================================================================
// LA GEOMETRÍA DEL PNG, MEDIDA — NO LA CONSTANTE DEL GENERADOR
// ============================================================================
// 🔴 ESTE ARCHIVO YA TUVO UN TEST QUE NO PROBABA NADA. Comprobaba que el PNG
// fuera cuadrado y midiera al menos 960px, y con eso decía "el logo entra en el
// círculo". No era cierto: el contenido podía crecer hasta que Android lo
// recortara y el test seguía pasando. Lo que Android muestra es el PNG, así que
// es el PNG lo que hay que medir — no `PARTE_VISIBLE = 0.46`, que es la
// intención del generador, ni el texto del código, que es una promesa.

/** Qué se ve de verdad dentro del lienzo, en píxeles. */
interface Geometria {
  lado: number;          // el lienzo es cuadrado
  ancho: number;         // caja del contenido visible
  alto: number;
  desvio: number;        // cuánto se corrió el centro del contenido del centro del lienzo
  radioMax: number;      // del centro del LIENZO al píxel visible más lejano
  radioSeguro: number;   // 192dp sobre 288dp -> el lienzo dividido 3
  visibles: number;
}

/**
 * 🔴 UMBRAL DE ALFA = 0: cuenta TODO píxel con algo de opacidad, por tenue que
 * sea. Es la lectura más estricta posible, y por eso no hace falta ninguna
 * tolerancia por antialiasing sobre el radio.
 *
 * No es una elección a ojo: se midió el archivo real con umbrales 0, 1, 4, 8,
 * 16, 32, 64 y 128, y el radio máximo se mueve entre 351,72 y 349,52 px — **2,2
 * px de diferencia, un 0,6%**. O sea que el resultado no depende del número. Se
 * toma 0 porque es el que no puede favorecer al test.
 */
const UMBRAL_ALFA = 0;

/** Mide un PNG en memoria. La usan tanto los archivos reales como los canarios. */
async function medir(buf: Buffer): Promise<Geometria> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = info.width;
  const centro = (N - 1) / 2;
  let x0 = N, y0 = N, x1 = -1, y1 = -1, radioMax = 0, visibles = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < N; x++) {
      if (data[(y * N + x) * info.channels + 3] <= UMBRAL_ALFA) continue;
      visibles++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const r = Math.hypot(x - centro, y - centro);
      if (r > radioMax) radioMax = r;
    }
  }
  if (visibles === 0) {
    return { lado: N, ancho: 0, alto: 0, desvio: 0, radioMax: 0, radioSeguro: N / 3, visibles: 0 };
  }
  return {
    lado: N,
    ancho: x1 - x0 + 1,
    alto: y1 - y0 + 1,
    desvio: Math.hypot((x0 + x1) / 2 - centro, (y0 + y1) / 2 - centro),
    radioMax,
    // La ranura del sistema es un lienzo de 288dp con un círculo visible de
    // 192dp: el radio seguro es 192/2 sobre 288, o sea el lado dividido 3.
    radioSeguro: N / 3,
    visibles,
  };
}

/** Cuánto del lienzo ocupa la marca, aprobado ~45,5%. */
const OCUPACION_MIN = 0.40;
const OCUPACION_MAX = 0.50;

/**
 * Tolerancia de centrado: **1 píxel**.
 *
 * El generador compone con `gravity: "centre"`, que usa un desplazamiento
 * ENTERO. Si el ancho redimensionado es impar, el centro queda medio píxel
 * corrido; 1px cubre ese caso con holgura y sigue fallando ante un descentrado
 * de verdad. Medido en los archivos reales: 0,00 px.
 */
const TOLERANCIA_CENTRO = 1;

/** Los incumplimientos de una geometría. Vacío = cumple. */
function problemas(g: Geometria): string[] {
  const p: string[] = [];
  if (g.visibles === 0) p.push("no hay nada visible");
  if (g.radioMax > g.radioSeguro) {
    p.push(`sale del círculo seguro: radio ${g.radioMax.toFixed(1)} > ${g.radioSeguro.toFixed(1)}`);
  }
  if (g.desvio > TOLERANCIA_CENTRO) p.push(`descentrado ${g.desvio.toFixed(2)} px`);
  const ocupa = g.ancho / g.lado;
  if (g.visibles > 0 && ocupa < OCUPACION_MIN) p.push(`demasiado chico: ${(ocupa * 100).toFixed(1)}%`);
  if (ocupa > OCUPACION_MAX) p.push(`demasiado grande: ${(ocupa * 100).toFixed(1)}%`);
  return p;
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

test("no se declara una duración de animación: el logo es estático", () => {
  // 🔴 ACÁ HABÍA UNA AFIRMACIÓN TÉCNICA FALSA. Este guard decía que
  // `windowSplashScreenAnimationDuration` "alarga la pantalla", y no es cierto:
  // ese atributo le dice al sistema cuánto dura la ANIMACIÓN del ícono —para un
  // AnimatedVectorDrawable o parecido—, no cuánto tiempo se ve el arranque.
  //
  // Lo que el guard sí fija es una decisión real del proyecto: el logo de Yump
  // es un PNG estático, así que no hay animación que temporizar y declarar una
  // duración sería ruido. Nada más que eso.
  for (const f of ["values-v31/styles.xml", "values-night-v31/styles.xml"]) {
    assert.doesNotMatch(sinComentarios(f), /AnimationDuration/,
      `${f} declara una duración de animación para un logo que no se anima`);
  }
});

test("🔴 la pantalla de inicio no se retiene desde el código", () => {
  // ESTE es el guard que de verdad cubre "sin demora artificial", y es el que
  // faltaba. Lo que alarga el arranque es retener la pantalla con
  // `setKeepOnScreenCondition` (o instalarla a mano con `installSplashScreen`),
  // no un atributo del tema. Hoy `MainActivity` no hace ninguna de las dos: la
  // pantalla dura lo que tarde la app en arrancar.
  const java = fs.readFileSync(
    path.resolve(import.meta.dirname, "..", "android", "app", "src", "main", "java", "ar", "yump", "app", "MainActivity.java"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(java, /setKeepOnScreenCondition/,
    "MainActivity retiene la pantalla de inicio: eso sí es una demora artificial");
  assert.doesNotMatch(java, /installSplashScreen/,
    "MainActivity instala la pantalla a mano: revisar si agrega una espera");
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

test("el lienzo del logo es cuadrado y bastante grande", () => {
  for (const f of ["drawable/splash_logo.png", "drawable-night/splash_logo.png"]) {
    const { w, h } = tamano(f);
    assert.equal(w, h, `${f} no es cuadrado: la ranura del sistema lo es`);
    assert.ok(w >= 960, `${f} mide ${w}px: poco para 288dp en pantallas densas`);
  }
});

test("🔴 el logo entra ENTERO en el círculo que Android deja ver", async () => {
  // Se miden los píxeles, no la constante del generador. Ver el bloque de arriba.
  for (const f of ["drawable/splash_logo.png", "drawable-night/splash_logo.png"]) {
    const g = await medir(fs.readFileSync(path.join(RES, f)));
    assert.deepEqual(problemas(g), [],
      `${f}: ${g.ancho}x${g.alto} px (${(g.ancho / g.lado * 100).toFixed(2)}% del lienzo), ` +
      `radio máximo ${g.radioMax.toFixed(1)} de ${g.radioSeguro.toFixed(1)} seguros, ` +
      `desvío ${g.desvio.toFixed(2)} px`);
  }
});

test("las dos variantes tienen la MISMA geometría", async () => {
  // Si una se moviera sin la otra, el arranque claro y el oscuro dejarían de ser
  // la misma pantalla.
  const [a, b] = await Promise.all([
    medir(fs.readFileSync(path.join(RES, "drawable/splash_logo.png"))),
    medir(fs.readFileSync(path.join(RES, "drawable-night/splash_logo.png"))),
  ]);
  assert.deepEqual(
    { lado: a.lado, ancho: a.ancho, alto: a.alto },
    { lado: b.lado, ancho: b.ancho, alto: b.alto },
    "la variante clara y la oscura no coinciden en tamaño");
});

// --------------------------------------------------------------- canarios
//
// 🔴 UN TEST QUE NUNCA VIO UN ROJO NO PRUEBA NADA. Estos construyen imágenes
// EN MEMORIA que violan cada condición y comprueban que `problemas()` las
// rechaza. No se toca ningún recurso aprobado: las cuatro se sintetizan al
// vuelo desde la misma fuente de marca.

const FUENTE_LOGO = path.resolve(import.meta.dirname, "..", "assets", "brand", "yump-logo.png");
const LADO = 1152;

/** Un lienzo de 1152 con la marca a `escala`, corrida `dx` píxeles. */
async function sintetico(escala: number, dx = 0): Promise<Buffer> {
  const capas = escala > 0
    ? [{
        input: await sharp(FUENTE_LOGO).resize({ width: Math.round(LADO * escala) }).png().toBuffer(),
        gravity: "centre" as const,
        left: undefined as number | undefined,
        top: undefined as number | undefined,
      }]
    : [];
  if (escala > 0 && dx !== 0) {
    const ancho = Math.round(LADO * escala);
    const alto = (await sharp(capas[0].input).metadata()).height!;
    capas[0].gravity = undefined as never;
    capas[0].left = Math.round((LADO - ancho) / 2) + dx;
    capas[0].top = Math.round((LADO - alto) / 2);
  }
  return sharp({ create: { width: LADO, height: LADO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(capas as never).png().toBuffer();
}

test("🐤 canario: un logo MÁS GRANDE se rechaza por salir del círculo", async () => {
  const g = await medir(await sintetico(0.70));
  const p = problemas(g);
  assert.ok(p.length > 0, "un logo al 70% pasó el control");
  assert.ok(p.some((x) => x.includes("círculo")) || p.some((x) => x.includes("grande")),
    `se rechazó por el motivo equivocado: ${p.join(" · ")}`);
});

test("🐤 canario: un logo DESCENTRADO se rechaza", async () => {
  const g = await medir(await sintetico(0.46, 40));
  const p = problemas(g);
  assert.ok(p.some((x) => x.includes("descentrado")), `no detectó el descentrado: ${p.join(" · ")}`);
});

test("🐤 canario: un logo DIMINUTO se rechaza", async () => {
  const g = await medir(await sintetico(0.15));
  const p = problemas(g);
  assert.ok(p.some((x) => x.includes("chico")), `no detectó que era diminuto: ${p.join(" · ")}`);
});

test("🐤 canario: un lienzo VACÍO se rechaza", async () => {
  const g = await medir(await sintetico(0));
  const p = problemas(g);
  assert.ok(p.some((x) => x.includes("nada visible")), `no detectó que estaba vacío: ${p.join(" · ")}`);
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
