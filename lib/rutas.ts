// Los enlaces INTERNOS a una ficha y a una persona.
//
// Por qué existe: el export estático no puede generar segmentos dinámicos de
// universo infinito. `/titulo/[tipo]/[id]` y `/persona/[id]` cubren todo TMDB,
// así que no hay `generateStaticParams` posible. En el contenedor esas dos rutas
// se reemplazan por `/t` y `/p`, que son estáticas y leen los parámetros de la
// query.
//
// ⚠️ NO CONFUNDIR CON `lib/compartir.ts`. Aquello arma el enlace PÚBLICO
// absoluto (`https://app.yump.ar/titulo/movie/278`), el que se manda por
// WhatsApp, y **no cambia nunca**: tiene que seguir apuntando al dominio
// público aunque la app corra adentro de un APK. Esto de acá es navegación
// interna y nada más.
//
// La web sigue usando `/titulo/...` y `/persona/...`: las URLs públicas no
// cambian, y los links que ya circulan siguen funcionando.
import { esNativo } from "./plataforma.ts";
import type { MediaType } from "./types";

interface Opciones {
  /** SÓLO para pruebas. En producción se omite y decide la bandera de build. */
  nativo?: boolean;
}

// LA BARRA ANTES DE LA QUERY: `/t/?...`, no `/t?...`.
//
// El build de Capacitor usa `trailingSlash: true`, así que el export emite
// `t/index.html` y `p/index.html`. `/t/?...` y `/p/?...` son las formas
// **canónicas elegidas porque coinciden con esa estructura**.
//
// Lo que se midió, y nada más: contra un servidor local que resuelve el
// `index.html` de un directorio, las dos formas responden 200 **sin
// redirección**. Contra un servidor estricto —que no resuelve directorios—
// **las dos dan 404**, así que esa medición no distingue entre ellas.
//
// ⚠️ **La compatibilidad con el servidor interno de Capacitor sigue PENDIENTE**
// y se verifica en CP8. Hasta entonces esto es una elección de forma canónica,
// no una garantía de comportamiento.
//
// Interesa sobre todo para `RuletaCard`, que usa un `<a>` y no un `<Link>`: eso
// es una navegación completa, resuelta por el servidor, no por el router.

/** El href interno a la ficha de un título. */
export function hrefTitulo(tipo: MediaType, id: number | string, opts: Opciones = {}): string {
  return esNativo(opts.nativo)
    ? `/t/?tipo=${tipo}&id=${id}`
    : `/titulo/${tipo}/${id}`;
}

/** El href interno a la ficha de una persona. */
export function hrefPersona(id: number | string, opts: Opciones = {}): string {
  return esNativo(opts.nativo) ? `/p/?id=${id}` : `/persona/${id}`;
}

// Los parámetros se validan y NO se confía en la URL: `/t` y `/p` son rutas
// públicas del bundle y cualquiera puede escribirles cualquier cosa.
const soloDigitos = /^\d+$/;

/** Valida los params de `/t`. Devuelve null si son inválidos. */
export function parseParamsTitulo(sp: URLSearchParams): { tipo: MediaType; id: string } | null {
  const tipo = sp.get("tipo");
  const id = sp.get("id");
  if (tipo !== "movie" && tipo !== "tv") return null;
  if (!id || !soloDigitos.test(id)) return null;
  return { tipo, id };
}

/** Valida los params de `/p`. Devuelve null si son inválidos. */
export function parseParamsPersona(sp: URLSearchParams): { id: string } | null {
  const id = sp.get("id");
  if (!id || !soloDigitos.test(id)) return null;
  return { id };
}
