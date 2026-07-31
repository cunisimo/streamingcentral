// Selección de trailer de YouTube y armado del embed.
// Reutilizable (sirve también para features futuras tipo Trailer Zone).
import type { RawVideo } from "./tmdb";

// Devuelve la key de YouTube del mejor trailer, o null si no hay ninguno válido.
// Prioridad: official Trailer > Trailer > official Teaser > Teaser.
// Solo se consideran Trailer y Teaser; se ignoran Clip, Featurette,
// Behind the Scenes, Bloopers, Opening Credits y cualquier otro tipo.
export function pickTrailer(videos: RawVideo[]): string | null {
  const yt = videos.filter((v) => v.site === "YouTube" && !!v.key);
  const find = (type: string, officialOnly: boolean) =>
    yt.find((v) => v.type === type && (!officialOnly || v.official));
  const pick =
    find("Trailer", true) ??
    find("Trailer", false) ??
    find("Teaser", true) ??
    find("Teaser", false);
  return pick?.key ?? null;
}

const EMBED_PARAMS = new URLSearchParams({
  autoplay: "1",
  mute: "1",         // arranca muteado siempre (autoplay confiable en todos lados)
  controls: "1",
  rel: "0",          // best-effort: YouTube ya no elimina relacionados del todo
  playsinline: "1",  // evita fullscreen forzado en iOS
  modestbranding: "1",
  enablejsapi: "1",  // habilita postMessage para mute/unMute
}).toString();

export function trailerEmbedUrl(key: string): string {
  return `https://www.youtube-nocookie.com/embed/${key}?${EMBED_PARAMS}`;
}
