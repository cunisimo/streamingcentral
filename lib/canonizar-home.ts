// Canonización de las entradas del Home (Etapa 1 de capacidad, issue #18).
//
// ============================================================================
// POR QUÉ
// ============================================================================
// `/api/home` tomaba `providers` y `t` crudos y la clave sólo ordenaba. Medido
// con `claveHome` real: 19 entradas, 17 distintas, 14 claves. Cada clave de más
// es una composición del Home de más (el trabajo más caro del sistema) y una
// entrada de caché de 6 h con el mismo contenido. Y no eran sólo entradas raras:
// el toggle por defecto ESCRITO (`t=accion:movie`, que es lo que el cliente
// manda siempre) y el implícito (sin `t`) eran dos claves del mismo Home — la
// Etapa 0 lo vio con el instrumento nuevo (escenario B4d del banco).
//
// La lista canonizada se usa para el CONTENIDO y para la CLAVE, en
// `homePayload`. Normalizar sólo la clave no sirve: dos claves iguales con dos
// contenidos distintos es peor que dos claves distintas.
//
// ============================================================================
// EL ORDEN, Y EL ERROR QUE NO HAY QUE REPETIR
// ============================================================================
// minúsculas → filtrar contra el catálogo → deduplicar → ordenar → tope.
//
// 🔴 Bajar a minúsculas ANTES de filtrar es lo que conserva `N,D,M`: son
// Netflix, Disney+ y Max mal escritas, no basura. La primera versión del plan
// pedía que convergieran a `n` —le borraba dos plataformas al usuario— y la
// revisión independiente lo detectó. Canonizar no es descartar.
//
// Módulo PURO (sin `server-only`, sin imports de runtime): para poder ejecutar
// cada caso del criterio de cierre en `node --test`. `lib/providers-ar.ts` y
// `hooks/home-types-nucleo.ts` son client-safe y ya los importa `lib/home.ts`.
import { ALL_CODES } from "./providers-ar.ts";
import type { MediaType, PlatformCode } from "./types";
import { TOGGLE_KEYS, tipoDe } from "../hooks/home-types-nucleo.ts";

/**
 * El tope de plataformas por solicitud. No es un número inventado: es el tamaño
 * del catálogo, la única cantidad que puede quedar después de filtrar contra él
 * y deduplicar. Se aplica de todos modos para que la longitud de la clave esté
 * acotada por construcción y no por confianza en los pasos anteriores.
 */
export const MAX_PLATAFORMAS = ALL_CODES.length;

const CATALOGO = new Set<string>(ALL_CODES);

/**
 * `providers` canónico. Acepta la cadena cruda de la query (`"N,,d,zzz"`) o
 * una lista. Devuelve códigos del catálogo, sin repetir, ordenados, acotados.
 * Idempotente: canonizar lo canonizado no cambia nada.
 */
export function canonizarProviders(raw: string | readonly string[] | null | undefined): PlatformCode[] {
  const lista = raw == null ? [] : typeof raw === "string" ? raw.split(",") : [...raw];
  const minusculas = lista.map((c) => c.trim().toLowerCase());          // 1. minúsculas
  const validos = minusculas.filter((c) => CATALOGO.has(c));            // 2. filtrar contra el catálogo
  const unicos = [...new Set(validos)];                                  // 3. deduplicar
  unicos.sort();                                                         // 4. ordenar
  return unicos.slice(0, MAX_PLATAFORMAS) as PlatformCode[];             // 5. tope
}

const esTipo = (v: unknown): v is MediaType => v === "movie" || v === "tv";

/**
 * Parsea `t` a un objeto. Sólo parsea: la canonización es `canonizarTipos`.
 *
 * Acepta un valor (`"accion:tv,terror:movie"`) o TODOS los valores de un `t`
 * repetido en la query (`searchParams.getAll("t")`), en orden. Duplicados: la
 * ÚLTIMA ocurrencia gana, tanto dentro de un valor separado por comas como
 * entre parámetros repetidos: `?t=accion:movie&t=accion:tv` → `accion:tv`.
 *
 * ⚠️ `URLSearchParams.get` devuelve la PRIMERA aparición de un parámetro
 * repetido, no la última: por eso la ruta tiene que pasar `getAll`, y por eso
 * la primera versión de este módulo, que comparaba esta política con `get`,
 * estaba mal (auditoría de Codex sobre `325e085`).
 */
export function tiposDesdeParam(raw: string | readonly string[] | null | undefined): Record<string, string> {
  const valores = raw == null ? [] : typeof raw === "string" ? [raw] : raw;
  const out: Record<string, string> = {};
  for (const valor of valores) {
    for (const par of valor.split(",")) {
      const i = par.indexOf(":");
      if (i <= 0) continue;
      out[par.slice(0, i).trim()] = par.slice(i + 1).trim();
    }
  }
  return out;
}

/**
 * `t` canónico, en su forma MÍNIMA: sólo rieles de `TOGGLE_KEYS`, sólo tipos
 * válidos, y sólo los que difieren de su default. Así `t` ausente, `t=accion:movie`
 * y las siete claves en default que el cliente manda siempre son la misma
 * clave y el mismo Home. Como máximo hay una entrada por clave conocida: no hay
 * crecimiento posible.
 *
 * Los rieles de filtro (`mas-votados`, `hacete-cargo`) no están en
 * `TOGGLE_KEYS` y no entran: el cliente los resuelve solo y nunca los manda.
 */
export function canonizarTipos(raw: Record<string, string> | null | undefined): Record<string, MediaType> {
  const out: Record<string, MediaType> = {};
  for (const clave of TOGGLE_KEYS) {
    const v = raw?.[clave];
    if (esTipo(v) && v !== tipoDe(clave, {})) out[clave] = v;
  }
  return out;
}

/** La parte de tipos de la clave del Home: rieles ordenados por nombre. */
export function claveDeTipos(tipos: Record<string, string> | null | undefined): string {
  const c = canonizarTipos(tipos);
  return Object.keys(c).sort().map((k) => `${k}:${c[k]}`).join(",");
}
