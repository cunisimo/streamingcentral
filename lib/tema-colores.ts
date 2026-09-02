// El fondo de cada tema, en un solo lugar.
//
// ============================================================================
// POR QUÉ ESTO EXISTE
// ============================================================================
// En la PWA instalada de Android, la barra de estado se pinta con el color de
// `<meta name="theme-color">`. Si ese color no es EXACTAMENTE `--bg`, queda una
// franja arriba de un tono distinto al de la app — y se nota en los dos temas.
//
// El color hacía falta en cuatro lugares: el `viewport` del layout, el script
// que corre antes de hidratar, `ThemeContext` y el manifest. Estaba copiado a
// mano en cada uno, y las copias se desincronizaron:
//
//     claro:  barra #F5F5F2  contra  --bg #FAFAFD   (−5, −5, −11)
//     oscuro: barra #16171B  contra  --bg #0F0E13   (+7, +9, +8)
//
// En claro la franja salía más oscura y en oscuro más clara, que es por qué se
// veía en ambos modos.
//
// 🔴 LA FUENTE DE VERDAD SIGUE SIENDO EL CSS. Este archivo la duplica en TS
// porque el manifest, el viewport y el script inline no pueden leer una
// variable CSS. Lo que impide que vuelva a divergir es
// `lib/tema-colores.test.ts`, que compara estos valores contra el `--bg` de
// `app/globals.css` y falla si alguien toca uno solo de los dos.
export const COLOR_FONDO = {
  light: "#FAFAFD",
  dark: "#0F0E13",
} as const;

export type TemaColor = keyof typeof COLOR_FONDO;
