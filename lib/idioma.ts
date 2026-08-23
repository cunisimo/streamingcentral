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
// `IDIOMA_TITULOS` y su default sigue siendo es-ES. El cambio se hace con la
// variable de entorno, en la tanda 2 del plan.
//
// NO IMPORTA NADA DE `./tmdb`, ni siquiera un tipo: `tmdb.ts` importa de acá
// para el idioma base, y devolver el favor cerraba un ciclo. La forma
// estructural `Localizable` alcanza y no acopla los dos módulos.

// --- Configuración -----------------------------------------------------------
export const IDIOMA_BASE = process.env.IDIOMA_TITULOS || "es-ES";

// A dónde se cae cuando TMDB no tiene la traducción. Es una constante y no una
// variable: es-ES es el único idioma con cobertura completa medida (es-AR dio 0%
// en la muestra de 60 y /translations solo devuelve ES y MX).
export const IDIOMA_FALLBACK = "es-ES";

// Kill switch. Ver el runbook: cambiar la variable NO afecta a los deployments
// existentes — hace falta un deployment nuevo o un Redeploy.
const FALLBACK_PEDIDO = process.env.FALLBACK_IDIOMA !== "0";

// El fallback SOLO puede cambiar la salida si el idioma base es otro. Con
// es-ES es inerte, y por eso no entra en la huella: si entrara, apagarlo
// abriría un espacio de claves nuevo idéntico al anterior y provocaría un
// arranque frío sin ningún motivo.
export const FALLBACK_ACTIVO = FALLBACK_PEDIDO && IDIOMA_BASE !== IDIOMA_FALLBACK;

// --- Huella de configuración -------------------------------------------------
// Toda clave de cache que guarde `title`, `name` u `overview` la lleva. Sin
// esto, un rollback a es-ES seguiría leyendo títulos mexicanos de las mismas
// claves hasta que expire el TTL, y el rollback no revertiría nada.
//
// Sube al cambiar el predicado de reparación o la fusión: dos resolvers
// distintos producen contenido distinto bajo la misma configuración.
export const RESOLVER_VERSION = "r1";

// FUNCIÓN PURA, y es la que USA `HUELLA_IDIOMA`. No es una fórmula para copiar
// en un test: los tests llaman a esta misma. Una réplica en el test puede
// quedar verde mientras la implementación real cambia, que es exactamente lo
// que no queremos de este cálculo.
export function calcularHuella(
  idiomaBase: string, fallbackPedido: boolean, resolverVersion: string = RESOLVER_VERSION,
): string {
  const activo = fallbackPedido && idiomaBase !== IDIOMA_FALLBACK;
  return `${idiomaBase}${activo ? "+f" : ""}.${resolverVersion}`;
}

export const HUELLA_IDIOMA = calcularHuella(IDIOMA_BASE, FALLBACK_PEDIDO);

// TANDA 1: los constructores de clave se cablean en MODO COMPATIBLE, o sea con
// huella vacía, para producir exactamente los mismos bytes que antes y no
// provocar ningún arranque frío. En la tanda 2 esto pasa a `HUELLA_IDIOMA` y
// ahí ocurre la única invalidación del plan.
export const HUELLA_EN_CLAVES = "";

// --- Qué hay que reparar -----------------------------------------------------
// UN SOLO PREDICADO, compartido por la detección y por la fusión. Estaban
// separados y no coincidían: la señal 3 (el título cayó al original) marcaba el
// título como roto, pero la fusión solo reemplazaba títulos en alfabeto no
// latino. Resultado: se pagaba la llamada de reparación y no se reparaba nada.

// Latín básico + suplemento + extendido A/B, puntuación general y símbolos de
// moneda. Todo lo de afuera (hangul, kana, han, cirílico, árabe) es un título
// que no se puede mostrar en una app en español.
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
  /** El título hay que reemplazarlo por el del idioma de respaldo. */
  titulo: boolean;
  /** La sinopsis vino vacía. */
  sinopsis: boolean;
}

export function queReparar(t: Localizable): Reparacion {
  const titulo = t.title ?? t.name ?? "";
  const original = t.original_title ?? t.original_name ?? "";
  const idioma = t.original_language ?? "";

  // 1. Alfabeto que no se puede mostrar (`런닝맨`).
  const noLatino = NO_LATINO.test(titulo);

  // 2. El título ES el original y el idioma original no es español ni inglés:
  //    señal de que no hay traducción y TMDB cayó al original.
  //
  //    `en` está excluido A PROPÓSITO y VERIFICADO con 12 casos. Los 38 títulos
  //    (3,7%) donde es-MX devuelve el original inglés son "Monsters, Inc.",
  //    "Moana 2", "WandaVision", "Black Widow", "Game of Thrones": en Argentina
  //    esos SON los nombres publicados. Medido en Disney+: con "Zootopia 2" la
  //    película aparece y con "Zootrópolis 2" NO. Repararlos rompería lo único
  //    que funciona.
  const cayoAlOriginal = !!original && titulo === original
    && idioma !== "es" && idioma !== "en";

  return {
    titulo: noLatino || cayoAlOriginal,
    sinopsis: !(t.overview ?? "").trim(),
  };
}

export function necesitaReparacion(t: Localizable): boolean {
  const r = queReparar(t);
  return r.titulo || r.sinopsis;
}

// La fusión usa EL MISMO predicado: si `queReparar` dice que el título hay que
// reemplazarlo, se reemplaza. Es por CAMPO y no por objeto — un título al que
// solo le falta la sinopsis conserva su título es-MX, que es justo lo que se
// fue a buscar.
export function fusionarPorCampo<T extends Localizable>(base: T, respaldo: Localizable | undefined): T {
  if (!respaldo) return base;
  const r = queReparar(base);
  const out: T = { ...base };

  if (r.titulo) {
    const t = respaldo.title ?? respaldo.name ?? "";
    // El respaldo también puede venir roto (una película coreana sin traducción
    // ni al es-ES). Si no mejora, no se toca: mejor el original que un vacío.
    if (t && !NO_LATINO.test(t)) {
      if (respaldo.title !== undefined) out.title = respaldo.title;
      if (respaldo.name !== undefined) out.name = respaldo.name;
    }
  }
  if (r.sinopsis && (respaldo.overview ?? "").trim()) {
    out.overview = respaldo.overview;
  }
  return out;
}

// --- Métricas ----------------------------------------------------------------
// Cuántas llamadas de reparación se hicieron. Es lo que demuestra que con es-ES
// el mecanismo está inerte: tiene que dar 0.
const metricas = { llamadas: 0, lotes: 0, titulosReparados: 0, fallos: 0 };
export function metricasFallback() { return { ...metricas }; }
export function reiniciarMetricasFallback() {
  metricas.llamadas = 0; metricas.lotes = 0; metricas.titulosReparados = 0; metricas.fallos = 0;
}

// --- EL mecanismo, uno solo --------------------------------------------------
// Todas las superficies pasan por acá. Antes cada una podía implementar su
// variante y divergir; ahora la guarda de inercia, el manejo de fallos y la
// fusión viven en un solo lugar.
//
// COSTE: UNA llamada extra por LOTE, no por título. Medido sobre un Home frío
// de n,d,m: 1021 títulos, 57 rotos (5,6%) en 32 de 107 páginas. Reparar título
// por título costaba +57 llamadas; así cuesta +32, porque un discover repara
// hasta 20 de una vez.
//
// SI EL RESPALDO FALLA, se devuelve la base INTACTA. El fallback es una mejora
// opcional: una página válida en es-MX con una sinopsis faltante es mejor que
// ninguna página.

/** Repara un lote con UNA llamada extra. Devuelve la base si algo falla. */
export async function repararLote<T extends Localizable & { id: number }>(
  base: T[],
  pedirRespaldo: () => Promise<Localizable[]>,
  etiqueta: string,
  // Explícito y con default: sin esto los tests del camino de FALLO no se
  // pueden escribir — con la config del proceso en es-ES la guarda sale antes
  // y el try/catch nunca corre, o sea que el test pasa sin probar nada.
  activo: boolean = FALLBACK_ACTIVO,
): Promise<T[]> {
  // La guarda mira la CONFIGURACIÓN, no si hay títulos rotos. Que con es-ES no
  // haya rotos es una propiedad de los datos y podría dejar de cumplirse.
  if (!activo) return base;

  const rotos = new Set<number>();
  for (const t of base) if (necesitaReparacion(t)) rotos.add(t.id);
  if (!rotos.size) return base;

  metricas.lotes++;
  let respaldo: Localizable[];
  try {
    metricas.llamadas++;
    respaldo = await pedirRespaldo();
  } catch (e) {
    metricas.fallos++;
    console.error(`[idioma] fallback falló en ${etiqueta}, se sirve sin reparar:`, e);
    return base;
  }

  const porId = new Map<number, Localizable>();
  for (const r of respaldo) {
    const id = (r as { id?: number }).id;
    if (typeof id === "number") porId.set(id, r);
  }

  return base.map((t) => {
    if (!rotos.has(t.id)) return t;
    const arreglado = fusionarPorCampo(t, porId.get(t.id));
    if (arreglado !== t) metricas.titulosReparados++;
    return arreglado;
  });
}

/** Repara UN título con una llamada extra. Devuelve la base si algo falla. */
export async function repararUno<T extends Localizable>(
  base: T,
  pedirRespaldo: () => Promise<Localizable | null>,
  etiqueta: string,
  activo: boolean = FALLBACK_ACTIVO,
): Promise<T> {
  if (!activo) return base;
  if (!necesitaReparacion(base)) return base;

  metricas.lotes++;
  try {
    metricas.llamadas++;
    const respaldo = await pedirRespaldo();
    if (!respaldo) return base;
    metricas.titulosReparados++;
    return fusionarPorCampo(base, respaldo);
  } catch (e) {
    metricas.fallos++;
    console.error(`[idioma] fallback falló en ${etiqueta}, se sirve sin reparar:`, e);
    return base;
  }
}

// --- La guarda, expuesta para las superficies que quieran saltear trabajo ----
export function fallbackInerte(): boolean {
  return !FALLBACK_ACTIVO;
}
