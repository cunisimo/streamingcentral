// Qué plataforma garantiza la FUENTE del top oficial, más allá de lo que diga
// TMDB.
//
// Vive acá y no en `lib/top.ts` por lo mismo que `lib/miniseries.ts`: `top.ts`
// es `server-only` y arrastra Upstash, así que un test de Node no puede
// importarlo. Y esto es justo lo que hay que poder probar — la regla, no el
// fetch.
//
// Extensión `.ts` explícita en los imports de runtime, como en
// `idioma-adaptadores.ts`: es lo que necesita `node --test` para cargar este
// módulo, y todo el punto de que viva acá es poder probarlo.
import { hoyAR } from "./fecha.ts";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";
import type { MediaType, PlatformCode, UITitle } from "./types";

/** La clave con la que se identifica un título en la evidencia. */
export const claveTitulo = (tipo: MediaType, id: number) => `${tipo}:${id}`;

/**
 * El top oficial de Netflix ES la lista de lo más visto EN Netflix Argentina,
 * publicada por la propia Netflix. Para los títulos de ese bloque, entonces,
 * "está en Netflix" es un dato de la fuente, no una deducción nuestra — y es
 * mejor dato que `watch/providers` de TMDB, que llega tarde en los estrenos.
 *
 * Sin esto, un estreno de Netflix podía entrar #1 del top oficial y renderizarse
 * en gris con "No está en tus plataformas", adentro del bloque de Netflix y
 * abajo del rótulo "dato oficial". Pasó con "Moria" (`tv/322428`, semana
 * 2026-08-16): estrenó el 14/08 y TMDB no tenía proveedores en NINGUNA región.
 *
 * SOLO cuando no sabemos NADA. Si TMDB conoce el título y lo ubica en otras
 * plataformas, no hay lag que explicar: lo más probable es que la resolución
 * del TSV haya agarrado un homónimo, y ahí agregar la plataforma convertiría un
 * error de matcheo en una afirmación falsa con el sello de "oficial". Medido
 * sobre las tres semanas guardadas: 34 títulos únicos, 1 sin ningún proveedor
 * (éste) y 0 con proveedores que no incluyan Netflix.
 *
 * Devuelve el MISMO objeto si no hay nada que agregar, y una COPIA si lo hay:
 * `cardsByIds` hace `{ ...c }` pero `platforms` sigue siendo el array que
 * guardó el cache, así que mutarlo le agregaría la plataforma a la ficha que ve
 * el resto de la app.
 */
export function conPlataformaDeLaFuente(item: UITitle, platform: PlatformCode): UITitle {
  if (item.platforms.length) return item;
  return { ...item, platforms: [platform] };
}

// ============================================================================
// La misma evidencia, ahora para la FICHA
// ============================================================================

/**
 * Cuánto vale una semana del top como evidencia. Es el MISMO umbral con el que
 * `latestWeekRows` decide si el bloque puede llevar el rótulo "dato oficial":
 * si una semana ya está demasiado vieja para mostrarse como oficial, también lo
 * está para respaldar una afirmación de disponibilidad. Un solo umbral, un solo
 * criterio, y por eso el valor vive acá y `netflix-top10.ts` lo importa.
 */
export const VENTANA_RECIENTE_MS = 14 * 24 * 60 * 60 * 1000;

export const CLAVE_EVIDENCIA = "top:oficial:disponibles";

// La ventana ya acota el contenido, así que el TTL no decide cuándo rota:
// decide cuánto tarda en verse una corrección hecha a mano en la base (un
// `tmdb_id` arreglado, un `needs_review` que se baja). Cinco minutos, lo mismo
// que `TTL.editorial` y por el mismo motivo.
export const TTL_EVIDENCIA = 60 * 5;

/** Una fila de `netflix_top10`, con los cuatro campos que deciden si sirve. */
export interface FilaOficial {
  week: string;            // YYYY-MM-DD
  category: MediaType;
  tmdb_id: number | null;
  needs_review: boolean;
}

/**
 * El corte de fecha para el `where` de la consulta, en YYYY-MM-DD.
 *
 * Lleva UN DÍA DE HOLGURA sobre la ventana real, y es a propósito: la consulta
 * compara cadenas de fecha y `evidenciaOficial` compara milisegundos, así que
 * los dos bordes no caen exactamente en el mismo instante (`week` se parsea
 * como medianoche UTC y el día de la app es el argentino). Con la holgura el
 * SQL es siempre MÁS PERMISIVO que la regla, y quien decide de verdad es
 * `evidenciaOficial`. Al revés —un SQL más estricto— habría filas que la regla
 * aceptaría y que nunca llegarían a ella, que es el tipo de discrepancia que no
 * se ve hasta que alguien reporta que la ficha "a veces" se rompe.
 */
export function desdeSemana(ahora: number): string {
  return hoyAR(new Date(ahora - VENTANA_RECIENTE_MS - 24 * 60 * 60 * 1000));
}

/**
 * Qué filas del top oficial valen como evidencia de disponibilidad.
 *
 * TRES condiciones, y las tres son necesarias:
 *
 *  - `tmdb_id` resuelto. Sin id no hay a qué ficha atribuirle nada.
 *  - `needs_review = false`. Ésta es la que importa. `needs_review` marca las
 *    filas donde el título de TMDB NO es el que publicó Netflix: se aceptaron
 *    porque algo las respaldaba (el proveedor, o una segunda consulta acotada),
 *    pero son justamente las que pueden estar apuntando a un homónimo. Usar una
 *    de ésas para AFIRMAR disponibilidad sería convertir una duda declarada en
 *    un dato. En el top se muestran igual —ahí el peor caso es una card de más—
 *    pero la ficha dice "Disponible en Netflix", que es otra cosa.
 *  - `week` dentro de la ventana reciente.
 *
 * MIRA TODAS LAS SEMANAS DE LA VENTANA, no sólo la última, y ésa es la
 * corrección que evita una regresión programada: un título entra al top, se
 * arregla su ficha, y a la semana siguiente el cron trae otras veinte filas.
 * Con "la semana más nueva" como fuente, ese título perdía la evidencia de un
 * día para el otro y la ficha volvía sola a "No está en streaming" — sin que
 * nada hubiera cambiado en TMDB ni en nuestro código. La ventana de 14 días le
 * da el mismo margen que ya tiene el bloque del Top.
 *
 * Por lo mismo, una fila NUEVA con `needs_review = true` no invalida a una
 * anterior confiable del mismo `tipo:id`: esto acumula en un conjunto, no
 * resuelve por "la última gana". Que una resolución posterior haya quedado
 * dudosa no borra la evidencia de la semana en que no lo estuvo.
 *
 * Devuelve un array y no un `Set` porque esto se cachea, y un `Set` no
 * sobrevive el viaje a JSON.
 */
export function evidenciaOficial(filas: FilaOficial[], ahora: number): string[] {
  const out = new Set<string>();
  for (const f of filas) {
    if (f.tmdb_id == null || f.needs_review) continue;
    if (ahora - new Date(f.week).getTime() > VENTANA_RECIENTE_MS) continue;
    out.add(claveTitulo(f.category, f.tmdb_id));
  }
  return [...out];
}

/** Lo que devuelve la consulta: las filas y si hubo un fallo de transporte. */
export interface Consulta {
  filas: FilaOficial[];
  /** Supabase caído o sin configurar. NO se cachea. */
  fallo: boolean;
}

/**
 * La evidencia vigente, cacheada.
 *
 * UNA sola consulta por MISS: el `desde` sale de la fecha, no de una consulta
 * previa que pregunte cuál es la última semana. Ésa es la diferencia entre 12 y
 * 24 lecturas por hora en el peor caso, y de paso saca una carrera — entre
 * "¿cuál es la última semana?" y "traeme sus filas" puede correr el cron.
 *
 * Delega en `resolverConCache`, la MISMA función que usan `cachedIf` y
 * `cachedLocIf` en producción: los tests le inyectan un backend en memoria en
 * vez de reimplementar la semántica del cache. Un fallo se devuelve pero no se
 * guarda — congelar cinco minutos de "no sé" por un hipo de la base dejaría la
 * ficha rota justo después de arreglarla.
 */
export async function evidenciaCacheada(opts: {
  ahora: number;
  backend: BackendCache;
  consultar: (desde: string) => Promise<Consulta>;
}): Promise<Set<string>> {
  const ids = await resolverConCache<string[]>({
    clave: CLAVE_EVIDENCIA,
    ttl: TTL_EVIDENCIA,
    backend: opts.backend,
    producir: async () => {
      const { filas, fallo } = await opts.consultar(desdeSemana(opts.ahora));
      return { valor: evidenciaOficial(filas, opts.ahora), fallo };
    },
  });
  return new Set(ids);
}

// `plataformasDeFicha` vivía acá y se ELIMINÓ en la corrección de
// disponibilidad. Decidía plataformas por su cuenta, o sea que era un segundo
// camino además del central — y esa duplicación es justo lo que dejó el
// arreglo de Moria atado a la ficha mientras las cards seguían en gris.
//
// Lo que hacía ahora lo hace `resolverDisponibilidad` (lib/disponibilidad.ts),
// que consume `evidenciaCacheada` de este mismo archivo con las MISMAS reglas
// de ventana y de `needs_review`. Las pruebas que la cubrían siguen vivas,
// apuntadas al resolvedor.
