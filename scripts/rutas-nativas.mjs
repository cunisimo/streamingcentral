// Recuperación de rutas directas dentro del contenedor Android.
//
// ============================================================================
// EL PROBLEMA
// ============================================================================
// El servidor local de Capacitor sirve el `index.html` RAÍZ para cualquier ruta
// cuyo último segmento no tenga un punto, sin comprobar si existe el suyo
// (`WebViewLocalServer.handleLocalRequest`). Abrir `/top/` directamente cargaba
// el Home con la barra de direcciones diciendo `/top/`, y recargar en una ficha
// perdía la ficha.
//
// 🔴 YA SE INTENTÓ ARREGLARLO DEL LADO NATIVO Y NO SE PUEDE. Un `RouteProcessor`
// propio con `html5mode` apagado —todo API pública— deja las rutas sin punto sin
// NINGUNA respuesta, porque `handleLocalRequest` decide si responde antes de
// llamar al `PathHandler` y termina en `return null`. Medido el 2026-09-06: seis
// de siete rutas obligatorias daban `Failed to fetch`. Ver el plan de Etapa 3.
//
// ============================================================================
// CÓMO FUNCIONA ESTA SOLUCIÓN
// ============================================================================
// Un script que corre en el `<head>`, ANTES que cualquier script de Next, en dos
// fases:
//
//   FASE 1 (llega el Home donde debía llegar otra página)
//     `/top/?x=1#y`  →  location.replace("/top/index.html?x=1#y")
//     El servidor SÍ resuelve las rutas con punto, así que ese archivo llega
//     bien. `replace` y no `assign`: no deja una entrada de más en el historial.
//
//   FASE 2 (ya llegó el documento correcto)
//     `/top/index.html?x=1#y`  →  history.replaceState(…, "/top/?x=1#y")
//     Limpia la URL antes de que Next hidrate, así que `usePathname()` lee
//     `/top/` y la pestaña de la barra inferior se marca sola.
//
// Las dos fases juntas cuestan UNA navegación extra y sólo en la apertura
// directa. El arranque normal —`/`— sale por la primera regla sin hacer nada.
//
// ============================================================================
// 🔴 POR QUÉ NO HAY UNA LISTA DE RUTAS ESCRITA A MANO
// ============================================================================
// La lista sale de RECORRER EL ARTEFACTO ya exportado, buscando los directorios
// que de verdad tienen un `index.html`. No hay un segundo inventario que se
// pueda desincronizar: si mañana aparece o desaparece una ruta, la lista cambia
// sola en el mismo build.
//
// Y es una lista BLANCA, que es lo que hace innecesario sanear la ruta: lo que
// no está en el artefacto no se reescribe, se manda al 404. El rechazo explícito
// de `..`, `\` y `%` está igual, y va ANTES de la regla que deja pasar los
// archivos con extensión, que es el único camino que no consulta la lista.
//
// ============================================================================
// ⚠️ LA WEB NO SE ENTERA DE NADA DE ESTO
// ============================================================================
// El script lo inyecta `build-capacitor.mjs` en el artefacto nativo, después del
// export. No pasa por `app/layout.tsx` ni por ningún bundle, así que el build
// web no puede incluirlo ni por accidente.

/** Marca del documento ya recuperado. */
const SUFIJO = "/index.html";

/** El documento local de "no encontrado" que genera el export de Next. */
export const PAGINA_404 = "/404.html";

/**
 * Qué hay que hacer al arrancar en `pathname`.
 *
 * Devuelve una de tres acciones:
 *   - `{ tipo: "nada" }`      arranque normal, o un archivo real: no se toca.
 *   - `{ tipo: "ir", destino }`     `location.replace(destino)`.
 *   - `{ tipo: "limpiar", url }`    `history.replaceState(null, "", url)`.
 *
 * `rutas` son los directorios del artefacto que tienen `index.html`, con barra
 * al principio y al final (`"/top/"`), sin la raíz.
 *
 * El ORDEN de las reglas es el único correcto:
 *   1. el rechazo de rutas peligrosas, ANTES QUE TODO;
 *   2. la vuelta (`…/index.html`), que es la marca de que ya se saltó — es lo
 *      que hace imposible el bucle;
 *   3. la raíz, que es el 99% de los arranques;
 *   4. la lista blanca;
 *   5. los archivos con extensión, intactos;
 *   6. todo lo demás, el 404 local.
 *
 * 🔴 EL RECHAZO VA PRIMERO Y ESO NO ES PRUDENCIA, ES UN BUG QUE YA PASÓ. Estaba
 * tercero, después de la regla de la vuelta, y `/top/./index.html` TERMINA en
 * `/index.html`: entraba por ahí y salía como `{limpiar, "/top/./"}`, o sea que
 * un traversal se colaba a la barra de direcciones. Un test lo agarró.
 */
export function accionDeArranque(pathname, search, hash, rutas) {
  const p = typeof pathname === "string" ? pathname : "";
  const q = typeof search === "string" ? search : "";
  const h = typeof hash === "string" ? hash : "";

  // 1. Nada que pueda salirse del artefacto o venga codificado dos veces.
  if (esPeligrosa(p)) return { tipo: "ir", destino: PAGINA_404 };

  // 2. Ya estamos en el documento bueno: sólo hay que limpiar la URL.
  if (p.length > SUFIJO.length && p.slice(-SUFIJO.length) === SUFIJO) {
    return { tipo: "limpiar", url: p.slice(0, p.length - "index.html".length) + q + h };
  }

  // 3. Arranque normal.
  if (p === "" || p === "/") return { tipo: "nada" };

  // 4. Lista blanca, sacada del artefacto.
  const conBarra = p.charAt(p.length - 1) === "/" ? p : p + "/";
  if (rutas.indexOf(conBarra) >= 0) {
    return { tipo: "ir", destino: conBarra + "index.html" + q + h };
  }

  // 5. Un archivo real (tiene extensión): no es una ruta y no se toca. Acá cae
  //    también `/404.html`, que es lo que evita el rebote sobre sí mismo.
  if (tieneExtension(p)) return { tipo: "nada" };

  // 6. No existe.
  return { tipo: "ir", destino: PAGINA_404 };
}

/**
 * ¿La ruta puede escaparse del artefacto o esconde una segunda codificación?
 *
 * No intenta arreglar nada: sólo dice que no. El navegador ya normaliza los
 * `..` antes de pedir, así que esto es el cinturón sobre el tirante, y cubre el
 * caso en que la ruta llegue por otra vía. Nunca se decodifica: un `%` que
 * sobreviva significa que venía doble.
 */
function esPeligrosa(p) {
  if (p.indexOf("\\") >= 0) return true;
  if (p.indexOf("%") >= 0) return true;
  const seg = p.split("/");
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === ".." || seg[i] === ".") return true;
  }
  return false;
}

/** ¿El último segmento tiene extensión? */
function tieneExtension(p) {
  const sinBarra = p.charAt(p.length - 1) === "/" ? p.slice(0, -1) : p;
  const i = sinBarra.lastIndexOf("/");
  return (i >= 0 ? sinBarra.slice(i + 1) : sinBarra).indexOf(".") >= 0;
}

/**
 * El `<script>` que se inyecta en el artefacto.
 *
 * 🔴 EMBEBE LAS FUNCIONES DE ARRIBA CON `toString()`, no una copia escrita a
 * mano. Lo que corre en el teléfono es EXACTAMENTE lo que prueban los tests; una
 * segunda implementación "equivalente" es justo la que se desincroniza sin que
 * nadie se entere.
 */
export function guionDeArranque(rutas) {
  const lista = JSON.stringify([...rutas].sort());
  return (
    "(function(){" +
    "var PAGINA_404=" + JSON.stringify(PAGINA_404) + ";" +
    "var SUFIJO=" + JSON.stringify(SUFIJO) + ";" +
    esPeligrosa.toString() + ";" +
    tieneExtension.toString() + ";" +
    accionDeArranque.toString() + ";" +
    "try{" +
    "var a=accionDeArranque(location.pathname,location.search,location.hash," + lista + ");" +
    "if(a.tipo===\"ir\")location.replace(a.destino);" +
    "else if(a.tipo===\"limpiar\")history.replaceState(null,\"\",a.url);" +
    "}catch(e){}" +
    "})();"
  );
}
