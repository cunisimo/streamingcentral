// El error que lanza `lib/tmdb.ts`, con su CAUSA adentro. Etapa 3.a (#19).
// Sin `server-only`: lo importan módulos puros y tests.
//
// Antes, `tmdb()` tiraba `new Error("TMDB 429 en /x")`: para quien lo atrapaba
// era indistinguible de un `TypeError` propio, y por eso los once sitios que
// tragan errores (informe de la Etapa 3, §2.3) no podían decir "esto fue TMDB".
// Con una clase propia, `esErrorTmdb(e)` decide sin mirar el mensaje.
//
// Las clases coinciden con las de las métricas (lib/metricas.ts) más las dos
// que no vienen de una respuesta HTTP: `timeout` (el `AbortSignal.timeout` de
// 8 s propio) y `cuerpo` (200 con JSON que no parsea). `cancelada` es la señal
// de la solicitud (Etapa 2) y `rechazada` queda declarada para la Etapa 3.b
// (circuito): en 3.a nadie la produce.
export type ClaseTmdb =
  | "http429" | "http5xx" | "http4xx"
  | "red" | "timeout" | "cuerpo"
  | "cancelada" | "rechazada";

export class ErrorTmdb extends Error {
  readonly estado: number | null;
  readonly clase: ClaseTmdb;
  readonly path: string;
  /** Lo que dijo `Retry-After`, ya parseado, o `null`. Sólo en 429/503. */
  readonly retryAfterMs: number | null;

  constructor(o: { estado: number | null; clase: ClaseTmdb; path: string; retryAfterMs?: number | null; causa?: unknown }) {
    super(o.estado !== null ? `TMDB ${o.estado} en ${o.path}` : `TMDB ${o.clase} en ${o.path}`, o.causa !== undefined ? { cause: o.causa } : undefined);
    this.name = "ErrorTmdb";
    this.estado = o.estado;
    this.clase = o.clase;
    this.path = o.path;
    this.retryAfterMs = o.retryAfterMs ?? null;
  }

  static clasePorEstado(estado: number): "http429" | "http5xx" | "http4xx" {
    if (estado === 429) return "http429";
    if (estado >= 500) return "http5xx";
    return "http4xx";
  }
}

export function esErrorTmdb(e: unknown): e is ErrorTmdb {
  return e instanceof ErrorTmdb;
}

/**
 * Qué fue un error que salió del `fetch` o del `res.json()`, por causa.
 *
 * `senalCancelada` es lo que distingue "la solicitud se canceló" (la señal de
 * la Etapa 2 abortó) de "TMDB tardó más de 8 s" (el timeout propio): los dos
 * llegan como un `AbortError`/`TimeoutError` y sólo la señal los separa.
 * `desconocido` es un bug propio: no se disfraza de TMDB.
 */
export function clasificarError(
  e: unknown, o: { senalCancelada: boolean },
): "timeout" | "cancelada" | "red" | "cuerpo" | "desconocido" {
  const nombre = (e as { name?: string } | null)?.name;
  if (nombre === "TimeoutError" || nombre === "AbortError") {
    return o.senalCancelada ? "cancelada" : "timeout";
  }
  if (e instanceof SyntaxError) return "cuerpo";
  if (e instanceof TypeError) return "red";
  return "desconocido";
}
