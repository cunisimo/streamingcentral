// La ACCIÓN de compartir, una sola para toda la app (Etapa 5, Tarea 5.1).
//
// Estaba escrita dentro de `components/DetailView.tsx` y Pelimatch necesitaba lo
// mismo, así que se extrajo tal cual —con sus tres caminos y el motivo de cada
// uno— en vez de copiarla. El mensaje se arma aparte (`lib/compartir.ts`): acá
// sólo se decide POR DÓNDE sale.
//
//   1. Contenedor nativo: `navigator.share` NO existe (verificado en CP8), así
//      que sin el plugin de Capacitor el botón caía derecho a WhatsApp sin
//      dejar elegir. El import es dinámico porque en web ese paquete no está.
//   2. Web con `navigator.share`: la hoja del sistema.
//   3. El resto (escritorio, WebViews): WhatsApp con el mensaje ya armado.
//
// 🔴 Cerrar la hoja de compartir tira `AbortError`: es una decisión del usuario,
// no una falla, y abrirle WhatsApp ahí sería pasarle por encima. Cualquier otro
// error sí cae al fallback.
//
// LOS TRES BUGS QUE ESTE CAMINO YA ARREGLÓ (venían del comentario de
// DetailView; se mudan acá con el código):
//
//   1. El payload llevaba SÓLO `title`. Web Share entrega `title`, `text` y
//      `url` al target, pero WhatsApp arma el mensaje con `text` y `url`: el
//      `title` es una sugerencia que la mayoría de los targets de Android
//      descarta. Resultado, WhatsApp recibía un share sin cuerpo y mostraba
//      "Mensaje vacío" — ese cartel es de WhatsApp, no nuestro.
//   2. En escritorio `navigator.share` no existe, y un `navigator.share?.(…)`
//      cortaba la cadena entera: el botón no hacía nada, sin error ni feedback.
//   3. El enlace se armaba con el origen del navegador. Una PWA instalada
//      cuando Yump vivía en el dominio anterior conserva ese origen para
//      siempre, así que esos usuarios compartían enlaces al dominio viejo. El
//      enlace público es SIEMPRE el canónico y sale de `lib/compartir.ts`.
//
// Las dependencias se inyectan para poder probar los cuatro caminos sin
// navegador ni contenedor; en la app se llama `compartir(m)` a secas.
import { enlaceWhatsapp, type MensajeCompartir } from "./compartir.ts";
import { ES_NATIVO } from "./plataforma.ts";

export interface DepsCompartir {
  esNativo?: boolean;
  /** `Share.share` de @capacitor/share. */
  plugin?: (d: { title: string; text: string; url: string }) => Promise<void>;
  /** `navigator.share`. `undefined` = no existe en este navegador. */
  share?: (d: { title: string; text: string; url: string }) => Promise<void>;
  abrir?: (url: string) => void;
}

const pluginReal = async (d: { title: string; text: string; url: string }) => {
  const { Share } = await import("@capacitor/share");
  await Share.share(d);
};

export async function compartir(m: MensajeCompartir, deps: DepsCompartir = {}): Promise<void> {
  const datos = { title: m.titulo, text: m.texto, url: m.url };
  const abrir = deps.abrir ?? ((url: string) => { window.open(url, "_blank", "noopener"); });
  const whatsapp = () => abrir(enlaceWhatsapp(m));
  const esNativo = deps.esNativo ?? ES_NATIVO;

  if (esNativo) {
    try { await (deps.plugin ?? pluginReal)(datos); } catch { whatsapp(); }
    return;
  }

  const share = "share" in deps
    ? deps.share
    : (typeof navigator !== "undefined" && typeof navigator.share === "function"
        ? (d: { title: string; text: string; url: string }) => navigator.share(d)
        : undefined);
  if (!share) return whatsapp();

  try {
    await share(datos);
  } catch (err) {
    if ((err as { name?: string } | null)?.name !== "AbortError") whatsapp();
  }
}
