import type { MediaType } from "./types";

/**
 * El `?tipo=` de `/lista/ultimos`, validado.
 *
 * Lo pone el "Ver todas" del riel del Home para abrir la lista en el mismo tipo
 * que se estaba mirando. Sólo el valor exacto `"tv"` abre en Series; cualquier
 * otra cosa cae en `"movie"`, que es el default del riel.
 *
 * Vive acá, en un módulo puro, porque lo consume un componente de cliente y así
 * se puede probar sin montar React ni un navegador. Ver `tipo-lista.test.ts`.
 */
export function tipoDeParametro(valor: string | null | undefined): MediaType {
  return valor === "tv" ? "tv" : "movie";
}
