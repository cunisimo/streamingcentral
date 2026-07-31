// Selección de trailer de YouTube y armado del embed.
// Reutilizable (sirve también para features futuras tipo Trailer Zone).
import type { RawVideo } from "./tmdb";

// Devuelve la key de YouTube del mejor trailer, o null si no hay ninguno válido.
// Se prefiere el IDIOMA ORIGINAL (sin doblar): idioma original > inglés > otro,
// y dentro de cada idioma, por tipo: official Trailer > Trailer > official
// Teaser > Teaser. Solo se consideran Trailer y Teaser; se ignoran Clip,
// Featurette, Behind the Scenes, Bloopers, Opening Credits y cualquier otro tipo.
export function pickTrailer(videos: RawVideo[], originalLang: string): string | null {
  const typeRank = (v: RawVideo) =>
    v.type === "Trailer" ? (v.official ? 0 : 1)
    : v.type === "Teaser" ? (v.official ? 2 : 3)
    : 99; // otros tipos: descartados
  const langRank = (v: RawVideo) =>
    v.iso_639_1 === originalLang ? 0 : v.iso_639_1 === "en" ? 1 : 2;

  const candidates = videos
    .filter((v) => v.site === "YouTube" && !!v.key && typeRank(v) < 99)
    .sort((a, b) => langRank(a) - langRank(b) || typeRank(a) - typeRank(b));

  return candidates[0]?.key ?? null;
}

const BASE_PARAMS: Record<string, string> = {
  autoplay: "1",
  mute: "1",           // arranca muteado siempre (autoplay confiable en todos lados)
  controls: "1",
  rel: "0",            // best-effort: YouTube ya no elimina relacionados del todo
  playsinline: "1",    // evita fullscreen forzado en iOS
  modestbranding: "1",
  enablejsapi: "1",    // habilita postMessage para mute/unMute
  cc_load_policy: "1", // subtítulos activados por defecto (best-effort)
  cc_lang_pref: "es",  // preferir castellano cuando el trailer tenga subtítulos
};

// origin es necesario junto con enablejsapi: sin él, YouTube en móvil tira
// "Error 153 / error de configuración del reproductor". Se pasa desde el cliente
// (window.location.origin) porque varía según dominio (localhost/Vercel/custom).
export function trailerEmbedUrl(key: string, origin?: string): string {
  const params = new URLSearchParams(BASE_PARAMS);
  if (origin) params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${key}?${params}`;
}
