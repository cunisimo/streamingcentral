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
