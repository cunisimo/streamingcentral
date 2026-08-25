// Qué plataforma garantiza la FUENTE de un bloque del Top, más allá de lo que
// diga TMDB.
//
// Vive acá y no en `lib/top.ts` por lo mismo que `lib/miniseries.ts`: `top.ts`
// es `server-only` y arrastra Upstash, así que un test de Node no puede
// importarlo. Y esto es justo lo que hay que poder probar — la regla, no el
// fetch.
import type { PlatformCode, UITitle } from "./types";

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
