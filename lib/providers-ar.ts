// Configuración de plataformas para Argentina.
// IMPORTANTE: los provider_id son los de TMDB. Verificá/actualizá la lista
// canónica con: GET /watch/providers/movie?watch_region=AR (devuelve todas
// las disponibles en AR con su display_priority). Estos son los principales.
import type { PlatformCode } from "./types";

export interface PlatformDef {
  code: PlatformCode;
  name: string;
  /**
   * ⚠️ NO SE USA PARA PINTAR LA INTERFAZ, y no hay que volver a hacerlo. Es el
   * color de marca de un tercero: usarlo en la app es reproducir identidad
   * ajena, que es justo lo que se sacó al reemplazar los wordmarks por texto
   * neutro (ver components/PlatformLogo.tsx y docs/PLAY-STORE.md). Queda como
   * dato de referencia del proveedor, nada más.
   */
  tmdbIds: number[]; // pueden ser varios (p.ej. con y sin ads)
  color: string;
  // Página oficial de suscripción en Argentina. La usa el bloque "No está en
  // tus plataformas" de la ficha. TMDB no da este dato: va a mano, y hay que
  // revisarlo de vez en cuando porque las marcas cambian sus URLs.
  // Revisadas el 2026-08-09.
  signupUrl?: string;
}

// Los `tmdbIds` incluyen los "channels": la MISMA plataforma revendida dentro de
// Amazon o Apple, que TMDB publica con otro provider_id (Paramount+ Amazon
// Channel = 582). Sin ellos, un título que solo figuraba en el channel salía
// como "No está en streaming" aunque el usuario tuviera esa plataforma.
// EL ORDEN DE ESTE ARRAY ES EL ORDEN DEL SELECTOR (lo pidió el dueño, y
// /api/providers ordena por él en vez de por el display_priority de TMDB).
export const PLATFORMS: PlatformDef[] = [
  { code: "n",  name: "Netflix",       tmdbIds: [8],              color: "#E50914", signupUrl: "https://www.netflix.com/ar/" },
  { code: "d",  name: "Disney+",       tmdbIds: [337],            color: "#0C3FC4", signupUrl: "https://www.disneyplus.com/es-ar" },
  { code: "m",  name: "Max",           tmdbIds: [1899, 384],      color: "#0E2FD6", signupUrl: "https://www.max.com/ar/es" },
  { code: "at", name: "Apple TV+",     tmdbIds: [350, 2243],      color: "#111111", signupUrl: "https://tv.apple.com/ar" },
  { code: "p",  name: "Prime Video",   tmdbIds: [119, 9],         color: "#00A8E1", signupUrl: "https://www.primevideo.com/" },
  { code: "cr", name: "Crunchyroll",   tmdbIds: [283, 1968],      color: "#F47521", signupUrl: "https://www.crunchyroll.com/es" },
  { code: "pp", name: "Paramount+",    tmdbIds: [531, 582, 1853], color: "#0064FF", signupUrl: "https://www.paramountplus.com/ar/" },
  { code: "mb", name: "MUBI",          tmdbIds: [11],             color: "#111111", signupUrl: "https://mubi.com/es/ar" },
  { code: "un", name: "Universal+",    tmdbIds: [1889],           color: "#0B5FD4", signupUrl: "https://www.universalplus.com/ar" },
  // De acá para abajo el orden es indistinto.
  { code: "mv", name: "MovistarTV",    tmdbIds: [339],            color: "#019DF4", signupUrl: "https://www.movistar.com.ar/productos-y-servicios/television" },
  { code: "cv", name: "Claro video",   tmdbIds: [167],            color: "#DA291C", signupUrl: "https://www.clarovideo.com/argentina/" },
  { code: "vx", name: "ViX",           tmdbIds: [457],            color: "#F4067F", signupUrl: "https://vix.com/es-es/premium" },
  { code: "dg", name: "DIRECTV GO",    tmdbIds: [467],            color: "#00B0F0", signupUrl: "https://www.directvgo.com/ar" },
  { code: "ok", name: "OnDemandKorea", tmdbIds: [575],            color: "#E4002B", signupUrl: "https://www.ondemandkorea.com/" },
];

// Posición de cada código en el orden de arriba, para ordenar listas que vienen
// de otra fuente (la tabla `providers`, que trae el display_priority de TMDB).
const ORDEN = new Map(PLATFORMS.map((p, i) => [p.code, i]));
export const platformOrder = (c: PlatformCode) => ORDEN.get(c) ?? 999;

// Pluto TV (300) NO va acá: es gratis CON PUBLICIDAD y TMDB la clasifica en
// `ads`, nunca en `flatrate`. El discover igual la devuelve con
// with_watch_monetization_types=flatrate (inconsistencia de TMDB), pero
// /watch/providers de cada título la lista bajo `ads`, así que `providersOf`
// nunca le asignaba el código y el Home quedaba en 0 tarjetas. Soportarla
// obligaría a aceptar el modelo con publicidad, que es otra app.

// El id 2 ("Apple TV") NO va en Apple TV+: es la tienda de alquiler/compra, y
// TMDB la devuelve bajo `flatrate` en AR (misma inconsistencia que Pluto TV).
// Con el id 2 puesto, Apple TV+ pasaba de 321 títulos reales a 5389, y el
// usuario veía cine de alquiler como si estuviera incluido en la suscripción.
// Star+ (619) se sacó porque se fusionó con Disney+ en 2024: devuelve 0 en
// movie y en tv.

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
