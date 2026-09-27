// ¿Se ofrece instalar Yump al terminar una sala, y de qué forma? Client-safe y
// PURO: todo entra por parámetro, así que las seis combinaciones se prueban en
// un solo proceso en vez de levantar uno por camino.
//
// Reglas del dueño (27/09):
//   - Sólo después de un RESULTADO FINAL. Eso no se decide acá: la invitación se
//     monta dentro de `PieResultado`, que sólo existe en las tres pantallas de
//     resultado; el lobby, la votación y el empate SIN resolver no lo usan.
//   - Nunca dentro de la app Android, ni con Yump ya instalada como PWA.
//   - Android web → ficha de Google Play, y SÓLO con la versión que incluye
//     Yumpeá ya publicada. Antes de eso NO se muestra nada en Android: ni un
//     botón de instalación ni un enlace de prueba.
//   - iPhone web → instrucciones para agregar a la pantalla de inicio.
//   - Nunca se promete que instalar recupere la sala recién jugada.

/** La ficha pública de la app en Google Play. El id es el `applicationId` real. */
export const URL_PLAY = "https://play.google.com/store/apps/details?id=ar.yump.app";

/**
 * ¿Está publicada en Play la versión que incluye Yumpeá?
 *
 * 🔴 NACE APAGADA, y es la única razón por la que el botón de Play puede existir
 * en el código sin ser un enlace roto: hoy la app está en prueba cerrada Alpha
 * (ver docs/ESTADO.md), así que la ficha pública todavía no sirve. Se enciende
 * con `NEXT_PUBLIC_YUMP_PLAY_PUBLICA=1` en Vercel, y como Next la inlinea en el
 * build, se aplica recién en el deployment siguiente.
 */
export const PLAY_PUBLICA: boolean = process.env.NEXT_PUBLIC_YUMP_PLAY_PUBLICA === "1";

export type FormaInvitacion = "play" | "ios" | "nada";

export interface ContextoInvitacion {
  /** Bandera de BUILD (`ES_NATIVO`), no detección en runtime. */
  nativo: boolean;
  /** Yump ya corre instalada (PWA en pantalla de inicio o standalone). */
  instalada: boolean;
  /** `navigator.userAgent`. Se pasa para poder probarlo sin navegador. */
  ua: string;
  /** El valor de `PLAY_PUBLICA`. Se pasa para poder probar los dos estados. */
  playPublicada: boolean;
  /** `navigator.maxTouchPoints`: iPadOS 13+ se hace pasar por Mac. */
  puntosTactiles?: number;
  /** `navigator.platform`, por el mismo motivo. */
  plataforma?: string;
}

/**
 * Detecta el sistema SIN depender de `beforeinstallprompt`.
 *
 * ⚠️ No se reusa `useInstallPrompt`: ese hook pone `platform: "android"` recién
 * cuando el navegador dispara `beforeinstallprompt`, que no ocurre si la PWA ya
 * fue descartada, si el navegador no lo soporta (Firefox) o si la app está
 * publicada en Play y Chrome decide suprimirlo. Para ofrecer Google Play alcanza
 * con que el teléfono sea Android.
 */
export function sistema(ctx: Pick<ContextoInvitacion, "ua" | "puntosTactiles" | "plataforma">): "android" | "ios" | "otro" {
  const ua = ctx.ua ?? "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (ctx.plataforma === "MacIntel" && (ctx.puntosTactiles ?? 0) > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  return "otro";
}

/** Qué invitación corresponde mostrar. `"nada"` = no se monta nada. */
export function formaDeInvitacion(ctx: ContextoInvitacion): FormaInvitacion {
  if (ctx.nativo) return "nada";      // ya la tiene: es la app
  if (ctx.instalada) return "nada";   // ya la instaló como PWA
  const s = sistema(ctx);
  if (s === "ios") return "ios";
  if (s === "android") return ctx.playPublicada ? "play" : "nada";
  return "nada";                      // escritorio y lo demás
}
