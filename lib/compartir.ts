// La fuente ÚNICA del enlace público de Yump.
//
// Por qué existe este archivo, en una línea: el enlace que sale de la app NO
// puede depender del origen desde el que la app esté abierta.
//
// El bug que lo motivó: `DetailView` armaba la url con `window.location.origin`.
// Una PWA instalada cuando la app vivía en `streamingcentral.vercel.app`
// conserva ese origen **para siempre** —el scope de una instalación es por
// origen y no se migra cuando cambia el dominio—, así que ese usuario compartía
// por WhatsApp enlaces al dominio viejo sin enterarse. Es invisible desde
// adentro de la app: ahí todo funciona.
//
// ⚠️ NO usa `NEXT_PUBLIC_SITE_URL`, y es a propósito. Esa variable tiene otra
// función: es el destino del mail de recuperación de contraseña, y además tiene
// que estar en la allowlist de Redirect URLs de Supabase. `.env.local.example`
// todavía documenta su valor de producción como el dominio VIEJO, así que
// colgar de ella el enlace público sería atar dos cosas que se mueven por
// motivos distintos —y una de ellas puede dejar a alguien sin poder recuperar
// la cuenta—. El enlace público es un dato del producto, no configuración.
import type { MediaType } from "./types";

/**
 * El dominio canónico de la aplicación. Sin barra final: todo lo que se arma
 * abajo empieza con `/`.
 */
export const SITIO_PUBLICO = "https://app.yump.ar";

/** El enlace público a la ficha de un título. Siempre canónico. */
export function urlDeTitulo(tipo: MediaType, id: number | string): string {
  return `${SITIO_PUBLICO}/titulo/${tipo}/${id}`;
}

export interface TituloCompartible {
  title: string;
  year?: number | null;
  type: MediaType;
  id: number | string;
}

export interface MensajeCompartir {
  /** El título solo, para el campo `title` de `navigator.share`. */
  titulo: string;
  /** El cuerpo del mensaje, sin la url. */
  texto: string;
  /** La url canónica, aparte: `navigator.share` la quiere en su propio campo. */
  url: string;
}

/**
 * El mensaje con el que se comparte una ficha.
 *
 * La plataforma va adentro del texto porque es el dato que evita el ida y
 * vuelta de "¿y dónde la veo?", que es el problema que resuelve la app.
 */
export function mensajeCompartir(
  t: TituloCompartible,
  plataforma: string | null,
): MensajeCompartir {
  const texto =
    `¡Mirá lo que encontré! "${t.title}"` +
    (t.year ? ` (${t.year})` : "") +
    (plataforma ? ` — en ${plataforma}` : "") +
    ". La ficha en Yump:";
  return { titulo: t.title, texto, url: urlDeTitulo(t.type, t.id) };
}

/**
 * El fallback: WhatsApp con el mensaje ya armado.
 *
 * Existe porque `navigator.share` no está en todos lados —escritorio, y también
 * los WebView— y porque WhatsApp arma el mensaje con `text` y `url`: mandarle
 * sólo `title` le deja el cuerpo vacío.
 */
export function enlaceWhatsapp(m: MensajeCompartir): string {
  return `https://wa.me/?text=${encodeURIComponent(`${m.texto}\n${m.url}`)}`;
}
