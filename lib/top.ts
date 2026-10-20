import "server-only";
import { cardsByIds } from "./enrich";
import { ultimasPublicaciones } from "./top-manual";
import { platformOrder } from "./providers-ar";
import { conPlataformaDeLaFuente } from "./top-plataformas";
import { componerTop, type ResultadoTop } from "./top-composer";
import type { MediaType, PlatformCode } from "./types";

export type { EstadoBloque, ResultadoTop, TopBlock, TopPayload, TopSlot } from "./top-composer";

/**
 * El Top público: SÓLO las publicaciones manuales del dueño, bloque por bloque.
 * La lógica vive en `lib/top-composer.ts` (puro, con pruebas); acá se enchufan
 * las lecturas reales.
 *
 * Desde el 2026-10-20 no hay fuente alternativa: ni el top automático de
 * Netflix (`netflix_top10`, conservada como historial y sin lectores) ni la
 * popularidad de TMDB. `cardsByIds` sólo enriquece los títulos que eligió el
 * dueño; no elige ni ordena nada.
 */
export function buildTop(tipo: MediaType, providers: PlatformCode[]): Promise<ResultadoTop> {
  return componerTop(tipo, providers, {
    leerPublicaciones: ultimasPublicaciones,
    enriquecer: cardsByIds,
    conPlataforma: conPlataformaDeLaFuente,
    orden: platformOrder,
  });
}
