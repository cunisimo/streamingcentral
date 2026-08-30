// Evidencia oficial ESTRICTA: cuándo un enlace oficial más una red de TMDB
// alcanzan para afirmar que una serie está en una plataforma en Argentina.
//
// EL AGUJERO QUE TAPA. TMDB tiene el catálogo regional incompleto. Medido el
// 2026-08-30 sobre las series de la red Disney+ estrenadas en 60 días: **15
// candidatos, 4 con proveedor AR y 11 sin ninguno**. El caso testigo es
// `tv:275224` (Gutiérrez Is mai neim), que JustWatch AR muestra como #1 en
// Disney+ y del que TMDB sólo conoce ID, MY y US. No es cache: el dato regional
// no existe. Ver `docs/medidas/2026-08-30-disponibilidad-disney.json`.
//
// 🔴 POR QUÉ ESTO NO ES "USAR `networks` COMO DISPONIBILIDAD". Que una serie sea
// "de Disney+" no dice que se vea en Disney+ Argentina — esa regla sigue siendo
// cierta y sigue prohibida. Lo que se permite acá es otra cosa: la red MÁS un
// enlace oficial de esa MISMA plataforma a ESE título concreto, MÁS que ya haya
// estrenado, MÁS que ninguna otra región lo contradiga. La regla vieja decía
// "`networks` nunca se usa"; la nueva dice **"`networks` nunca se usa sola"**.
//
// Sin `server-only`: es lógica pura, sin credenciales ni red, y todo el punto es
// poder probarla con `node --test`. Extensión `.ts` explícita en los imports por
// lo mismo, como en `top-plataformas.ts`.
import type { MediaType, PlatformCode } from "./types";

/** Los datos de TMDB que esta regla necesita. Nada más que esto. */
export interface DatosSerie {
  /** `first_air_date`, YYYY-MM-DD. */
  estreno: string | null;
  /** ids de `networks`. */
  redes: number[];
  /** `homepage`, tal cual viene. */
  homepage: string;
  /**
   * Los `provider_id` de `flatrate` que aparecen en **cualquier región que no
   * sea AR**, deduplicados. Se usa SÓLO para detectar contradicciones.
   *
   * ⚠️ ES UN CONJUNTO PLANO, NO UN MAPA POR REGIÓN, y la diferencia está medida.
   * Guardar `watch/providers` entero cuesta **1273 B por título** contra 214 B
   * de antes (+495%): un Home frío pasaba de 48 KB a 286 KB. Con los ids únicos
   * son 296 B (+38%), o sea **+18 KB en vez de +238 KB**.
   *
   * Alcanza porque `hayContradiccion` sólo deriva dos booleanos: si hay algún
   * dato regional y si alguno es de esta plataforma. **Si algún día una regla
   * necesita saber QUÉ región dice qué, hay que volver al mapa y subir la
   * versión de la clave `pv2:`** — no se puede reconstruir desde acá.
   */
  idsOtrasRegiones: number[];
}

/**
 * Una plataforma habilitada para esta regla.
 *
 * 🔴 CADA COMBINACIÓN SE VERIFICA A MANO ANTES DE ENTRAR. No se agrega una
 * plataforma "porque debe tener una red y un dominio": hay que mirar qué
 * devuelve TMDB de verdad. Hoy hay UNA sola entrada, y es la que se midió.
 */
export interface PlataformaOficial {
  code: PlatformCode;
  /** ids de `networks` de TMDB que son esta plataforma. */
  redes: number[];
  /** Hosts EXACTOS. Sin comodines, sin subdominios, sin sufijos. */
  hosts: string[];
  /** La ruta tiene que apuntar a UN título. */
  rutaTitulo: RegExp;
  /**
   * Ids de proveedor de TMDB que significan esta plataforma **en cualquier
   * región**, para el chequeo de contradicción.
   *
   * ⚠️ NO es lo mismo que `tmdbIds` de `providers-ar.ts` y no hay que
   * unificarlos: allá el 337 es el único id de Disney+ en Argentina, y meter el
   * 122 (el id asiático, verificado en ID/MY/TH) cambiaría lo que el `discover`
   * argentino considera Disney+. Acá se miran regiones ajenas a propósito.
   */
  idsGlobales: number[];
}

/**
 * El registro. Hoy: **sólo Disney+**.
 *
 * Netflix NO está, y es deliberado: su respaldo oficial es el top semanal
 * (`lib/top-plataformas.ts`), que es un dato publicado por la propia Netflix
 * sobre Argentina, mejor evidencia que cualquier enlace. Agregarla acá sería
 * duplicar el mecanismo con uno más débil.
 *
 * Las demás plataformas quedan fuera hasta medir cada una. Lo que hay que
 * verificar antes de sumar una: qué ids de `networks` usa TMDB, qué dominio
 * exacto sirve sus fichas, qué forma tiene la ruta de un título, y qué ids de
 * proveedor la representan en otras regiones.
 */
export const PLATAFORMAS_OFICIALES: PlataformaOficial[] = [
  {
    code: "d",
    // 2739 = "Disney+" en `networks`. Verificado en las 15 series de la muestra.
    redes: [2739],
    // Los dos hosts que TMDB devuelve. `press.disneyplus.com` y cualquier otro
    // subdominio quedan fuera: son prensa o corporativo, no una ficha.
    hosts: ["disneyplus.com", "www.disneyplus.com"],
    // `/browse/entity-<uuid>` es la forma que usan los 5 enlaces de Disney+ de
    // la muestra. Es específica de un título: `/`, `/home`, `/sign-up` y
    // `/brand/<x>` no matchean, que es exactamente lo que se quiere.
    // UUID COMPLETO: `{12}`, no `{0,12}`. Con el cuantificador flexible,
    // `…-85bb-` (terminado en guion) y cualquier identificador truncado pasaban
    // la validación. Las cinco URLs medidas traen el UUID entero.
    rutaTitulo: /^\/browse\/entity-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
    // 337 = Disney Plus (América, Europa). 122 = Disney+ (ID, MY, TH).
    // Los dos verificados en la medición.
    idsGlobales: [337, 122],
  },
];

/**
 * Los ids de red de una plataforma, si está habilitada para evidencia oficial.
 *
 * Lo usa el descubrimiento de "Últimos lanzamientos · Series": las redes de
 * ACÁ son las únicas por las que se buscan candidatos, así que la lista de
 * plataformas habilitadas es una sola y no se puede desincronizar.
 */
export function redesDePlataforma(code: PlatformCode): number[] {
  return PLATAFORMAS_OFICIALES.find((d) => d.code === code)?.redes ?? [];
}

/**
 * ¿La ruta empieza con un segmento de idioma-región de OTRO país?
 *
 * Disney+ sirve la misma ficha con y sin prefijo de locale, y en la muestra
 * apareció `tv:325313` ("Olivia") con `/es-es/browse/entity-…`: un enlace
 * explícito a **España**. Usarlo como prueba de disponibilidad argentina sería
 * exactamente el error que la regla prohíbe.
 *
 * Se acepta la ruta SIN locale (que es la neutral, la del caso testigo) y la de
 * `es-ar`. Cualquier otro locale se rechaza.
 *
 * ⚠️ Esto rechaza de más a propósito: si mañana Disney publicara `/pt-br/` de un
 * título que igual se ve acá, lo perdemos. El costo de equivocarse para el otro
 * lado es afirmar una disponibilidad falsa, que es mucho peor.
 */
export function partirLocale(pathname: string): { locale: string | null; resto: string } {
  const m = /^\/([a-z]{2}-[a-z]{2})(\/.*)?$/i.exec(pathname);
  if (!m) return { locale: null, resto: pathname };
  return { locale: m[1].toLowerCase(), resto: m[2] ?? "/" };
}

/** El locale de la propia región. Sólo éste, además de la ruta sin locale. */
const LOCALE_AR = "es-ar";

/**
 * ¿El enlace es una ficha oficial de esta plataforma?
 *
 * Se parsea con `URL` y se compara el **host completo**, nunca con `includes`:
 * `disneyplus.com.evil.ru`, `disneyplus-ar.com` y
 * `evil.example/disneyplus.com/…` contienen la cadena y no son el dominio.
 */
export function enlaceDeLaPlataforma(homepage: string, def: PlataformaOficial): boolean {
  if (!homepage) return false;
  let u: URL;
  try {
    u = new URL(homepage);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (!def.hosts.includes(u.hostname.toLowerCase())) return false;
  const { locale, resto } = partirLocale(u.pathname);
  if (locale && locale !== LOCALE_AR) return false;
  return def.rutaTitulo.test(resto.replace(/\/+$/, "") || "/");
}

/**
 * ¿Los datos regionales contradicen la afirmación?
 *
 * Contradicen cuando ALGUNA región tiene `flatrate` y NINGUNA incluye esta
 * plataforma: el mundo dice que este título se ve en otro lado. Si no hay datos
 * en ninguna región no hay contradicción — es el caso del título recién
 * estrenado, que es justamente el que esta regla existe para cubrir.
 *
 * Argentina se ignora acá: si AR tuviera datos, la prioridad 1 del resolvedor ya
 * habría decidido y esta regla ni se evaluaría.
 */
export function hayContradiccion(
  idsOtrasRegiones: number[], def: PlataformaOficial,
): boolean {
  if (!idsOtrasRegiones.length) return false;
  return !idsOtrasRegiones.some((i) => def.idsGlobales.includes(i));
}

/**
 * La evidencia oficial estricta. Devuelve la plataforma, o `null`.
 *
 * Las SEIS condiciones, todas obligatorias y todas simultáneas:
 *
 *  1. Es una serie **ya estrenada** según la fecha argentina.
 *  2. Tiene **exactamente una** red mapeada a una plataforma soportada.
 *  3. La `homepage` es **HTTPS** y su host está en la allowlist de esa misma
 *     plataforma.
 *  4. La ruta apunta a **un título**, no a una portada, sección o suscripción.
 *  5. La ruta **no** es de otra región.
 *  6. Ninguna otra región **contradice**.
 *
 * `movie` sale en la primera línea: `networks` es un campo de series y no se
 * infiere una película por esta vía, tenga los datos que tenga.
 */
export function evidenciaEnlaceOficial(opts: {
  tipo: MediaType;
  datos: DatosSerie;
  /** Fecha argentina, YYYY-MM-DD. */
  hoy: string;
  registro?: PlataformaOficial[];
}): PlatformCode | null {
  if (opts.tipo !== "tv") return null;

  const { estreno, redes, homepage, idsOtrasRegiones } = opts.datos;
  // 1. Estrenada. Comparación de cadenas YYYY-MM-DD, que ordena igual que la
  //    fecha y evita construir un Date con su huso.
  if (!estreno || estreno > opts.hoy) return null;

  const registro = opts.registro ?? PLATAFORMAS_OFICIALES;

  // 2. Exactamente UNA plataforma soportada entre las redes. Dos distintas es
  //    ambiguo y no se resuelve adivinando; una soportada más otras que no lo
  //    son (YouTube, Hulu) no crea ambigüedad.
  const candidatas = registro.filter((d) => redes.some((r) => d.redes.includes(r)));
  if (candidatas.length !== 1) return null;
  const def = candidatas[0];

  // 3, 4 y 5. El enlace tiene que ser de ESA plataforma.
  if (!enlaceDeLaPlataforma(homepage, def)) return null;

  // 6. Sin contradicción regional.
  if (hayContradiccion(idsOtrasRegiones, def)) return null;

  return def.code;
}
