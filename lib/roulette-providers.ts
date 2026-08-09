import type { PlatformCode } from "./types";
import { ALL_CODES } from "./providers-ar";

// Puente entre los códigos de plataforma de la app y los nombres que el
// pipeline offline guarda en `title_availability.providers` (tal como los
// devuelve TMDB/JustWatch).
//
// Es explícito y no derivado a propósito: los nombres no siguen ninguna regla.
// "Max" allá es "HBO Max", "Disney+" es "Disney Plus", y una misma plataforma
// puede aparecer con dos nombres (la propia y su channel dentro de Amazon o
// Apple), que cuentan como la misma.
//
// Revisado el 2026-08-09 contra la lista COMPLETA de
// `select distinct unnest(providers) from title_availability where region='AR'`:
// 40 nombres. Los que quedan deliberadamente afuera, porque no son plataformas
// de esta app (con su cantidad de títulos, para dimensionar lo que se pierde):
//
//   MGM+ Apple TV Channel 92 · MGM Plus Amazon Channel 92 · Mercado Play 92
//   Sony One Amazon Channel 60 · Plex 37 · Artiflix 27 · Pluto TV 18
//   JustWatch TV 17 · Bloodstream 12 · Cultpix 8 · Runtime 5 · FilmBox+ 4
//   Adrenalina Pura Amazon channel 3 · Adrenalina Pura Apple TV channel 3
//   Artify 3 · Filmzie 2 · Dekkoo 1 · DocAlliance Films 1 · FOUND TV 1
//   Shahid VIP 1
//
// Son servicios gratuitos con publicidad o channels de marcas que la app no
// ofrece; Pluto TV además está descartada explícitamente (ver providers-ar.ts).
// Si alguna se suma a `PLATFORMS`, hay que sumar acá su nombre EXACTO.
//
// Sobre los 765 títulos con texto, este mapa alcanza 696.
const NOMBRES: Record<PlatformCode, string[]> = {
  n:  ["Netflix"],
  d:  ["Disney Plus"],
  m:  ["HBO Max"],
  p:  ["Amazon Prime Video"],
  // OJO: acá "Apple TV" ES la suscripción. `title_availability` sólo guarda
  // flatrate/free/ads y excluye alquiler, así que no es el mismo caso que el
  // provider_id 2 de TMDB (la tienda), que se sacó de providers-ar.ts.
  at: ["Apple TV", "Apple TV Amazon Channel"],
  pp: ["Paramount Plus", "Paramount+ Amazon Channel"],
  mb: ["MUBI", "MUBI Amazon Channel"],
  un: ["Universal+ Amazon Channel"],
  mv: ["MovistarTV"],
  cv: ["Claro video"],
  // "VIX " con espacio al final NO es un typo: es cómo está el dato en la base.
  // Corregirlo acá haría desaparecer esos títulos en silencio.
  vx: ["VIX ", "ViX Premium Amazon Channel"],
  dg: ["DIRECTV GO"],
  cr: ["Crunchyroll", "Crunchyroll Amazon Channel"],
  ok: ["OnDemandKorea"],
  // Star+ se fusionó con Disney+ en 2024. Sigue en PlatformCode para no romper
  // el localStorage de quien la haya elegido antes; en el pool no existe.
  sp: [],
};

// Falla ruidosamente en desarrollo si alguien agrega un PlatformCode y se
// olvida de darle su nombre acá: sin esto, el título simplemente no aparece y
// no hay ningún error que lo delate.
//
// OJO con el alcance de este guard: detecta códigos SIN mapear, no mapeos
// INCORRECTOS. Un nombre mal escrito o incompleto pasa igual y hace desaparecer
// títulos en silencio. Contra eso no hay guard en tiempo de ejecución: hay que
// diffear a mano contra la base cada vez que se toca este archivo, con la
// consulta que está en el plan (Task 1, Step 3).
if (process.env.NODE_ENV !== "production") {
  const faltan = ALL_CODES.filter((c) => !NOMBRES[c]?.length);
  if (faltan.length) {
    throw new Error(
      `[ruleta] Plataformas sin nombre en title_availability: ${faltan.join(", ")}. ` +
      `Agregá su nombre EXACTO en lib/roulette-providers.ts (verificalo contra ` +
      `select distinct unnest(providers) from title_availability where region='AR').`,
    );
  }
}

export function roulettePlatformNames(codes: PlatformCode[]): string[] {
  return [...new Set(codes.flatMap((c) => NOMBRES[c] ?? []))];
}
