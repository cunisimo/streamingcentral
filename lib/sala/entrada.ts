// ¿Se muestra la entrada a las salas? Client-safe.
//
// Es la capa del CLIENTE del kill switch, y es la más débil de las tres: sólo
// oculta el botón. `NEXT_PUBLIC_SALAS_ACTIVAS=0` se inlinea en build, así que
// cambiarla en Vercel se aplica con el siguiente deployment. Las que impiden de
// verdad son `SALAS_ACTIVAS=0` en el servidor (503 en /api/sala/preparar) y
// `sala_config.activas` en la base (sala_crear / sala_unirse rechazan).
//
// 🔴 YA NO DEPENDE DE `ES_NATIVO` (decisión del dueño, 27/09). Hasta entonces la
// entrada no se dibujaba en el contenedor porque `/sala/[id]` rompía el export
// estático y un enlace de sala terminaba abriéndose en Chrome. Las dos cosas se
// resolvieron: adentro de la app la sala se muestra en `/s/?id=<uuid>`
// (`hrefSala`) y el segmento dinámico se excluye del artefacto, no la carpeta
// entera — `/sala/nueva` sigue viajando.
export const SALAS_VISIBLES: boolean = process.env.NEXT_PUBLIC_SALAS_ACTIVAS !== "0";

// 🔴 LA BAJADA ("Cada uno vota en su teléfono. Sale una sola película.") SE VE
// SÓLO EN UN NAVEGADOR DE ESCRITORIO (decisión del dueño, 28/09). En el teléfono
// —navegador, PWA instalada o la app Android— la persona ya está en el teléfono
// y la frase no le agrega nada.
//
// Se decide con CSS y no con JavaScript, a propósito: la condición se evalúa
// ANTES de hidratar, así que no hay un frame con la bajada que después se va (ni
// al revés), y el banner no salta de alto (CLS, issue #1). La media query:
//   display-mode: browser → una pestaña normal: NO standalone / minimal-ui / fullscreen
//   hover: hover + pointer: fine → el puntero principal es un mouse: NO un teléfono
// La app Android ni siquiera la dibuja (`ES_NATIVO`, bandera de build), así que
// ahí no depende del tamaño de pantalla ni del WebView.
export const MEDIA_ESCRITORIO = "(display-mode: browser) and (hover: hover) and (pointer: fine)";

/** Lo mismo que decide el CSS, en una función pura para probar los casos. */
export function bajadaVisible(ctx: { nativo: boolean; displayModeBrowser: boolean; hover: boolean; punteroFino: boolean }): boolean {
  if (ctx.nativo) return false;
  return ctx.displayModeBrowser && ctx.hover && ctx.punteroFino;
}
