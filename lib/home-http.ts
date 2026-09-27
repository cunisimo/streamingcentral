// De un payload del Home a la respuesta HTTP de /api/home. Etapa 3.c.1 (#19),
// informe §41.5/§42. Módulo puro.
//
// Los finales `pausa`, `pausa-indeterminada` y `presupuesto-insuficiente` de
// lib/home-servir.ts (sin último bueno y con la pausa ante 429 vigente) NO son
// un Home: son un 503 con `Retry-After` y el cuerpo que el cliente YA reconoce
// (lib/tmdb-http.ts: `useApi` → error, data null → "No pudimos cargar el
// inicio" + Reintentar). Un 200 vacío con `motivo: "pausa"` sería leído como
// "Nada en tus plataformas", que es falso. Los vacíos de la Etapa 2
// (`espera-agotada`, `cancelada`) siguen siendo el 200 de siempre.
import { MOTIVO_TMDB_NO_DISPONIBLE, REINTENTAR_POR_DEFECTO_MS } from "./tmdb-http.ts";

const MOTIVOS_503 = new Set(["pausa", "pausa-indeterminada", "presupuesto-insuficiente"]);

export interface RespuestaHome {
  status: 200 | 503;
  headers: Record<string, string>;
  body: unknown;
}

export function respuestaDelHome<T extends object>(payload: T): RespuestaHome {
  const { motivo, reintentarEnMs: sugerido } = payload as { motivo?: string; reintentarEnMs?: number };
  if (!motivo || !MOTIVOS_503.has(motivo)) return { status: 200, headers: {}, body: payload };
  const reintentarEnMs = sugerido && sugerido > 0 ? sugerido : REINTENTAR_POR_DEFECTO_MS;
  return {
    status: 503,
    headers: { "Retry-After": String(Math.max(1, Math.ceil(reintentarEnMs / 1000))) },
    body: { error: MOTIVO_TMDB_NO_DISPONIBLE, motivo, reintentarEnMs },
  };
}
