// Genera los íconos y la pantalla de inicio nativos de Android desde el logo
// oficial. Re-ejecutable: si cambia la marca, esto regenera los 31 archivos.
//
//   node scripts/generate-android-assets.mjs              escribe en android/
//   node scripts/generate-android-assets.mjs --previews X  sólo previews, en X
//
// Requiere la devDependency `sharp`, que el repo ya usa para los assets de la PWA.
//
// ============================================================================
// LA FUENTE
// ============================================================================
// `assets/brand/yump-simbolo.png` y `assets/brand/yump-logo.png`, los archivos
// oficiales que pasó el dueño el 2026-09-06. NO se usa `assets/brand/logo.svg`:
// es un placeholder viejo —un cuadrado naranja liso con un triángulo— que ya no
// representa la marca, aunque `CLAUDE.md` todavía lo llame "fuente única".
//
// ⚠️ ESTO NO TOCA LA PWA. Los íconos y splash de la web salen de
// `scripts/generate-pwa-assets.mjs`, que lee `public/brand/yump-icon.png` y
// sigue igual. Son dos juegos de recursos y dos scripts.
//
// ============================================================================
// 🔴 LA FLECHA ES UN CALADO TRANSPARENTE, NO PINTURA BLANCA
// ============================================================================
// Verificado muestreando píxeles: en el centro de la flecha el alfa es 0. La
// flecha toma el color de lo que haya detrás. Por eso todo se aplana sobre
// blanco antes de componer, y el fondo del ícono adaptativo es blanco. Sobre un
// fondo oscuro sin aplanar, la flecha desaparecería.
//
// ============================================================================
// QUÉ VA EN CADA LADO, Y POR QUÉ NO ES LO MISMO
// ============================================================================
// - ÍCONO DEL LANZADOR: **sólo el símbolo**, sin la palabra "yump". Medido a los
//   tamaños reales: con el texto adentro, a 48px —el tamaño más común en el
//   escritorio— la palabra es una mancha ilegible. Además Android ya escribe
//   "Yump" debajo del ícono, así que el nombre saldría dos veces.
// - PANTALLA DE INICIO: **el bloque completo con "yump"**. Ahí se ve grande, se
//   lee perfecto, y es el único lugar donde la app dice su nombre.
//
// Las dos decisiones las tomó el dueño el 2026-09-06 mirando las previews a
// tamaño real.
//
// ============================================================================
// 🔴 POR QUÉ EL SÍMBOLO NO VA A SANGRE
// ============================================================================
// Se intentó y no funciona: el sistema recorta los 72dp CENTRALES del ícono
// adaptativo ANTES de aplicar la máscara, así que una marca que llega justo al
// borde pierde el 33% exterior — medido, la burbuja desaparecía y quedaba una
// flecha partida. Un ícono de color de borde a borde necesitaría una fuente con
// SANGRADO (el degradado siguiendo más allá de la marca), y estirarlo sería
// inventar marca. Se inserta sobre blanco, que es como el sistema de marca ya la
// muestra.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES = join(RAIZ, "android", "app", "src", "main", "res");
const SIMBOLO = join(RAIZ, "assets", "brand", "yump-simbolo.png");
const LOGO = join(RAIZ, "assets", "brand", "yump-logo.png");
const LOGO_BLANCO = join(RAIZ, "assets", "brand", "yump-logo-blanco.png");

// Colores oficiales, de app/globals.css. No se inventa ninguno.
const BLANCO = "#FFFFFF";
const FONDO_CLARO = "#FAFAFD";   // --bg claro, el mismo SPLASH_BG que usa la PWA
const FONDO_OSCURO = "#0F0E13";  // --bg oscuro

// Lienzo del ícono adaptativo a xxxhdpi: 108dp = 432px.
const LIENZO = 432;
const VISIBLE = Math.round(LIENZO * 72 / 108);      // 288: lo que el sistema muestra
const GARANTIZADO = Math.round(LIENZO * 66 / 108);  // 264: el círculo seguro

// Cuánto del lienzo ocupa el símbolo. 0,50 lo aprobó el dueño mirando la tira de
// 48 a 192px: los vértices redondeados quedan justo en el borde del círculo, que
// es lo que da el aspecto lleno de las piezas de marca.
const ESCALA = 0.50;

// El logo con "yump" ocupa el 34% del lado menor del splash: la misma proporción
// que `LOGO_RATIO` en scripts/pwa-devices.mjs, para que la web y la app arranquen
// igual.
const RATIO_SPLASH = 0.34;

// La ranura del ícono de la SplashScreen API: 288dp a xxxhdpi = 1152px, con un
// círculo visible de 192dp. `PARTE_VISIBLE` es el tope que entra sin recorte.
const LIENZO_SPLASH = 1152;
const PARTE_VISIBLE = 0.46;

const DENSIDADES = [
  ["mdpi", 48, 108, 320, 480],
  ["hdpi", 72, 162, 480, 800],
  ["xhdpi", 96, 216, 720, 1280],
  ["xxhdpi", 144, 324, 960, 1600],
  ["xxxhdpi", 192, 432, 1280, 1920],
];

const hex = (h) => ({
  r: parseInt(h.slice(1, 3), 16),
  g: parseInt(h.slice(3, 5), 16),
  b: parseInt(h.slice(5, 7), 16),
  alpha: 1,
});

const lienzo = (ancho, alto, color) =>
  sharp({ create: { width: ancho, height: alto, channels: 4, background: color ? hex(color) : { r: 0, g: 0, b: 0, alpha: 0 } } });

/** La capa de primer plano del ícono adaptativo: transparente, con el símbolo centrado. */
async function primerPlano(lado = LIENZO) {
  const m = await sharp(SIMBOLO)
    .flatten({ background: hex(BLANCO) })
    .resize({ width: Math.round(lado * ESCALA) })
    .png().toBuffer();
  return lienzo(lado, lado).composite([{ input: m, gravity: "centre" }]).png().toBuffer();
}

/**
 * La capa monocromática (Android 13+, íconos tematizados).
 *
 * El sistema usa SÓLO el alfa y lo tiñe con el color del tema. Como la flecha ya
 * es un calado en la fuente, la silueta sale sola: burbuja llena con la flecha
 * vaciada. No se dibuja nada nuevo.
 */
async function monocromo(lado = LIENZO) {
  const { data, info } = await sharp(SIMBOLO)
    .resize({ width: Math.round(lado * ESCALA) })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const negro = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    negro[i * 4 + 3] = data[i * info.channels + 3];   // sólo el alfa; el RGB queda en 0
  }
  const pieza = await sharp(negro, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return lienzo(lado, lado).composite([{ input: pieza, gravity: "centre" }]).png().toBuffer();
}

/**
 * El ícono heredado (pre-Android 8): fondo blanco + símbolo, ya enmascarado,
 * porque ahí no hay capas ni máscara del sistema.
 *
 * Se compone en el lienzo de 432, se recortan los 72dp centrales —igual que hace
 * el sistema con el adaptativo— y recién ahí se enmascara y se escala. Saltearse
 * el recorte daría un ícono con más aire que el adaptativo, y los dos conviven en
 * la misma pantalla.
 */
async function heredado(lado, forma) {
  const completo = await lienzo(LIENZO, LIENZO, BLANCO)
    .composite([{ input: await primerPlano(), gravity: "centre" }]).png().toBuffer();
  const off = Math.round((LIENZO - VISIBLE) / 2);
  const recortado = await sharp(completo)
    .extract({ left: off, top: off, width: VISIBLE, height: VISIBLE })
    .resize(lado, lado).png().toBuffer();
  const r = forma === "circulo" ? lado / 2 : Math.round(lado * 0.22);
  const mascara = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}">` +
    `<rect width="${lado}" height="${lado}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  return sharp(recortado).composite([{ input: mascara, blend: "dest-in" }]).png().toBuffer();
}

/**
 * El logotipo de la PANTALLA DE INICIO, para la SplashScreen API de Android 12+.
 *
 * 🔴 EL 46% NO ES DECORATIVO: ES LO QUE EVITA QUE ANDROID LO RECORTE. La ranura
 * del ícono del sistema es un lienzo de 288dp del que sólo se ve un CÍRCULO de
 * 192dp (66,7%), y enmascara. El bloque de marca es casi cuadrado, así que manda
 * su diagonal: para entrar entero, su ancho no puede pasar de 0,667 / 1,44 =
 * 46% del lienzo. Verificado cuadro por cuadro en el teléfono, en claro y en
 * oscuro: entra completo y se lee.
 *
 * ⚠️ Acá SÍ va la palabra "yump", al revés que en el ícono del lanzador. En el
 * arranque la marca se ve grande y es el único lugar donde la app se presenta;
 * en el lanzador, a 48px, esa misma palabra es una mancha y Android ya escribe
 * el nombre debajo.
 */
async function logoDeArranque(oscuro) {
  const marca = await sharp(oscuro ? LOGO_BLANCO : LOGO)
    .resize({ width: Math.round(LIENZO_SPLASH * PARTE_VISIBLE) })
    .png().toBuffer();
  return lienzo(LIENZO_SPLASH, LIENZO_SPLASH)
    .composite([{ input: marca, gravity: "centre" }]).png().toBuffer();
}

/** La pantalla de inicio: el bloque con "yump" centrado sobre el fondo de marca. */
async function splash(ancho, alto, oscuro) {
  const fondo = oscuro ? FONDO_OSCURO : FONDO_CLARO;
  const fuente = oscuro ? LOGO_BLANCO : LOGO;
  const lado = Math.round(Math.min(ancho, alto) * RATIO_SPLASH);
  const m = await sharp(fuente).flatten({ background: hex(fondo) }).resize({ width: lado }).png().toBuffer();
  return lienzo(ancho, alto, fondo).composite([{ input: m, gravity: "centre" }]).png().toBuffer();
}

const ADAPTATIVO = (round) =>
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por scripts/generate-android-assets.mjs. No editar a mano. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <!-- Android 13+: el sistema tiñe SÓLO el alfa de esta capa con el color del
         tema del usuario. La silueta sale del calado de la flecha. -->
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;

async function main() {
  const iPrev = process.argv.indexOf("--previews");
  const soloPreviews = iPrev >= 0;
  const destino = soloPreviews ? process.argv[iPrev + 1] : RES;
  if (soloPreviews && !destino) { console.error("falta la carpeta de previews"); process.exit(1); }

  let n = 0;
  const escribir = async (rel, buf) => {
    const p = join(destino, soloPreviews ? rel.split("/").join("_") : rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, buf);
    n++;
  };

  for (const [d, ico, fg, sw, sh] of DENSIDADES) {
    await escribir(`mipmap-${d}/ic_launcher.png`, await heredado(ico, "redondeado"));
    await escribir(`mipmap-${d}/ic_launcher_round.png`, await heredado(ico, "circulo"));
    await escribir(`mipmap-${d}/ic_launcher_foreground.png`, await primerPlano(fg));
    await escribir(`mipmap-${d}/ic_launcher_monochrome.png`, await monocromo(fg));
    await escribir(`drawable-port-${d}/splash.png`, await splash(sw, sh, false));
    await escribir(`drawable-land-${d}/splash.png`, await splash(sh, sw, false));
    await escribir(`drawable-port-night-${d}/splash.png`, await splash(sw, sh, true));
    await escribir(`drawable-land-night-${d}/splash.png`, await splash(sh, sw, true));
  }
  // El logotipo del arranque de Android 12+. Uno solo por tema: la SplashScreen
  // API escala sola, no necesita una copia por densidad.
  await escribir("drawable/splash_logo.png", await logoDeArranque(false));
  await escribir("drawable-night/splash_logo.png", await logoDeArranque(true));

  // El fallback sin densidad: la plantilla lo trae en 480×320.
  await escribir("drawable/splash.png", await splash(480, 320, false));
  await escribir("drawable-night/splash.png", await splash(480, 320, true));

  if (!soloPreviews) {
    await escribir("mipmap-anydpi-v26/ic_launcher.xml", Buffer.from(ADAPTATIVO(false), "utf8"));
    await escribir("mipmap-anydpi-v26/ic_launcher_round.xml", Buffer.from(ADAPTATIVO(true), "utf8"));
  }

  console.log(`· ${n} archivos en ${soloPreviews ? destino : "android/app/src/main/res"}`);
  console.log(`· símbolo al ${Math.round(ESCALA * 100)}% · fondo ${BLANCO} · splash ${FONDO_CLARO} / ${FONDO_OSCURO}`);
  console.log(`· zona visible ${VISIBLE} de ${LIENZO} · círculo garantizado ${GARANTIZADO}`);
}

main();
