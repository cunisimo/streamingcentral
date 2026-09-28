// Qué contrato de filmografía ejecuta cada petición a `/api/person/[id]`
// (issue #25). Módulo PURO: la ruta sólo le enchufa las tres funciones de
// lib/enrich.ts, y los tests las reemplazan por dobles que CUENTAN.
//
// 🔴 El contrato se VERSIONA explícitamente, porque hay dos clientes vivos:
//
//   sin `filmografia`      → v1: `{ person, titles, hidden }`. Lo mandan los
//                            bundles Android instalados antes del #25, que no
//                            saben nada de secciones ni de "Ver más".
//   `filmografia=v2`       → v2: filmografía completa como datos básicos +
//                            disponibilidad del bloque inicial. Lo manda la web
//                            y todo AAB nuevo.
//   `filmografia=v2&items=`→ "Ver más" de v2: sólo disponibilidad (máx. 24).
//
// Cada petición ejecuta UNA sola de las tres: nunca se calculan v1 y v2 juntas
// ni se piden dos veces la persona, sus créditos o la disponibilidad.
import { MAX_POR_PEDIDO, parsearClave } from "./filmografia.ts";
import { VERSION_FILMOGRAFIA } from "./filmografia-bloques.ts";
import type { DisponibilidadObras, FilmografiaLegado, FilmografiaPersona, PlatformCode } from "./types.ts";

export { VERSION_FILMOGRAFIA };

export interface DepsFilmografia {
  v1: (id: number, providers: PlatformCode[]) => Promise<FilmografiaLegado>;
  v2: (id: number) => Promise<FilmografiaPersona>;
  items: (claves: string[]) => Promise<DisponibilidadObras>;
}

export interface Respuesta { status: number; body: unknown }

const malo = (error: string): Respuesta => ({ status: 400, body: { error } });

export async function responderFilmografia(idCrudo: string, params: URLSearchParams, deps: DepsFilmografia): Promise<Respuesta> {
  const version = params.get("filmografia");
  if (version !== null && version !== VERSION_FILMOGRAFIA) return malo(`filmografia: sólo se admite "${VERSION_FILMOGRAFIA}"`);
  const items = params.get("items");

  try {
    if (items !== null) {
      // "Ver más" pertenece a v2: un cliente v1 nunca lo pide, y aceptarlo sin
      // la versión sería un camino sin dueño.
      if (version !== VERSION_FILMOGRAFIA) return malo(`items: sólo con filmografia=${VERSION_FILMOGRAFIA}`);
      const claves = [...new Set(items.split(",").map((s) => s.trim()).filter(Boolean))];
      if (!claves.length || claves.length > MAX_POR_PEDIDO || claves.some((k) => !parsearClave(k))) {
        return malo(`items: entre 1 y ${MAX_POR_PEDIDO} claves tipo:id`);
      }
      return { status: 200, body: await deps.items(claves) };
    }

    const id = Number(idCrudo);
    if (!Number.isInteger(id) || id <= 0) return malo("id de persona inválido");
    if (version === VERSION_FILMOGRAFIA) return { status: 200, body: await deps.v2(id) };
    const providers = (params.get("providers")?.split(",").filter(Boolean) ?? []) as PlatformCode[];
    return { status: 200, body: await deps.v1(id, providers) };
  } catch (e) {
    // Como siempre en esta ruta: 500 con el error (conCors lo envuelve con CORS).
    return { status: 500, body: { error: String(e) } };
  }
}
