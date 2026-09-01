// Cómo se recorre la ventana de "Próximamente".
//
// Vive en su propio módulo, sin una sola dependencia de plataforma —ni `Deno`,
// ni el cliente de TMDB— por el mismo motivo que `reconciliar.ts`: es la regla
// que decide QUÉ TÍTULOS SE MIRAN, y una regla así tiene que poder probarse sin
// levantar nada ni gastar una llamada.
//
// ============================================================================
// EL BUG QUE ESTE MÓDULO EXISTE PARA IMPEDIR
// ============================================================================
// `collectSeries` descubría con `sort_by=popularity.desc` y `MAX_PAGES = 3`.
// Medido el 2026-08-31 sobre la ventana de 90 días: **1900 series en 95
// páginas, de las que el sync miraba 60**. Un título de popularidad baja no
// entraba nunca, y la pasada de refresco tampoco lo traía porque sólo refresca
// lo que ya está.
//
// La consecuencia era sobre qué ES la tabla: no "los estrenos de la ventana",
// sino "lo que estaba en el top 60 el día en que se escribió cada fila".
//
// 🔴 LO QUE NO CAMBIA. La exigencia de un proveedor `flatrate` confirmado para
// Argentina se conserva intacta. Esto corrige QUÉ SE MIRA, no qué califica.
//
// ============================================================================
// POR QUÉ EL FILTRO DE PROVEEDOR VA EN EL `discover`, Y NO DESPUÉS
// ============================================================================
// Recorrer la ventana entera sin filtrar costaría **95 páginas + 1900
// `tvDetails` + 1900 `watch/providers`** por corrida. Con el filtro dentro del
// `discover` son **13 páginas y 259 títulos**.
//
// Eso sólo es válido si el filtro temprano no pierde nada, así que se midió
// contra el camino que ya existía:
//
//   - 36 series que el código viejo conservaba → el filtro temprano pierde **0**;
//   - muestreo de la COLA (páginas 20, 40, 60, 80 y 95 del orden por fecha, que
//     el código viejo no miraba nunca): 100 crudas, 20 con proveedor AR, pierde
//     **0** — y recupera títulos reales que antes eran invisibles;
//   - películas: 120 muestreadas a lo largo de las 130 páginas, **0** con
//     proveedor AR. Ese lado de la agenda está vacío por el catálogo de TMDB,
//     no por el corte de páginas.
//
// ⚠️ La lista de proveedores se pide a TMDB en cada corrida (`/watch/providers/
// {tipo}?watch_region=AR`, 58 ids) en vez de tomarse de `lib/providers-ar.ts`.
// Es a propósito: el filtro final acepta CUALQUIER `flatrate` argentino, y usar
// los 20 ids que Yump mapea dejaría afuera 7 series y 1 película de la ventana
// medida. Se conserva la semántica que ya había.

/**
 * Una fila de la tabla `providers`, y la forma de `watch/providers`.
 *
 * Los tipos se declaran acá en vez de importarse de `lib/tmdb.ts` por el mismo
 * motivo que en `reconciliar.ts`: importarlos, aunque fuera sólo el tipo, ataría
 * este módulo a un archivo que lee `Deno.env` **en el scope del módulo**. Desde
 * Node eso revienta al importar, y entonces esta lógica no se podría probar.
 */
export interface FilaProveedor {
  id: number;
  name: string;
  logo_path: string | null;
  display_priority: number | null;
}

export interface RespuestaProveedores {
  results?: Record<string, {
    link?: string;
    flatrate?: {
      provider_id: number;
      provider_name: string;
      logo_path?: string | null;
      display_priority?: number | null;
    }[];
  } | undefined>;
}

/**
 * Las filas de proveedor AR de una respuesta de `watch/providers`.
 *
 * 🔴 HAY UNA SOLA, Y ESE ES EL PUNTO. El sync lee los proveedores por DOS
 * caminos: sueltos para películas (`/movie/{id}/watch/providers`) y dentro del
 * detalle de la serie (`append_to_response=watch/providers`, que ahorra una
 * llamada por serie). Las dos respuestas tienen la misma forma.
 *
 * El riesgo no es que difieran los datos —medido sobre 20 series reales:
 * idénticos en 20 de 20— sino que alguien escriba un segundo extractor y con el
 * tiempo se separen. Hay un test.
 */
export function arFlatrateDe(r: RespuestaProveedores): FilaProveedor[] {
  return (r?.results?.["AR"]?.flatrate ?? []).map((p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logo_path: p.logo_path ?? null,
    display_priority: p.display_priority ?? null,
  }));
}

/** TMDB rechaza `page` por encima de 500. Es límite de la FUENTE, no una
 * decisión nuestra: no es un `MAX_PAGES` elegido, y pedir la 501 daría un error
 * en vez de menos cobertura. Con la ventana actual sobra —13 páginas— pero una
 * ventana más ancha o un catálogo más grande podrían llegar. */
export const TOPE_PAGINAS_TMDB = 500;

export interface PaginaDiscover<T> {
  /** Lo que el llamador quiere quedarse, ya reparado o filtrado. */
  results: T[];
  total_pages: number;
  /**
   * Cuántos resultados trajo TMDB, **antes** de reparar o filtrar.
   *
   * 🔴 EXISTE PARA QUE EL FILTRO PROPIO NO CORTE LA PAGINACIÓN. `repararLista`
   * descarta títulos ilegibles, así que una página puede llegar con 20
   * resultados y quedar en 0 después de reparar. Si el corte por página vacía
   * mirara `results`, esa página truncaría el recorrido en silencio — el mismo
   * bug que esta corrección arregla, por otro camino.
   *
   * Quien no filtre nada puede omitirlo: se usa `results.length`.
   */
  crudos?: number;
}

/**
 * Recorre una consulta paginada de TMDB **entera**, sin tope propio.
 *
 * Tres cosas que no son obvias y que cada una es un test:
 *
 *  - **Un fallo NO devuelve un recorrido parcial.** El código viejo hacía
 *    `catch { break }` y seguía con lo recolectado: eso escribe una agenda
 *    incompleta como si estuviera completa, y el paso de reconciliación decide
 *    borrados con ella. Acá el error sube y la corrida entera se aborta.
 *  - **Una página vacía corta**, aunque `total_pages` diga que hay más. Es la
 *    defensa contra metadata inconsistente, que si no sería un bucle pidiendo
 *    páginas vacías hasta el tope.
 *  - **Se deduplica por `tipo:id`**, nunca por el id solo: TMDB reutiliza los
 *    números entre tipos.
 */
export async function descubrirTodo<T>(opts: {
  pedir: (pagina: number) => Promise<PaginaDiscover<T>>;
  clave: (x: T) => string;
}): Promise<T[]> {
  const vistos = new Set<string>();
  const out: T[] = [];
  let pagina = 1;
  let total = 1;

  while (pagina <= total && pagina <= TOPE_PAGINAS_TMDB) {
    const res = await opts.pedir(pagina);
    // `total_pages` se relee en cada página a propósito: TMDB puede corregirlo
    // mientras se pagina. El tope de arriba y el corte por página vacía son los
    // que garantizan que esto termine igual.
    total = Number.isFinite(res.total_pages) ? res.total_pages : total;
    const items = res.results ?? [];
    // Lo que decide seguir es la FUENTE, no nuestro filtro. Ver `crudos`.
    const rindio = res.crudos ?? items.length;
    if (!rindio) break;
    for (const x of items) {
      const k = opts.clave(x);
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push(x);
    }
    pagina++;
  }
  return out;
}

/**
 * Orden determinístico por fecha, con el id como desempate.
 *
 * Hace falta porque el orden de llegada NO es estable: TMDB reordena sus
 * resultados y las páginas pueden moverse entre pedidos. Sin un orden total,
 * dos corridas del mismo día producirían agendas distintas.
 *
 * Lo que no tiene fecha va al final en vez de descartarse: descartar es una
 * decisión del llamador, y acá se ordena.
 */
export function ordenarPorFecha<T>(
  items: T[], fechaDe: (x: T) => string | null, idDe: (x: T) => number,
): T[] {
  return [...items].sort((a, b) => {
    const fa = fechaDe(a), fb = fechaDe(b);
    if (fa !== fb) {
      if (!fa) return 1;
      if (!fb) return -1;
      return fa < fb ? -1 : 1;
    }
    return idDe(a) - idDe(b);
  });
}

/**
 * El filtro que NO cambió: sólo entra lo que tiene al menos un `flatrate`
 * argentino confirmado por TMDB.
 *
 * 🔴 LA POPULARIDAD NO PARTICIPA. Es la única razón por la que un título puede
 * quedar afuera acá, y es la que el dueño decidió conservar: no se infiere
 * disponibilidad por `network` ni por `homepage`, y no se usa la evidencia
 * `oficial-probable` para títulos futuros.
 *
 * Se extrajo del cuerpo del sync para poder probarla sin base ni red.
 */
export async function filtrarPorProveedorAR<T, P extends { id: number }>(
  items: T[],
  leer: (x: T) => Promise<P[]>,
  lote = 10,
): Promise<{ item: T; providers: P[] }[]> {
  const out: { item: T; providers: P[] }[] = [];
  for (let i = 0; i < items.length; i += lote) {
    const slice = items.slice(i, i + lote);
    const provs = await Promise.all(slice.map(leer));
    for (let j = 0; j < slice.length; j++) {
      if (!provs[j].length) continue;
      out.push({ item: slice[j], providers: provs[j] });
    }
  }
  return out;
}
