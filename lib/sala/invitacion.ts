// La vista previa del enlace de invitación a una sala (WhatsApp y cualquier
// cliente que lea Open Graph). Client-safe y PURO: lo usan el lobby (arma el
// enlace), la página `/sala/[id]` (arma la metadata) y los tests.
//
// Lo que se ve al pegar el enlace en WhatsApp (dueño, 28/09):
//   título       Yump
//   descripción  <Nombre del organizador> te invitó a yumpear.
// Antes heredaba la descripción general del sitio ("Qué ver en tus plataformas
// de streaming…"), que no le dice nada a quien recibe una invitación.
//
// 🔴 EL NOMBRE VIAJA EN LA URL SÓLO COMO PRESENTACIÓN. La vista previa la arma
// un robot de WhatsApp que no tiene sesión ni credencial, y el nombre del
// organizador sólo lo expone `sala_estado`, que exige una. En vez de abrir eso
// (una RPC pública, `service_role` en la página o una migración), el enlace
// copiado lleva `?organizador=<nombre>`:
//   - el UUID sigue siendo la ÚNICA identidad de la sala;
//   - el parámetro no concede nada, no se escribe en la base y no decide nada:
//     sólo se lee para escribir la descripción;
//   - quien lo altere a mano sólo cambia la vista previa de SU enlace.
// Por eso se valida al LEERLO con la misma regla que la base aplica al nombre
// (`sala_nombre_valido` en 009_salas.sql): sin caracteres de control, espacios
// colapsados, de 1 a 24 caracteres. Si falta o no pasa, el texto genérico.
// El escape lo hace Next al renderizar la metadata: acá no se arma HTML.
import type { Metadata } from "next";
import { SITIO_PUBLICO, urlDeSala } from "../compartir.ts";

export const PARAM_ORGANIZADOR = "organizador";
/** El mismo máximo que `sala_nombre_valido` (009_salas.sql). */
export const MAX_NOMBRE = 24;
export const TITULO_INVITACION = "Yump";
export const DESCRIPCION_GENERICA = "Te invitaron a yumpear.";

// Controles (C0, DEL, C1) y los de formato bidireccional, que en una vista
// previa pueden dar vuelta el texto que rodea al nombre.
const CONTROLES = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/** El nombre listo para mostrar, o `null` si falta o no es válido. */
export function nombreParaInvitacion(crudo: string | string[] | null | undefined): string | null {
  const v = Array.isArray(crudo) ? crudo[0] : crudo;
  if (typeof v !== "string") return null;
  const limpio = v.replace(CONTROLES, "").replace(/\s+/g, " ").trim();
  const largo = [...limpio].length; // en caracteres, como char_length de Postgres
  if (largo < 1 || largo > MAX_NOMBRE) return null;
  return limpio;
}

export function descripcionInvitacion(nombre: string | null): string {
  return nombre ? `${nombre} te invitó a yumpear.` : DESCRIPCION_GENERICA;
}

/**
 * El enlace que se copia en el lobby: el público de la sala y, si el nombre es
 * válido, `?organizador=` codificado. Sin nombre válido, el enlace de siempre.
 */
export function enlaceDeInvitacion(roomId: string, organizador: string | null | undefined): string {
  const nombre = nombreParaInvitacion(organizador);
  const base = urlDeSala(roomId);
  return nombre ? `${base}?${PARAM_ORGANIZADOR}=${encodeURIComponent(nombre)}` : base;
}

/**
 * La metadata de `/sala/[id]`. La url canónica es la de la sala SIN el nombre:
 * la identidad es el UUID. `noindex`: una sala es efímera y privada.
 */
export function metadataInvitacion(roomId: string | null, organizador: string | string[] | null | undefined): Metadata {
  const description = descripcionInvitacion(nombreParaInvitacion(organizador));
  const url = roomId ? urlDeSala(roomId) : undefined;
  return {
    title: TITULO_INVITACION,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: TITULO_INVITACION,
      description,
      ...(url ? { url } : {}),
      siteName: "Yump",
      type: "website",
      locale: "es_AR",
      images: [{ url: `${SITIO_PUBLICO}/icons/icon-512.png`, width: 512, height: 512, alt: "Yump" }],
    },
    twitter: { card: "summary", title: TITULO_INVITACION, description },
  };
}
