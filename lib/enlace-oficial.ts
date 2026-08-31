// Evidencia oficial de ALTA PROBABILIDAD: cuándo un enlace oficial alcanza para
// afirmar que un título está en una plataforma en Argentina.
//
// EL AGUJERO QUE TAPA. El catálogo regional de TMDB está incompleto. Medido el
// 2026-08-31 sobre las seis plataformas soportadas: de 270 series recientes
// traídas por red, **50 no tenían proveedor argentino**. Dos casos testigo:
// `tv:275224` (Disney+, #1 de JustWatch AR) y `tv:322428` (Netflix), del que
// TMDB no conoce **ninguna** región en todo el mundo.
//
// 🔴 EL CRITERIO DE PRODUCTO, que es lo que le da forma a esta regla: **es
// preferible mostrar de vez en cuando un título que no esté, antes que ocultar
// muchos que sí están**. Por eso la regla prioriza cobertura y sólo rechaza
// contradicciones fuertes y señales claramente inválidas. No pretende certeza.
//
// LO QUE ESO CAMBIÓ, y los tres cambios están medidos —ver
// `docs/medidas/2026-08-31-medicion-regla-final.md`:
//
//  1. **No hay tope de regiones.** Se había propuesto uno (≤3) y habría aceptado
//     CERO títulos sin evitar un solo error: los títulos realmente disponibles
//     tienden a estar en muchas regiones.
//  2. **Se acepta cualquier locale.** Rechazar los extranjeros costaba 4 series
//     y el 100% de la señal de películas, y evitaba 0 errores. El locale
//     identifica la tienda que generó el enlace, no dónde está disponible.
//  3. **`hbo.com` vale para Max.** El argumento de que es "el canal, no el
//     servicio" era razonable y los datos lo desmienten: 43 casos, 35 en Max AR,
//     0 en otra plataforma.
//
// Resultado sobre verdad de campo: **144 aciertos en series y 22 en películas,
// con CERO falsos positivos**.
//
// ⚠️ `networks` SIGUE SIN ALCANZAR SOLA para series, y para PELÍCULAS NO SE USA:
// TMDB no lo publica para películas, y el `homepage` de una película suele ser
// el de la productora. La rama de películas decide por el enlace y sólo por él.
//
// Sin `server-only`: es lógica pura, sin credenciales ni red, y todo el punto es
// poder probarla con `node --test`.
import type { MediaType, PlatformCode } from "./types";

/**
 * El resumen regional que guarda `pv3:`.
 *
 * ⚠️ NO ES EL MAPA POR REGIÓN, y no se puede reconstruir desde acá. Guardar
 * `watch/providers` entero cuesta 1214 B por título contra 170 de esto (medido
 * sobre títulos con 93 regiones de promedio). Si alguna regla futura necesita
 * saber QUÉ región dice qué, hay que volver al mapa **y subir la versión de la
 * clave**.
 */
export interface ResumenRegional {
  /** Total de regiones con `flatrate`, **sin contar AR**. */
  rt: number;
  /** Cuántas regiones informan cada plataforma soportada. Sin ceros. */
  rp: Partial<Record<PlatformCode, number>>;
  /**
   * Regiones cuyo `flatrate` no trae **ninguna** plataforma soportada.
   *
   * Hace falta para no confundir "TMDB no sabe nada" con "TMDB sabe, pero de
   * proveedores que Yump no mapea": sin este contador, un título presente en 20
   * regiones de plataformas desconocidas parecería no tener datos.
   */
  ru: number;
}

/** Los datos de TMDB que esta regla necesita. Nada más que esto. */
export interface DatosTitulo {
  tipo: MediaType;
  /** `first_air_date` o `release_date`, YYYY-MM-DD. */
  estreno: string | null;
  /** ids de `networks`. Vacío en películas: TMDB no lo publica. */
  redes: number[];
  /** `homepage`, tal cual viene. */
  homepage: string;
  reg: ResumenRegional;
}

/**
 * Un adaptador de evidencia oficial.
 *
 * 🔴 CADA COMBINACIÓN SE VERIFICÓ CON DATOS REALES antes de entrar: qué ids de
 * red usa TMDB, qué dominio sirve sus fichas, qué forma tiene la ruta de un
 * título y qué ids de proveedor la representan en otras regiones. No se agrega
 * una plataforma "porque debe tener un dominio".
 */
export interface AdaptadorOficial {
  code: PlatformCode;
  /** ids de `networks` de TMDB. Sólo se usan en series. */
  redes: number[];
  /** Hosts EXACTOS. Sin comodines, sin subdominios, sin sufijos. */
  hosts: string[];
  /** Formas de ruta que apuntan a UN título. */
  rutas: RegExp[];
  /** ¿Habilitada para series? */
  series: boolean;
  /** ¿Habilitada para películas? */
  peliculas: boolean;
  /**
   * Ids de proveedor de TMDB que significan esta plataforma **en cualquier
   * región**, para el chequeo de contradicción.
   *
   * ⚠️ NO es lo mismo que `tmdbIds` de `providers-ar.ts` y no hay que
   * unificarlos: allá definen qué considera esta plataforma el discover
   * argentino. Acá se miran regiones ajenas a propósito.
   */
  idsGlobales: number[];
}

/**
 * El registro. Los datos salen de la medición del 2026-08-31.
 *
 * **Series: las seis.** **Películas: cuatro** — Max y Paramount+ midieron 0 de
 * 30 películas con dominio oficial, así que habilitarlas sería aparentar una
 * cobertura que no existe.
 */
export const ADAPTADORES_OFICIALES: AdaptadorOficial[] = [
  {
    code: "n", redes: [213],
    hosts: ["netflix.com", "www.netflix.com"],
    // `/title/<n>`. `/browse` y `/search` quedan afuera.
    rutas: [/^\/title\/\d+$/],
    series: true, peliculas: true,
    idsGlobales: [8, 1796],
  },
  {
    code: "d", redes: [2739],
    hosts: ["disneyplus.com", "www.disneyplus.com"],
    rutas: [/^\/browse\/entity-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i],
    series: true, peliculas: true,
    idsGlobales: [337, 122],
  },
  {
    code: "p", redes: [1024],
    // ⚠️ `amazon.com` NO entra. Un `/dp/<ASIN>` es la TIENDA: puede ser un
    // alquiler, una compra o un DVD. Cuesta 12 series de la muestra y se paga.
    hosts: ["primevideo.com", "www.primevideo.com"],
    // Las DOS formas verificadas.
    rutas: [/^\/detail\/[0-9A-Z]{16,}$/, /^\/detail\/amzn1\.dv\.gti\.[0-9a-f-]+$/i],
    series: true, peliculas: true,
    idsGlobales: [119, 2100, 9],
  },
  {
    code: "m", redes: [49, 3186],
    // `hbo.com` es evidencia PROBABLE, no estructural: 43 casos medidos, 35 en
    // Max AR y 0 en otra plataforma. Si HBO licenciara una serie a otra
    // plataforma en AR, esta regla se equivocaría. Es el riesgo aceptado.
    hosts: ["max.com", "www.max.com", "play.max.com", "hbo.com", "www.hbo.com"],
    rutas: [
      /^\/content\/[a-z0-9-]+$/i,
      /^\/(shows|movies)\/[a-z0-9-]+\/[0-9a-f-]{8,}$/i,
      /^\/[a-z0-9-]{3,}$/i,
    ],
    series: true, peliculas: false,
    idsGlobales: [1899, 1825, 384],
  },
  {
    code: "pp", redes: [4330],
    hosts: ["paramountplus.com", "www.paramountplus.com"],
    rutas: [/^\/shows\/[a-z0-9-]+$/i],
    series: true, peliculas: false,
    idsGlobales: [531, 582, 1853],
  },
  {
    code: "at", redes: [2552],
    hosts: ["tv.apple.com"],
    rutas: [
      /^\/(show|movie)\/[a-z0-9-]+\/umc\.cmc\.[a-z0-9]+$/i,
      /^\/(show|movie)\/umc\.cmc\.[a-z0-9]+$/i,
    ],
    series: true, peliculas: true,
    idsGlobales: [350, 2243],
  },
];

/**
 * Arma el resumen regional a partir de la respuesta cruda de `watch/providers`.
 *
 * Vive acá y no en `enrich.ts` porque produce el tipo de este módulo y porque
 * `enrich.ts` es `server-only`: la única forma de probar los tres contadores es
 * que la función sea pura y esté de este lado.
 *
 * ⚠️ CUENTA REGIONES, NO PROVEEDORES. `pv2:` guardaba ids deduplicados y con
 * eso no se puede comprobar "≥60% de las regiones informan una misma otra":
 * la deduplicación se comió la frecuencia. AR se excluye acá — si AR tuviera
 * datos, la prioridad 1 del resolvedor ya habría cortado.
 */
export function resumenRegional(
  results: Record<string, { flatrate?: { provider_id: number }[] } | undefined>,
): ResumenRegional {
  const rp: Partial<Record<PlatformCode, number>> = {};
  let rt = 0;
  let ru = 0;
  for (const [region, v] of Object.entries(results ?? {})) {
    if (region === "AR") continue;
    const ids = (v?.flatrate ?? []).map((x) => x.provider_id);
    if (!ids.length) continue;
    rt++;
    let alguna = false;
    for (const a of ADAPTADORES_OFICIALES) {
      if (ids.some((i) => a.idsGlobales.includes(i))) {
        rp[a.code] = (rp[a.code] ?? 0) + 1;
        alguna = true;
      }
    }
    if (!alguna) ru++;
  }
  return { rt, rp, ru };
}

/** Los ids de red de una plataforma, si está habilitada para series. */
export function redesDePlataforma(code: PlatformCode): number[] {
  const a = ADAPTADORES_OFICIALES.find((x) => x.code === code);
  return a?.series ? a.redes : [];
}

/**
 * Quita el prefijo de locale, sea de la región que sea.
 *
 * Se aceptan TODOS. Medido: rechazar los extranjeros costaba 4 series y el 100%
 * de la señal de películas —las rutas reales son `/es/title/…`,
 * `/es-es/browse/…`, `/es/movie/umc.cmc.…`— y no evitaba ni un falso positivo.
 * El locale dice desde qué tienda se generó el enlace, no dónde se puede ver.
 *
 * ⚠️ Quitarlo NO afloja la ruta: `/br/browse` sigue siendo una portada y se
 * rechaza igual.
 */
export function sinLocale(pathname: string): string {
  const m = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/.*)$/i.exec(pathname);
  return m ? m[2] : pathname;
}

/**
 * ¿El enlace es una ficha oficial de esta plataforma?
 *
 * El host se compara COMPLETO, nunca con `includes`: `netflix.com.evil.ru`,
 * `netflix-ar.com` y `evil.example/netflix.com/…` contienen la cadena y no son
 * el dominio.
 */
export function enlaceDeLaPlataforma(homepage: string, def: AdaptadorOficial): boolean {
  if (!homepage) return false;
  let u: URL;
  try { u = new URL(homepage); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (!def.hosts.includes(u.hostname.toLowerCase())) return false;
  const p = sinLocale(u.pathname).replace(/\/+$/, "") || "/";
  return def.rutas.some((r) => r.test(p));
}

/**
 * ¿Hay una contradicción FUERTE?
 *
 * Sólo dos cosas descalifican. Todo lo demás se acepta, que es lo que hace que
 * la regla priorice cobertura.
 *
 *  1. **AR informa `flatrate` de otra plataforma.** Si TMDB sabe algo de
 *     Argentina y no es ésta, el dato en conflicto es el nuestro.
 *  2. **Los datos regionales muestran consistentemente otra plataforma**: al
 *     menos 5 regiones, ninguna con ésta, y ≥60% con una misma otra.
 *
 * 🔴 LO QUE YA NO ES CONTRADICCIÓN: que la plataforma aparezca en muchas
 * regiones y no en Argentina. Eso es el lag de TMDB, o sea exactamente el caso
 * que esta regla existe para cubrir.
 */
export function hayContradiccionFuerte(
  reg: ResumenRegional, def: AdaptadorOficial, arIds: number[],
): string | null {
  if (arIds.length && !arIds.some((i) => def.idsGlobales.includes(i))) {
    return "AR informa otra plataforma";
  }
  if (reg.rt >= MIN_REGIONES_CONTRA && !(reg.rp[def.code] ?? 0)) {
    for (const [code, n] of Object.entries(reg.rp)) {
      if (code !== def.code && (n ?? 0) >= reg.rt * PISO_DOMINANCIA) {
        return `otra plataforma (${code}) en ${n}/${reg.rt} regiones`;
      }
    }
  }
  return null;
}

/** Mínimo de regiones para que la ausencia signifique algo. */
const MIN_REGIONES_CONTRA = 5;
/** Qué proporción de regiones tiene que dominar otra plataforma. */
const PISO_DOMINANCIA = 0.6;

/**
 * La evidencia oficial. Devuelve la plataforma, o `null`.
 *
 * **SERIES** exigen red + enlace de la misma plataforma. **PELÍCULAS** deciden
 * sólo por el enlace, porque `networks` no existe para ellas — y si algo lo
 * poblara, tampoco se usaría.
 *
 * En los dos casos: ya estrenado en fecha argentina, dominio oficial exacto,
 * ruta de título, y sin contradicción fuerte.
 */
export function evidenciaOficialDe(opts: {
  datos: DatosTitulo;
  /** Ids de `flatrate` que TMDB informa para AR. Vacío si no informa nada. */
  arIds: number[];
  /** Fecha argentina, YYYY-MM-DD. */
  hoy: string;
  registro?: AdaptadorOficial[];
}): PlatformCode | null {
  const { tipo, estreno, redes, homepage, reg } = opts.datos;
  // Comparación de cadenas YYYY-MM-DD: ordena igual que la fecha y no construye
  // un Date con su huso. El día de esta app es el argentino.
  if (!estreno || estreno > opts.hoy) return null;

  const registro = opts.registro ?? ADAPTADORES_OFICIALES;
  let def: AdaptadorOficial | undefined;

  if (tipo === "tv") {
    // La red elige la plataforma; el enlace la confirma. Exactamente UNA red
    // soportada: dos distintas es ambiguo y no se resuelve adivinando.
    const cand = registro.filter((a) => a.series && redes.some((r) => a.redes.includes(r)));
    if (cand.length !== 1) return null;
    def = cand[0];
    if (!enlaceDeLaPlataforma(homepage, def)) return null;
  } else {
    // Películas: decide el enlace. Si matcheara más de una plataforma sería
    // ambiguo, pero los dominios son disjuntos por construcción.
    const cand = registro.filter((a) => a.peliculas && enlaceDeLaPlataforma(homepage, a));
    if (cand.length !== 1) return null;
    def = cand[0];
  }

  return hayContradiccionFuerte(reg, def, opts.arIds) ? null : def.code;
}
