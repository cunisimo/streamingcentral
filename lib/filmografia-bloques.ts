// Carga PROGRESIVA de la filmografía de una persona (issue #25, 2ª corrección).
//
// Módulo PURO y apto para el cliente: sin `server-only`, sin `node:*` y sin
// TMDB. Lo importan la ruta (qué se enriquece al abrir), `PersonView` (qué se
// pide con "Ver más", en qué orden se muestra) y los tests.
//
// 🔴 EL CONTRATO DE COSTE. La filmografía entera viaja como DATOS BÁSICOS
// (título, póster, fecha, votos, tipo, roles), que salen de `combined_credits`
// sin ninguna llamada por título. La DISPONIBILIDAD —la parte cara: un
// `providersOf` por obra y, si TMDB no la ubica en AR, el detalle de la
// evidencia oficial— se resuelve SÓLO para lo que se ve:
//
//   apertura        → las primeras `BLOQUE_INICIAL` (12) obras visibles, entre
//                     las dos secciones
//   cada "Ver más"  → las `BLOQUE` (24) siguientes de ESA sección, menos las ya
//                     resueltas
//
// El commit 706fb7a enriquecía la carrera entera al abrir (352 llamadas a TMDB
// para Samuel L. Jackson) y se RECHAZÓ: no se vuelve a hacer.
import type { PlatformCode } from "./types.ts";

/**
 * Versión del contrato de `/api/person/[id]` que usan la web y todo AAB nuevo
 * (lib/filmografia-ruta.ts). Sin este parámetro la ruta responde el contrato v1
 * de los bundles Android anteriores. Vive acá porque este módulo es apto para
 * el cliente; filmografia-ruta.ts arrastra código de servidor.
 */
export const VERSION_FILMOGRAFIA = "v2";

export const BLOQUE = 24;
// 🔴 La apertura es MÁS CHICA que un "Ver más", y el número sale de una cuenta,
// no de una medición. El criterio del dueño es que la apertura no haga más
// peticiones reales a TMDB que el código anterior (2af1a37). Cada obra cuesta
// en frío hasta 2 (`watch/providers` + el detalle de la evidencia oficial
// cuando TMDB no la ubica en AR), más 2 de la persona y sus créditos. El caso
// más barato del "antes" es Villeneuve: 29, porque el bug le dejaba 16 obras.
// Con 24 se midieron 43 (docs/medidas/2026-09-27-filmografia.md). Con 12 el
// PEOR caso es 2 + 12 × 2 = 26 (27 con el respaldo de idioma), por debajo de
// 29 sin depender de cuántas obras caigan al respaldo.
export const BLOQUE_INICIAL = 12;
export type Seccion = "direccion" | "actuacion";

/** Identidad de una obra en toda la filmografía: tipo + id (TMDB reutiliza ids entre tipos). */
export const claveDe = (o: { type: string; id: number }) => `${o.type}:${o.id}`;

/**
 * Cuántas obras de cada sección se ven al abrir. El presupuesto es UNO para la
 * página (`BLOQUE_INICIAL`), no uno por sección: con dos secciones, la segunda
 * recibe hasta un tercio y la primera el resto; lo que una no usa lo toma la otra.
 */
export function bloqueInicial(orden: Seccion[], largos: Record<Seccion, number>, bloque = BLOQUE_INICIAL): Record<Seccion, number> {
  const out: Record<Seccion, number> = { direccion: 0, actuacion: 0 };
  const [primera, segunda] = orden;
  if (!primera) return out;
  if (!segunda) { out[primera] = Math.min(largos[primera], bloque); return out; }
  const reservaSegunda = Math.min(largos[segunda], Math.floor(bloque / 3));
  out[primera] = Math.min(largos[primera], bloque - reservaSegunda);
  out[segunda] = Math.min(largos[segunda], bloque - out[primera]);
  return out;
}

/** Las claves visibles de una sección (sus primeras `n`), en orden. */
export function visiblesDe(claves: string[], n: number): string[] {
  return claves.slice(0, n);
}

/** Todas las claves visibles, sin repetir una obra que esté en las dos secciones. */
export function clavesVisibles(secciones: Record<Seccion, string[]>, visibles: Record<Seccion, number>): string[] {
  const out = new Set<string>();
  for (const s of ["direccion", "actuacion"] as const) for (const k of visiblesDe(secciones[s], visibles[s])) out.add(k);
  return [...out];
}

/**
 * "Ver más" de una sección: hasta dónde se abre y QUÉ hay que consultar. Sólo
 * las claves del bloque siguiente que no estén resueltas ni en vuelo — nunca se
 * vuelve a enriquecer una obra (tampoco una que ya se resolvió desde la otra
 * sección). Si queda un bloque menor, sólo lo que resta.
 */
export function siguienteBloque(
  claves: string[], visibles: number, yaResueltas: (k: string) => boolean, bloque = BLOQUE,
): { hasta: number; pedir: string[] } {
  const hasta = Math.min(claves.length, visibles + bloque);
  const pedir = [...new Set(claves.slice(visibles, hasta))].filter((k) => !yaResueltas(k));
  return { hasta, pedir };
}

/**
 * El orden que se MUESTRA en una sección: el de la sección (fecha
 * descendente), con tus plataformas primero DENTRO de cada bloque cargado.
 *
 * Por bloque y no global, a propósito: un orden global exigiría conocer la
 * disponibilidad de la carrera entera, que es justo lo que no se consulta. Y
 * dentro del bloque las cards no saltan de lugar al abrir el siguiente. Una
 * obra sin disponibilidad resuelta (consulta fallida) va con las que no están
 * en tus plataformas, pero NO se la marca como ausente.
 */
export function ordenVisible(
  claves: string[], inicial: number, visibles: number,
  plataformas: (k: string) => PlatformCode[] | undefined, providers: PlatformCode[], bloque = BLOQUE,
): string[] {
  const vis = claves.slice(0, visibles);
  const cortes = [0, Math.min(inicial, vis.length)];
  while (cortes[cortes.length - 1] < vis.length) cortes.push(Math.min(vis.length, cortes[cortes.length - 1] + bloque));
  const out: string[] = [];
  for (let i = 0; i + 1 < cortes.length; i++) {
    const tramo = vis.slice(cortes[i], cortes[i + 1]);
    const si = tramo.filter((k) => (plataformas(k) ?? []).some((p) => providers.includes(p)));
    out.push(...si, ...tramo.filter((k) => !si.includes(k)));
  }
  return out;
}
