// Lo que /api/health expone de la pausa ante 429: SÓLO agregados (Etapa
// 3.c.1, informe §40.6/§41.4). Módulo puro: convierte la tupla del script
// SALUD (lib/pausa-lua.ts) en un objeto con nombres, VALIDANDO la forma —
// Redis caído, una respuesta de otra forma o una tupla rara son `null`,
// nunca ceros que parezcan "todo bien". (Con la señal abortada los clientes de
// lib/cache.ts LANZAN —`signal` como función en el SDK 1.38.0—; el `"Aborted"`
// sintético sólo existe con una señal estática, que no se usa; validar la
// forma es defensa en profundidad.) Ningún uuid, id de evento, familia,
// ruta ni evento crudo sale por acá: `tmdb:eventos` sólo se lee con
// credenciales de Redis. Una pausa espuria (pausas > 0 con 429 = 0 en la
// ventana) es imposible por construcción — el mismo script suma ambos —, así
// que verla acá delata un bug (condición de rollback, §40.6).
import { CAMPOS_SALUD } from "./pausa-lua.ts";

export interface SaludPausa {
  pausaVigenteMs: number;
  ultimos60min: { "429": number; pausas: number; yaMayor: number; yaAplicada: number; pausaNoLeida: number; pausadosUB: number; pausados503: number };
}

export function saludDeLaPausa(r: unknown): SaludPausa | null {
  if (!Array.isArray(r) || r.length !== CAMPOS_SALUD.length + 1 || !r.every((x) => Number.isInteger(x))) return null;
  const [pttl, c429, pausas, yaMayor, yaAplicada, pausaNoLeida, pausadosUB, pausados503] = r as number[];
  return {
    pausaVigenteMs: Math.max(0, pttl),
    ultimos60min: { "429": c429, pausas, yaMayor, yaAplicada, pausaNoLeida, pausadosUB, pausados503 },
  };
}
