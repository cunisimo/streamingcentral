// Qué plataforma garantiza la FUENTE de un bloque del Top, más allá de lo que
// diga TMDB. Desde el 2026-10-20 la única fuente es la carga manual del dueño
// (`lib/top.ts`): el top automático de Netflix y su evidencia de
// disponibilidad se retiraron y su código se borró (ver `docs/ESTADO.md`).
//
// Vive acá y no en `lib/top.ts` por lo mismo que `lib/miniseries.ts`: `top.ts`
// es `server-only` y arrastra Upstash, así que un test de Node no puede
// importarlo. Y esto es justo lo que hay que poder probar — la regla, no el
// fetch.
//
// Extensión `.ts` explícita en los imports de runtime, como en
// `idioma-adaptadores.ts`: es lo que necesita `node --test` para cargar este
// módulo, y todo el punto de que viva acá es poder probarlo.
import { suprimirPlataformas } from "./supresiones-disponibilidad.ts";
import type { MediaType, PlatformCode, UITitle } from "./types";

/** La clave con la que se identifica un título en la evidencia. */
export const claveTitulo = (tipo: MediaType, id: number) => `${tipo}:${id}`;

/**
 * En un bloque del Top cargado a mano, la plataforma la eligió el dueño al
 * armar el ranking: "está en esta plataforma" es un dato del bloque, no una
 * deducción nuestra — y es mejor dato que `watch/providers` de TMDB, que llega
 * tarde en los estrenos. Sin esto, un estreno que TMDB todavía no tiene
 * fichado entraría al bloque en gris y con "No está en tus plataformas". Pasó
 * con "Moria" (`tv/322428`, agosto de 2026, cuando el bloque de Netflix
 * todavía salía del top automático): TMDB no tenía proveedores en NINGUNA
 * región.
 *
 * SOLO cuando no sabemos NADA. Si TMDB conoce el título y lo ubica en otras
 * plataformas, no se agrega la del bloque: el dato en conflicto es el nuestro
 * (un `tmdb_id` equivocado), y pintarlo en gris es la pista visible de que ese
 * puesto hay que revisarlo.
 *
 * Devuelve el MISMO objeto si no hay nada que agregar, y una COPIA si lo hay:
 * `cardsByIds` hace `{ ...c }` pero `platforms` sigue siendo el array que
 * guardó el cache, así que mutarlo le agregaría la plataforma a la ficha que ve
 * el resto de la app.
 */
export function conPlataformaDeLaFuente(item: UITitle, platform: PlatformCode): UITitle {
  if (item.platforms.length) return item;
  // La plataforma del bloque también pasa por las supresiones: si el dueño
  // verificó que el título NO está ahí, el bloque no lo vuelve a poner. Es la
  // misma regla que en el resolvedor —la verificación directa gana— y así el
  // Top no contradice a la ficha del mismo título.
  return { ...item, platforms: suprimirPlataformas(claveTitulo(item.type, item.id), "AR", [platform]) };
}
