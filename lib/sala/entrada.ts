// ¿Se muestra la entrada a las salas? Client-safe.
//
// Es la capa del CLIENTE del kill switch, y es la más débil de las tres: sólo
// oculta el botón. `NEXT_PUBLIC_SALAS_ACTIVAS=0` se inlinea en build, así que
// cambiarla en Vercel se aplica con el siguiente deployment. Las que impiden de
// verdad son `SALAS_ACTIVAS=0` en el servidor (503 en /api/sala/preparar) y
// `sala_config.activas` en la base (sala_crear / sala_unirse rechazan).
//
// En el build nativo la entrada no se dibuja: el MVP es web/PWA (decisión del
// dueño). La ruta `/sala/[id]` es dinámica y queda fuera del export estático
// (Tarea 6.1); un enlace a una sala se abre en el navegador.
import { ES_NATIVO } from "../plataforma";

export const SALAS_VISIBLES: boolean = !ES_NATIVO && process.env.NEXT_PUBLIC_SALAS_ACTIVAS !== "0";
