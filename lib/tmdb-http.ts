// De un fallo del DATO PRINCIPAL de TMDB a una respuesta HTTP de nuestras rutas.
// Etapa 3.a de capacidad (#19), informe de la Etapa 3 §12 (H8). Módulo puro.
//
// Antes, `detail()` o `search()` propagaban y la ruta respondía
// `500 { error: "Error: TMDB 429 en …" }`; `useApi` marcaba `error` y
// `DetailView` pintaba "Sin conexión. Revisá tu conexión" — falso: la conexión
// del usuario estaba bien, el que no respondía era TMDB.
//
// Ahora: TMDB caído (429, 5xx, red, timeout, cuerpo, rechazada) → `503` con
// `Retry-After` y un motivo que el cliente reconoce; `404` de TMDB → `404`;
// cualquier otra cosa → `null`, y la ruta sigue respondiendo `500` como hoy
// (un bug propio no se disfraza de TMDB). Sólo se usa para el dato PRINCIPAL:
// lo opcional (proveedores, relacionados, trailer) se sirve degradado y se
// marca, no se rechaza.
import { esErrorTmdb } from "./tmdb-error.ts";

export const MOTIVO_TMDB_NO_DISPONIBLE = "tmdb-no-disponible";
export const MOTIVO_NO_ENCONTRADO = "no-encontrado";
/** Cuando TMDB no dijo cuánto esperar: 5 s, el mismo orden que su `Retry-After` típico. */
export const REINTENTAR_POR_DEFECTO_MS = 5000;

export interface RespuestaError {
  status: number;
  headers: Record<string, string>;
  body: { error: string; reintentarEnMs?: number };
}

export function respuestaDeErrorTmdb(e: unknown): RespuestaError | null {
  if (!esErrorTmdb(e)) return null;
  if (e.estado === 404) return { status: 404, headers: {}, body: { error: MOTIVO_NO_ENCONTRADO } };
  const reintentarEnMs = e.retryAfterMs ?? REINTENTAR_POR_DEFECTO_MS;
  return {
    status: 503,
    headers: { "Retry-After": String(Math.ceil(reintentarEnMs / 1000)) },
    body: { error: MOTIVO_TMDB_NO_DISPONIBLE, reintentarEnMs },
  };
}
