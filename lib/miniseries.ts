// Riel "Miniseries para ansiosos": la parte que se puede probar sin red.
//
// Vive acá y no en `lib/home.ts` por la misma razón que `lib/reco-mezcla.ts` y
// `lib/fecha.ts`: `home.ts` es `server-only` y arrastra Upstash, así que un test
// de Node no puede importarlo. Y esto es justo lo que hay que poder probar — la
// consulta, el piso, el interruptor y el guard final son las promesas del riel,
// no detalles de presentación.
import type { Eje } from "./pools";
import type { MediaType, PlatformCode, UITitle } from "./types";

export const MINISERIES_KEY = "miniseries";

// EL TEXTO EXACTO, y no se deriva de nada. Viaja DENTRO del payload del Home,
// así que cambiarlo obliga a subir la versión de `homeKey` (pasó con
// "Hacete cargo" → "No gustaron": sin subirla, el nombre viejo se siguió
// sirviendo 6 h después del deploy).
export const MINISERIES_TITULO = "Miniseries para ansiosos";

// Piso para mostrarse. Debajo de esto el riel NO se muestra y NO se rellena con
// series comunes: rellenar un riel de miniseries con series de ocho temporadas
// es mentirle al usuario, y media docena de tarjetas se ve roto.
export const MINISERIES_PISO = 15;

// El objetivo de tarjetas. Es VISIBLE_CARDS del Home; se repite acá para que el
// módulo puro no dependa de `home.ts`, y el test verifica que sigan iguales.
export const MINISERIES_OBJETIVO = 20;

// Kill switch. Se le pasa el valor de entorno en vez de leerlo adentro para
// poder probar los tres casos sin ensuciar `process.env`.
export const rielMiniseriesActivo = (env = process.env.RIEL_MINISERIES) => env !== "0";

// Documental fuera SIEMPRE, por decisión de producto: en el eje `nuevo` el pool
// llegaba a 41% de documentales y el riel va pegado abajo de "Documental", así
// que se leía como un segundo riel documental. Animación e infantil NO se
// listan acá: los hereda de la regla de audiencia (`scope: "home"`), que ya
// tiene su excepción para quien elige Crunchyroll.
export const MINISERIES_SIN_GENEROS = [99];

// Piso de CANTIDAD de votos, decidido midiendo y no heredado del eje.
//
// `Record` completo y no `Partial` A PROPÓSITO: si mañana se suma un eje, esto
// deja de compilar y alguien tiene que DECIDIR su piso. Con `Partial` heredaría
// el del eje en silencio, que es exactamente lo que se quiso evitar.
//
// Por qué 0 en cuatro de los cinco: el piso de los ejes (60/300/10/60/60) deja
// afuera series argentinas y latinoamericanas. Medido por PAÍS DE ORIGEN sobre
// n,d,m: con el piso de los ejes entran 23 títulos de LatAm (7 argentinos), con
// el piso en 0 entran 34 (12 argentinos) — se suman Okupas, Santa Evita, El
// lobista, Nafta Súper y La fragilidad de los cuerpos. Es el sesgo del issue
// #12: el padrón de votantes de TMDB es anglo y el cine regional no junta 60.
//
// Por qué `top` es la excepción, y NO es por calidad: su `sort_by` ES la nota,
// así que sin un piso de cuánta gente votó el orden lo encabeza un 10.0 con un
// voto ("Tsunami, 10.0/1v") y el eje deja de significar algo. Con 10 alcanza —
// el ruido de menos de 10 votos desaparece y la cosecha regional queda idéntica
// a la del piso 0 (34 LatAm / 12 AR).
//
// NO ES UN PISO DE NOTA. No hay ninguno en esta app y no se agrega uno acá.
// Ver el principio en CLAUDE.md y la nota de `discover` en lib/tmdb.ts.
export const MINISERIES_PISO_VOTOS: Record<Eje, number> = {
  pop: 0,
  top: 10,
  nuevo: 0,
  taquilla: 0,
  hondo: 0,
};

// Los parámetros de TMDB que definen el riel.
//
// `with_type=2` es el enum de tipo de serie de TMDB y ES la condición de
// miniserie: verificado pidiendo el detalle de las 317 que devuelven los cinco
// ejes con n,d,m — 317 de 317 vienen con `type: "Miniseries"`, y 311 tienen una
// sola temporada (mediana de 8 episodios).
//
// `with_status=3` significa "MARCADA COMO FINALIZADA POR TMDB", y nada más que
// eso: es el campo `status` de la ficha, un dato declarativo. NO garantiza que
// la historia esté narrativamente cerrada ni que haya una sola temporada — de
// las 6 series de más de una temporada del pool, 5 SOBREVIVEN al filtro, porque
// filtra por `status` y no por cantidad de temporadas. Lo que sí saca son las 7
// que TMDB tiene como "Returning Series"/"Canceled", que contradicen de frente
// la promesa del riel.
export const MINISERIES_EXTRA: Record<string, string> = {
  with_type: "2",
  with_status: "3",
};

// La consulta completa de la superficie, en un solo lugar auditable.
export interface ConsultaMiniseries {
  tipo: MediaType;
  genre: string;
  scope: "home";
  sinGeneros: number[];
  minVotesPorEje: Record<Eje, number>;
  extra: Record<string, string>;
}

export function consultaMiniseries(): ConsultaMiniseries {
  return {
    // Solo series, y no es configurable: una miniserie-película no existe, así
    // que el toggle Películas/Series ofrecería un riel vacío.
    tipo: "tv",
    // El slug no elige géneros —no está en CATEGORIES, `resolveCategory`
    // devuelve {}— pero sí enciende la regla de audiencia, que solo se aplica
    // cuando hay un slug, y nombra la receta en Redis.
    genre: MINISERIES_KEY,
    scope: "home",
    sinGeneros: [...MINISERIES_SIN_GENEROS],
    minVotesPorEje: { ...MINISERIES_PISO_VOTOS },
    extra: { ...MINISERIES_EXTRA },
  };
}

export const alcanzaElPiso = (n: number) => n >= MINISERIES_PISO;

// Guard final antes de publicar el riel. Es barato (todo en memoria) y convierte
// tres promesas en invariantes verificadas en vez de confiadas:
//
//  - Ninguna película. El riel se pide con `tipo: "tv"`, así que una `movie` acá
//    sería un bug de cableado; pero es justo el bug que nadie ve, porque una
//    película en un riel de series se lee como un título más.
//  - Ningún título fuera de las plataformas elegidas. `enrichRaw` ya filtra,
//    y esto lo vuelve a verificar sobre lo que realmente se va a mostrar.
//  - Sin duplicados DENTRO del riel. El dedup del Home es un `Set` compartido y
//    ya lo garantiza; esto lo deja probado sin depender de él.
//
// Lo que descarta se loguea: un guard que filtra en silencio esconde el bug que
// tendría que delatar.
export function soloMiniseries(
  items: UITitle[], providers: PlatformCode[],
  avisar: (motivo: string) => void = () => {},
): UITitle[] {
  const vistos = new Set<string>();
  const out: UITitle[] = [];
  for (const t of items) {
    const k = `${t.type}:${t.id}`;
    if (t.type !== "tv") { avisar(`"${t.title}" no es serie (${t.type})`); continue; }
    if (!t.platforms.some((c) => providers.includes(c))) {
      avisar(`"${t.title}" no está en las plataformas elegidas (${t.platforms.join(",") || "ninguna"})`);
      continue;
    }
    if (vistos.has(k)) { avisar(`"${t.title}" duplicado dentro del riel`); continue; }
    vistos.add(k);
    out.push(t);
  }
  return out;
}
