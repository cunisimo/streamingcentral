// Traducir un enlace de invitación recibido por el sistema a la ruta interna
// del contenedor. Client-safe y PURO: sin React, sin plugins, sin `window`.
//
// 🔴 EL PROBLEMA. Lo que llega de un App Link es la url PÚBLICA
// —`https://app.yump.ar/sala/<uuid>`— porque es la única que sirve para todos:
// quien recibe la invitación puede no tener la app. Pero esa ruta NO EXISTE en
// el artefacto: `/sala/[id]` se excluye del export estático (su id es un uuid,
// no se puede enumerar). Dentro del contenedor la sala se muestra en
// `/s/?id=<uuid>`.
//
// ⚠️ Es una LISTA BLANCA, no un saneador. Sólo se acepta el host canónico y la
// forma exacta `/sala/<uuid>`; cualquier otra cosa devuelve `null` y el
// contenedor no navega a ningún lado. Un intent puede traer lo que sea.
import { SITIO_PUBLICO } from "../compartir.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El host del sitio público, sin esquema. Sale de la misma constante que el enlace. */
export const HOST_PUBLICO = SITIO_PUBLICO.replace(/^https:\/\//, "");

/**
 * ¿A qué ruta interna lleva esta url? `null` si no es un enlace de sala nuestro.
 *
 * Acepta la url con o sin barra final y con query o fragmento —WhatsApp y los
 * clientes de correo agregan parámetros de seguimiento— porque lo único que se
 * lee es el path.
 */
export function rutaDeEnlace(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Sólo https y sólo nuestro host: ni http, ni un subdominio, ni un host que
  // lo contenga (`app.yump.ar.evil.com`). `URL.hostname` ya viene normalizado.
  if (u.protocol !== "https:" || u.hostname !== HOST_PUBLICO) return null;

  const partes = u.pathname.split("/").filter(Boolean);
  if (partes.length !== 2 || partes[0] !== "sala") return null;
  if (!UUID.test(partes[1])) return null;
  return `/s/?id=${partes[1].toLowerCase()}`;
}
