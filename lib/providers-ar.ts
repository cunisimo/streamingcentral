// Configuración de plataformas para Argentina.
// IMPORTANTE: los provider_id son los de TMDB. Verificá/actualizá la lista
// canónica con: GET /watch/providers/movie?watch_region=AR (devuelve todas
// las disponibles en AR con su display_priority). Estos son los principales.
import type { PlatformCode } from "./types";

export interface PlatformDef {
  code: PlatformCode;
  name: string;
  tmdbIds: number[]; // pueden ser varios (p.ej. con y sin ads)
  color: string;
}

export const PLATFORMS: PlatformDef[] = [
  { code: "n",  name: "Netflix",     tmdbIds: [8],        color: "#E50914" },
  { code: "d",  name: "Disney+",     tmdbIds: [337],      color: "#0C3FC4" },
  { code: "m",  name: "Max",         tmdbIds: [1899, 384],color: "#0E2FD6" },
  { code: "p",  name: "Prime Video", tmdbIds: [119, 9],   color: "#00A8E1" },
  { code: "pp", name: "Paramount+",  tmdbIds: [531],      color: "#0064FF" },
  { code: "at", name: "Apple TV+",   tmdbIds: [350, 2],   color: "#111111" },
  { code: "mb", name: "MUBI",        tmdbIds: [11],       color: "#111111" },
  { code: "cr", name: "Crunchyroll", tmdbIds: [283],      color: "#F47521" },
  { code: "sp", name: "Star+",       tmdbIds: [619],      color: "#5A2EAE" },
];

const ID_TO_CODE = new Map<number, PlatformCode>();
const CODE_TO_DEF = new Map<PlatformCode, PlatformDef>();
for (const def of PLATFORMS) {
  CODE_TO_DEF.set(def.code, def);
  for (const id of def.tmdbIds) ID_TO_CODE.set(id, def.code);
}

export const platformByCode = (c: PlatformCode) => CODE_TO_DEF.get(c);
export const codeForTmdbId = (id: number) => ID_TO_CODE.get(id) ?? null;

// Convierte códigos UI -> ids TMDB para pasarle a discover.
export function codesToTmdbIds(codes: PlatformCode[]): number[] {
  const ids: number[] = [];
  for (const c of codes) {
    const def = CODE_TO_DEF.get(c);
    if (def) ids.push(...def.tmdbIds);
  }
  return ids;
}

export const DEFAULT_PLATFORMS: PlatformCode[] = ["n", "d", "m"];
export const ALL_CODES: PlatformCode[] = PLATFORMS.map((p) => p.code);
