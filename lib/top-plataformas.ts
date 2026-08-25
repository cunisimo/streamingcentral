// Qué plataforma garantiza la FUENTE del top oficial, más allá de lo que diga
// TMDB.
//
// Vive acá y no en `lib/top.ts` por lo mismo que `lib/miniseries.ts`: `top.ts`
// es `server-only` y arrastra Upstash, así que un test de Node no puede
// importarlo. Y esto es justo lo que hay que poder probar — la regla, no el
// fetch.
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

/** Una fila de `netflix_top10`, con los tres campos que deciden si sirve. */
export interface FilaOficial {
  category: MediaType;
  tmdb_id: number | null;
  needs_review: boolean;
}

/**
 * Qué filas del top oficial valen como evidencia de disponibilidad.
 *
 * DOS condiciones, y las dos son necesarias:
 *
 *  - `tmdb_id` resuelto. Sin id no hay a qué ficha atribuirle nada.
 *  - `needs_review = false`. Ésta es la que importa. `needs_review` marca las
 *    filas donde el título de TMDB NO es el que publicó Netflix: se aceptaron
 *    porque algo las respaldaba (el proveedor, o una segunda consulta acotada),
 *    pero son justamente las que pueden estar apuntando a un homónimo. Usar una
 *    de ésas para AFIRMAR disponibilidad sería convertir una duda declarada en
 *    un dato. En el top se muestran igual —ahí el peor caso es una card de más—
 *    pero la ficha dice "Disponible en Netflix", que es otra cosa.
 *
 * Devuelve un array y no un `Set` porque esto se cachea, y un `Set` no
 * sobrevive el viaje a JSON.
 */
export function evidenciaOficial(filas: FilaOficial[]): string[] {
  const out = new Set<string>();
  for (const f of filas) {
    if (f.tmdb_id == null || f.needs_review) continue;
    out.add(claveTitulo(f.category, f.tmdb_id));
  }
  return [...out];
}

/**
 * Las plataformas de una ficha: las de TMDB y, si TMDB no sabe nada, la
 * evidencia del top oficial como respaldo.
 *
 * EL ORDEN DE LOS CHEQUEOS ES LA OPTIMIZACIÓN. Si TMDB devolvió aunque sea una
 * plataforma, `leerEvidencia` NO SE LLAMA: no hay lectura a Supabase, no hay
 * cache que consultar, no hay nada. Eso deja el costo extra en las fichas donde
 * TMDB vino vacío, que son pocas y son exactamente las rotas.
 *
 * Y sólo se agrega `n` cuando TMDB no trajo NADA, por el mismo motivo que en el
 * bloque del Top: si TMDB conoce el título y lo ubica en otro lado, el dato en
 * conflicto es el nuestro, no el suyo.
 *
 * `leerEvidencia` puede LANZAR (Supabase caído). Ahí no se infiere nada y la
 * ficha queda como estaba: una caída de nuestra base no puede producir una
 * afirmación de disponibilidad. Nunca al revés.
 *
 * Devuelve el MISMO array si no hay nada que agregar. `providersOf` cachea
 * `{ codes, links, watchLink }` y `codes` es el array que quedó guardado en
 * Redis (o en el mapa en memoria): mutarlo le metería Netflix a todas las
 * superficies que compartan esa entrada.
 */
export async function plataformasDeFicha(
  tipo: MediaType, id: number,
  deTmdb: PlatformCode[],
  leerEvidencia: () => Promise<Set<string>>,
): Promise<PlatformCode[]> {
  if (deTmdb.length) return deTmdb;
  let evidencia: Set<string>;
  try {
    evidencia = await leerEvidencia();
  } catch {
    return deTmdb;
  }
  return evidencia.has(claveTitulo(tipo, id)) ? ["n"] : deTmdb;
}
