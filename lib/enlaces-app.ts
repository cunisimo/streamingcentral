// Traducir un enlace público que el sistema le entrega a la app (Android App
// Links) a la ruta interna del contenedor. Client-safe y PURO: sin React, sin
// plugins, sin `window`.
//
// Se llamaba `lib/sala/enlace-nativo.ts` y sólo entendía salas. Desde el 28/09
// también abre FICHAS: el enlace que comparte un match de Yumpeá es
// `https://app.yump.ar/titulo/movie/<id>`, y con Yump instalada tiene que abrir
// la ficha adentro de la app. Sin la app, el mismo enlace abre la ficha web.
//
// 🔴 EL PROBLEMA. Lo que llega de un App Link es la url PÚBLICA, porque es la
// única que sirve para todos: quien la recibe puede no tener la app. Pero esas
// rutas NO EXISTEN en el artefacto —`/sala/[id]` y `/titulo/[tipo]/[id]` no se
// pueden enumerar para el export estático—. Dentro del contenedor:
//
//   https://app.yump.ar/sala/<uuid>              → /s/?id=<uuid>
//   https://app.yump.ar/titulo/movie/<id>        → /t/?tipo=movie&id=<id>
//   https://app.yump.ar/titulo/tv/<id>           → /t/?tipo=tv&id=<id>
//
// ⚠️ Es una LISTA BLANCA, no un saneador. Esquema `https`, el host canónico
// exacto, la forma exacta de cada ruta, el tipo (`movie`/`tv`) y el formato de
// cada identificador; cualquier otra cosa devuelve `null` y el contenedor no
// navega a ningún lado. Un intent puede traer lo que sea. La query y el
// fragmento se IGNORAN (WhatsApp agrega parámetros; el enlace de invitación
// trae `?organizador=`, que es sólo presentación): la ruta interna sale sólo
// del path.
import { SITIO_PUBLICO } from "./compartir.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Un id de TMDB: dígitos, sin ceros a la izquierda, a lo sumo 10 (el catálogo
// real anda por 1,7 millones; esto es holgura, no un número a medida).
const ID_TMDB = /^[1-9]\d{0,9}$/;

/** El host del sitio público, sin esquema. Sale de la misma constante que los enlaces. */
export const HOST_PUBLICO = SITIO_PUBLICO.replace(/^https:\/\//, "");

/** ¿A qué ruta interna lleva esta url? `null` si no es un enlace nuestro reconocido. */
export function rutaDeEnlace(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Sólo https y sólo nuestro host: ni http, ni un subdominio, ni un host que
  // lo contenga (`app.yump.ar.evil.com`), ni credenciales ni puerto.
  // `URL.hostname` ya viene normalizado.
  if (u.protocol !== "https:" || u.hostname !== HOST_PUBLICO) return null;
  if (u.username || u.password || u.port) return null;

  // El path EXACTO, con barra final opcional: nada de `//sala//<uuid>`, puntos,
  // segmentos de más ni codificaciones raras (el uuid y el id no admiten `%`).
  const sala = /^\/sala\/([^/]+)\/?$/.exec(u.pathname);
  if (sala) return UUID.test(sala[1]) ? `/s/?id=${sala[1].toLowerCase()}` : null;
  const titulo = /^\/titulo\/(movie|tv)\/([^/]+)\/?$/.exec(u.pathname);
  if (titulo) return ID_TMDB.test(titulo[2]) ? `/t/?tipo=${titulo[1]}&id=${titulo[2]}` : null;
  return null;
}

/** Lo que se usa del plugin `@capacitor/app`. Inyectado: los tests lo imitan. */
export interface PluginApp {
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  addListener(evento: "appUrlOpen", fn: (e: { url: string }) => void): Promise<{ remove: () => unknown }>;
}

/**
 * Atiende los DOS caminos por los que llega un enlace y navega con `navegar`
 * (en la app, `router.replace`):
 *   1. app CERRADA: el intent ya estaba al arrancar → `getLaunchUrl()`;
 *   2. app en SEGUNDO PLANO: llega como evento → `appUrlOpen`.
 * Todo pasa por `rutaDeEnlace` (lista blanca): lo que no se reconoce no navega.
 * Devuelve la función que quita el listener; si se llamó antes de que el
 * listener quedara registrado, igual lo quita al registrarse.
 */
export function atenderEnlaces(app: PluginApp, navegar: (ruta: string) => void): () => void {
  let cancelado = false;
  let quitar: (() => void) | null = null;
  const ir = (url: string | null | undefined) => {
    if (cancelado) return;
    const ruta = url ? rutaDeEnlace(url) : null;
    if (ruta) navegar(ruta);
  };
  void (async () => {
    try {
      ir((await app.getLaunchUrl())?.url);
      const h = await app.addListener("appUrlOpen", ({ url }) => ir(url));
      if (cancelado) h.remove();
      else quitar = () => { h.remove(); };
    } catch {
      // Sin plugin, el enlace simplemente no se abre adentro; nada se rompe.
    }
  })();
  return () => { cancelado = true; quitar?.(); };
}
