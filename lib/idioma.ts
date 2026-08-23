// Idioma de los títulos, y la reparación de lo que TMDB no traduce.
//
// Contexto medido en docs/medidas/2026-08-23-idioma-informe.md, sobre 29 casos
// verificados en el buscador real de cada plataforma argentina:
//
//   es-ES (hoy)         encuentra 18/29
//   es-MX               encuentra 28/29
//   es-MX ∪ original    encuentra 29/29
//
// Los 11 fallos de es-ES son TODOS de Netflix, Disney+ y Max. En Disney+ falla
// 8 de 9. En Prime Video no falla nunca, porque su buscador indexa títulos
// alternativos y el de las tres grandes no.
//
// LO QUE ESTE MÓDULO NO HACE: cambiar el idioma. `IDIOMA_BASE` sale de
// `IDIOMA_TITULOS` y su default sigue siendo es-ES.
//
// NO IMPORTA NADA DE `./tmdb`, ni siquiera un tipo: `tmdb.ts` importa de acá
// para el idioma base, y devolver el favor cerraba un ciclo.
import { AsyncLocalStorage } from "node:async_hooks";
import { crearSingleFlight } from "./single-flight.ts";

// --- Configuración -----------------------------------------------------------
export const IDIOMA_BASE = process.env.IDIOMA_TITULOS || "es-ES";
export const IDIOMA_FALLBACK = "es-ES";

const FALLBACK_PEDIDO = process.env.FALLBACK_IDIOMA !== "0";

// El fallback SOLO puede cambiar la salida si el idioma base es otro. Con
// es-ES es inerte, y por eso no entra en la huella: si entrara, apagarlo
// abriría un espacio de claves nuevo idéntico al anterior.
export const FALLBACK_ACTIVO = FALLBACK_PEDIDO && IDIOMA_BASE !== IDIOMA_FALLBACK;

// --- Huella de configuración -------------------------------------------------
export const RESOLVER_VERSION = "r1";

// FUNCIÓN PURA, y es la que USA `HUELLA_IDIOMA`. Los tests llaman a esta misma.
export function calcularHuella(
  idiomaBase: string, fallbackPedido: boolean, resolverVersion: string = RESOLVER_VERSION,
): string {
  const activo = fallbackPedido && idiomaBase !== IDIOMA_FALLBACK;
  return `${idiomaBase}${activo ? "+f" : ""}.${resolverVersion}`;
}

export const HUELLA_IDIOMA = calcularHuella(IDIOMA_BASE, FALLBACK_PEDIDO);

// TANDA 1: modo compatible — huella vacía, mismos bytes que antes, ningún
// arranque frío. En la tanda 2 esto pasa a `HUELLA_IDIOMA`.
export const HUELLA_EN_CLAVES = "";

// --- Qué hay que reparar: UN SOLO PREDICADO ---------------------------------
const NO_LATINO = /[^\u0000-\u024F\u2000-\u206F\u20A0-\u20BF\s]/;

export interface Localizable {
  title?: string;
  name?: string;
  overview?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
}

export interface Reparacion {
  titulo: boolean;
  sinopsis: boolean;
}

export function queReparar(t: Localizable): Reparacion {
  const titulo = t.title ?? t.name ?? "";
  const original = t.original_title ?? t.original_name ?? "";
  const idioma = t.original_language ?? "";

  const noLatino = NO_LATINO.test(titulo);

  // El título ES el original y el idioma original no es español ni inglés.
  //
  // `en` está excluido A PROPÓSITO y VERIFICADO con 12 casos: los 38 títulos
  // (3,7%) donde es-MX devuelve el original inglés son "Monsters, Inc.",
  // "Moana 2", "WandaVision", "Black Widow", "Game of Thrones", y en Argentina
  // esos SON los nombres publicados. Medido en Disney+: "Zootopia 2" aparece,
  // "Zootrópolis 2" no.
  const cayoAlOriginal = !!original && titulo === original
    && idioma !== "es" && idioma !== "en";

  return { titulo: noLatino || cayoAlOriginal, sinopsis: !(t.overview ?? "").trim() };
}

export function necesitaReparacion(t: Localizable): boolean {
  const r = queReparar(t);
  return r.titulo || r.sinopsis;
}

// La fusión usa EL MISMO predicado. Por CAMPO y no por objeto: un título al que
// solo le falta la sinopsis conserva su título es-MX.
//
// DEVUELVE LA MISMA REFERENCIA si nada mejoró. Es lo que permite contar como
// "reparado" solo lo que de verdad cambió.
export function fusionarPorCampo<T extends Localizable>(
  base: T, respaldo: Localizable | undefined | null,
): T {
  if (!respaldo) return base;
  const r = queReparar(base);
  if (!r.titulo && !r.sinopsis) return base;

  let cambio = false;
  const out: T = { ...base };

  if (r.titulo) {
    const t = respaldo.title ?? respaldo.name ?? "";
    // El respaldo también puede venir roto (una coreana sin traducción ni al
    // es-ES). Si no mejora, no se toca: mejor el original que un vacío.
    const mismo = t === (base.title ?? base.name ?? "");
    if (t && !NO_LATINO.test(t) && !mismo) {
      if (respaldo.title !== undefined) out.title = respaldo.title;
      if (respaldo.name !== undefined) out.name = respaldo.name;
      cambio = true;
    }
  }
  if (r.sinopsis && (respaldo.overview ?? "").trim()) {
    out.overview = respaldo.overview;
    cambio = true;
  }
  return cambio ? out : base;
}

// --- Métricas POR REQUEST ----------------------------------------------------
// AsyncLocalStorage y no un contador de módulo, por el mismo motivo que
// lib/cache.ts: en Vercel conviven varios requests en la misma instancia, y un
// contador global mezclaría los números de todos — o peor, uno reiniciaría los
// del otro a mitad de camino.
export interface MetricasIdioma {
  /** Requests REALES a TMDB por respaldo. Los cuenta quien de verdad sale a la
   *  red (`lib/single-flight.ts`), no el reparador: dos reparadores que
   *  comparten la misma promesa son UN pedido, no dos. */
  llamadas: number;
  /** Lotes donde se detectó al menos un título roto. */
  lotesConRotos: number;
  /** Títulos donde la fusión CAMBIÓ algo. No es lo mismo que detectados. */
  titulosReparados: number;
  /** Respaldos que fallaron. Cuentan la excepción, el timeout y la respuesta
   *  MALFORMADA (`null`/`undefined`). Una lista vacía válida NO es un fallo:
   *  es una respuesta correcta que simplemente no trae con qué reparar. */
  fallos: number;
}
const nuevas = (): MetricasIdioma => ({
  llamadas: 0, lotesConRotos: 0, titulosReparados: 0, fallos: 0,
});
const als = new AsyncLocalStorage<MetricasIdioma>();

/** Corre `fn` con un contador propio. Igual que `withCacheMetrics`. */
export async function withMetricasIdioma<T>(
  fn: () => Promise<T>,
): Promise<{ res: T; metricas: MetricasIdioma }> {
  const metricas = nuevas();
  const res = await als.run(metricas, fn);
  return { res, metricas };
}

function anotar(fn: (m: MetricasIdioma) => void) {
  const m = als.getStore();
  if (m) fn(m);
}

/** Las métricas del scope actual, o null fuera de uno. */
export function metricasIdiomaActuales(): MetricasIdioma | null {
  const m = als.getStore();
  return m ? { ...m } : null;
}

// --- EL punto único donde se pide un respaldo -------------------------------
// TODOS los caminos pasan por acá: pool, combinada, categoría, detalle, reco,
// personas y búsqueda. Es lo que hace que la métrica `llamadas` signifique
// "requests de RESPALDO", y no "llamadas a TMDB" ni "intentos lógicos".
//
// Dos reglas que antes no se cumplían:
//
//   1. La llamada BASE no se cuenta. El contador estaba en el single-flight de
//      detalles del recomendador, que sirve a los dos idiomas, así que cada
//      pedido base se anotaba como si fuera un respaldo.
//   2. Si varios consumidores comparten la misma promesa de respaldo, se cuenta
//      UNA sola vez. Por eso el conteo va en `alPedir`, que el single-flight
//      invoca solo cuando de verdad sale a la red.
const flightRespaldo = crearSingleFlight<unknown>({
  alPedir: () => anotar((m) => { m.llamadas++; }),
});

/**
 * Pide el respaldo en `IDIOMA_FALLBACK`, uniendo lo que ya esté en vuelo.
 *
 * `clave` identifica el PEDIDO, no el título: dos superficies que necesitan la
 * misma página de discover en es-ES comparten la llamada. Se le antepone el
 * idioma para que nunca colisione con un pedido base.
 */
export function pedirRespaldoIdioma<T>(clave: string, pedir: () => Promise<T>): Promise<T> {
  return flightRespaldo(
    `${IDIOMA_FALLBACK}:${clave}`, pedir as () => Promise<unknown>,
  ) as Promise<T>;
}

// --- Identidad dentro de un lote --------------------------------------------
// En lotes MIXTOS (películas y series juntas) el `id` NO alcanza: TMDB reutiliza
// los números entre tipos, así que la película 1399 y la serie 1399 existen las
// dos. Emparejar por id le daría a una el título de la otra.
export type ClaveDeLote<T> = (t: T) => string | null;

// Devuelve `null` cuando el tipo es AMBIGUO. `?:id` no sirve como clave: dos
// elementos sin tipo y con el mismo id colisionarían, y uno recibiría el título
// del otro — que es exactamente lo que la clave mixta viene a evitar.
// Un elemento sin clave se deja INTACTO y no se cruza con nada.
export function claveMixta(t: Localizable & { id?: number; media_type?: string }): string | null {
  if (t.id === undefined || !t.media_type) return null;
  return `${t.media_type}:${t.id}`;
}

/** Fija el tipo cuando el contexto lo conoce (una lista que es toda de un tipo). */
export function claveMixtaCon(tipo: string): ClaveDeLote<Localizable & { id?: number; media_type?: string }> {
  return (t) => (t.id === undefined ? null : `${t.media_type ?? tipo}:${t.id}`);
}
/** Para lotes de UN solo tipo, donde el id ya es único. */
export function clavePorId(t: Localizable & { id?: number }): string | null {
  return t.id === undefined ? null : String(t.id);
}

// --- Índice de lotes MIXTOS -------------------------------------------------
// `claveMixta` devuelve `null` cuando el tipo es ambiguo, y `new Map(items.map(
// (t) => [claveMixta(t), t]))` metía TODOS los ambiguos bajo la misma clave
// `null`: el último pisaba a los anteriores y después uno podía recibir el
// título de otro — exactamente lo que la clave mixta viene a evitar.
//
// Este índice no inserta claves nulas, y `conRespuesto` nunca hace `get(null)`.

export function indiceMixto<T>(items: T[], clave: ClaveDeLote<T>): Map<string, T> {
  const m = new Map<string, T>();
  for (const t of items) {
    const k = clave(t);
    if (k !== null) m.set(k, t);
  }
  return m;
}

/** El reemplazo del índice, o el original si la clave es ambigua o no está. */
export function conRespuesto<T>(indice: Map<string, T>, t: T, clave: ClaveDeLote<T>): T {
  const k = clave(t);
  if (k === null) return t;
  return indice.get(k) ?? t;
}

// --- EL mecanismo, uno solo --------------------------------------------------
// COSTE: UNA llamada extra por LOTE, no por título. Dos mediciones, que son de
// instrumentos distintos y no hay que mezclar (docs/medidas/):
//
//   -idioma-fallback.json  modelo de 72 páginas: 1021 títulos, 57 rotos (5,6%),
//                          concentrados en 21 de esas 72 (29,2%)
//   -idioma-home-e2e.json  composer REAL: 107 páginas de discover y 32 de
//                          fallback; 612 → 643 llamadas (+5,1%)
//
// El modelo dice la TASA; el end-to-end dice el COSTE. Reparar título por
// título habría costado +57 en el modelo, contra +21 por página.
//
// SI EL RESPALDO FALLA, se devuelve la base INTACTA **y se avisa**. El aviso no
// es cosmético: sin él, el llamador guardaría esa base sin reparar bajo una
// clave `es-MX+f` por 6 a 30 horas y el usuario vería títulos rotos hasta que
// expirara el TTL. Con `fallo: true` el llamador NO cachea y el próximo request
// vuelve a intentar.

export interface ResultadoReparacion<T> {
  items: T[];
  /** El respaldo falló: NO cachear este resultado. */
  fallo: boolean;
}

export async function repararLote<T extends Localizable>(
  base: T[],
  pedirRespaldo: () => Promise<Localizable[] | null | undefined>,
  etiqueta: string,
  opts: {
    /** Cómo se identifica cada elemento. `claveMixta` si el lote es mixto. */
    clave: ClaveDeLote<T>;
    claveRespaldo?: ClaveDeLote<Localizable>;
    /** Explícito: sin esto los tests del camino de FALLO no pueden correr,
     *  porque con es-ES la guarda sale antes y no ejecutan nada. */
    activo?: boolean;
  },
): Promise<ResultadoReparacion<T>> {
  const activo = opts.activo ?? FALLBACK_ACTIVO;
  // La guarda mira la CONFIGURACIÓN, no si hay títulos rotos.
  if (!activo) return { items: base, fallo: false };

  // Un elemento con clave `null` (tipo ambiguo) se deja INTACTO: no se puede
  // cruzar con nada sin arriesgar darle el título de otro.
  const rotos = new Set<string>();
  for (const t of base) {
    if (!necesitaReparacion(t)) continue;
    const k = opts.clave(t);
    if (k !== null) rotos.add(k);
  }
  if (!rotos.size) return { items: base, fallo: false };

  anotar((m) => { m.lotesConRotos++; });

  let respaldo: Localizable[] | null | undefined;
  try {
    // La llamada la cuenta el DUEÑO del request HTTP (o del single-flight), no
    // acá: dos reparadores que comparten la misma promesa son un solo pedido a
    // TMDB, y contarlo antes de ejecutar el callback informaría intentos
    // lógicos en vez de requests reales.
    respaldo = await pedirRespaldo();
  } catch (e) {
    anotar((m) => { m.fallos++; });
    console.error(`[idioma] fallback falló en ${etiqueta}; se sirve sin reparar y NO se cachea:`, e);
    return { items: base, fallo: true };
  }

  // `null` y `undefined` son FALLOS: la respuesta vino malformada y cachear la
  // base como si estuviera reparada la congelaría.
  if (respaldo === null || respaldo === undefined) {
    anotar((m) => { m.fallos++; });
    console.error(`[idioma] fallback malformado en ${etiqueta}; se sirve sin reparar y NO se cachea`);
    return { items: base, fallo: true };
  }

  // Una lista VACÍA devuelta correctamente por TMDB NO es una caída de
  // transporte: es una respuesta válida que simplemente no trae con qué
  // reparar. Tratarla como fallo dejaría esa clave sin cachear para siempre,
  // reintentando en cada request algo que nunca va a mejorar.
  // Un respaldo PARCIAL —trae algunos y no otros— es lo mismo: se repara lo que
  // hay y no se declara caída general.

  const claveResp = opts.claveRespaldo ?? (opts.clave as unknown as ClaveDeLote<Localizable>);
  const porClave = new Map<string, Localizable>();
  for (const r of respaldo) {
    const k = claveResp(r);
    if (k !== null) porClave.set(k, r);
  }

  const items = base.map((t) => {
    const k = opts.clave(t);
    if (k === null || !rotos.has(k)) return t;
    const arreglado = fusionarPorCampo(t, porClave.get(k));
    if (arreglado !== t) anotar((m) => { m.titulosReparados++; });
    return arreglado;
  });
  return { items, fallo: false };
}

export interface ResultadoReparacionUno<T> {
  item: T;
  fallo: boolean;
}

export async function repararUno<T extends Localizable>(
  base: T,
  pedirRespaldo: () => Promise<Localizable | null | undefined>,
  etiqueta: string,
  activo: boolean = FALLBACK_ACTIVO,
): Promise<ResultadoReparacionUno<T>> {
  if (!activo) return { item: base, fallo: false };
  if (!necesitaReparacion(base)) return { item: base, fallo: false };

  anotar((m) => { m.lotesConRotos++; });
  let respaldo: Localizable | null | undefined;
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    anotar((m) => { m.fallos++; });
    console.error(`[idioma] fallback falló en ${etiqueta}; se sirve sin reparar y NO se cachea:`, e);
    return { item: base, fallo: true };
  }
  if (!respaldo) {
    anotar((m) => { m.fallos++; });
    console.error(`[idioma] fallback vacío en ${etiqueta}; se sirve sin reparar y NO se cachea`);
    return { item: base, fallo: true };
  }
  // Se cuenta DESPUÉS de comprobar que la fusión cambió algo.
  const item = fusionarPorCampo(base, respaldo);
  if (item !== base) anotar((m) => { m.titulosReparados++; });
  return { item, fallo: false };
}

export function fallbackInerte(): boolean {
  return !FALLBACK_ACTIVO;
}
