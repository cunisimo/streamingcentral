// Lista canónica de dispositivos Apple para los splash screens.
// Fuente ÚNICA: la usan tanto el generador de imágenes
// (generate-pwa-assets.mjs) como el componente de <link>
// (components/pwa/AppleSplashLinks.tsx, que se genera desde acá).
// Si las dos listas se desincronizan, el splash no aparece y iOS cae a pantalla
// blanca (riesgo conocido). Por eso hay una sola.
//
// cssW/cssH: puntos CSS en portrait. dpr: device-pixel-ratio.
// Dimensiones reales del PNG = cssW*dpr × cssH*dpr.

export const SPLASH_BG = "#F5F5F2"; // = --bg (tema claro). Los splash de iOS no
                                    // adaptan a modo oscuro; se usa el claro.
export const LOGO_RATIO = 0.32;     // el logo ocupa 32% del lado menor

export const DEVICES = [
  { name: "iPhone SE / 8 / 7 / 6s",              cssW: 375,  cssH: 667,  dpr: 2 },
  { name: "iPhone 8/7/6s Plus",                  cssW: 414,  cssH: 736,  dpr: 3 },
  { name: "iPhone X / XS / 11 Pro",              cssW: 375,  cssH: 812,  dpr: 3 },
  { name: "iPhone XR / 11",                      cssW: 414,  cssH: 896,  dpr: 2 },
  { name: "iPhone XS Max / 11 Pro Max",          cssW: 414,  cssH: 896,  dpr: 3 },
  { name: "iPhone 12/13 mini",                   cssW: 360,  cssH: 780,  dpr: 3 },
  { name: "iPhone 12/13/14",                     cssW: 390,  cssH: 844,  dpr: 3 },
  { name: "iPhone 12/13 Pro Max / 14 Plus",      cssW: 428,  cssH: 926,  dpr: 3 },
  { name: "iPhone 14 Pro / 15 / 16",             cssW: 393,  cssH: 852,  dpr: 3 },
  { name: "iPhone 14 Pro Max / 15 Plus / 16 Plus", cssW: 430, cssH: 932, dpr: 3 },
  { name: "iPhone 16 Pro",                       cssW: 402,  cssH: 874,  dpr: 3 },
  { name: "iPhone 16 Pro Max",                   cssW: 440,  cssH: 956,  dpr: 3 },
  { name: "iPad mini / Air / 9.7",               cssW: 768,  cssH: 1024, dpr: 2 },
  { name: "iPad 10.2",                           cssW: 810,  cssH: 1080, dpr: 2 },
  { name: "iPad Air 10.5",                       cssW: 834,  cssH: 1112, dpr: 2 },
  { name: "iPad Pro 11 / Air 10.9",              cssW: 834,  cssH: 1194, dpr: 2 },
  { name: "iPad Pro 12.9",                       cssW: 1024, cssH: 1366, dpr: 2 },
  { name: "iPad 10.9 (10ª gen)",                 cssW: 820,  cssH: 1180, dpr: 2 },
];

// Nombre de archivo del splash de un dispositivo. Mismo criterio en el generador
// y en el componente de <link>.
export function splashFile(d) {
  return `splash-${d.cssW}x${d.cssH}@${d.dpr}x.png`;
}

// Media query exacta que iOS usa para elegir el splash. Un valor equivocado
// hace que la imagen no se muestre.
export function splashMedia(d) {
  return `(device-width: ${d.cssW}px) and (device-height: ${d.cssH}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`;
}
