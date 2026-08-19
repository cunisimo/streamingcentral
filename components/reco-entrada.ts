// Qué se le manda al recomendador: las SEÑALES y las EXCLUSIONES.
//
// Son dos cosas distintas y hasta ahora salían de la misma lista recortada, que
// es el bug que arregla este módulo.
//
//   SEÑALES = de qué títulos partir para recomendar. Se acotan a lo más
//   reciente a propósito: el riel tiene que moverse cuando la persona se mueve,
//   no quedar anclado a lo que votó hace ocho meses. Además solo entran seis
//   (MAX_ORIGENES), así que mandar más no cambiaría el resultado y agrandaría la
//   clave de cache del riel al pedo.
//
//   EXCLUSIONES = qué NO puede aparecer. Acá recortar es un bug: un título que
//   calificaste hace un año sigue calificado, y el riel recomienda lo que
//   TODAVÍA NO calificaste. Con los topes compartidos, el voto 41 y el marcado
//   201 se caían de las DOS listas y el título volvía a aparecer recomendado —
//   con el agravante de que le pasa justo a quien más usa la app.
//
// Cuesta cero llamadas extra: cada lista se pide entera UNA vez, en la misma
// query de siempre, y los recortes de las señales se hacen acá con `.slice()`.
import type { MediaType } from "@/lib/types";

export interface Voto { tmdb_id: number; tipo: MediaType; rating: number }
export interface Marcado { tmdb_id: number; tipo: MediaType; kind: string }

// Cuánto alimenta las SEÑALES. Ninguno de los dos acota las exclusiones.
//
// Son dos presupuestos separados porque las dos listas son separadas. El de
// marcados se mide sobre `list` Y `watched` juntos, igual que el `limit(200)`
// que hacía la query antes: se conserva el comportamiento exacto, lo único que
// cambió es dónde se aplica el corte.
export const VOTOS_PARA_SENALES = 40;
export const MARCADOS_PARA_SENALES = 200;

export interface Senal { tipo: MediaType; id: number; peso: number }

// Jerarquía: Petacular (3) > Ta buena (2) > Mi lista (1).
// `Malaso` NO es fuente — un título que no te gustó no origina nada.
// Un mismo título puede estar votado Y en Mi lista; de eso se encarga
// `recomendaciones`, que deduplica conservando la señal más fuerte.
// Los dos recortes se hacen ACÁ y no en la query: leer completo es lo que
// mantiene las exclusiones sanas, y mandar todo como señal no serviría de nada
// —solo entran seis (MAX_ORIGENES)— y encima agrandaría la clave de cache del
// riel al pedo.
export function armarSenales(
  votos: Voto[],
  marcados: Marcado[],
  tope = VOTOS_PARA_SENALES,
  topeMarcados = MARCADOS_PARA_SENALES,
): Senal[] {
  const recientes = votos.slice(0, tope);
  // El corte va ANTES del filtro por kind, no después: así el presupuesto sigue
  // siendo el de los 200 registros más nuevos entre `list` y `watched` juntos,
  // que es exactamente lo que devolvía el `limit(200)` de la query.
  const marcadosRecientes = marcados.slice(0, topeMarcados);
  return [
    ...recientes.filter((x) => x.rating === 3).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 3 })),
    ...recientes.filter((x) => x.rating === 2).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 2 })),
    ...marcadosRecientes.filter((x) => x.kind === "list").map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 1 })),
  ];
}

// Todo lo que el usuario ya tocó, SIN RECORTAR NADA: cualquier calificación
// (incluido Malaso), Mi lista y Ya la vi, más lo que ya se está mostrando en el
// Home para no repetir.
//
// Los descartes de "No es para mí" NO entran acá, y ese es justamente el punto:
// NO viajan al servidor. Si viajaran, entrarían en la clave de cache del riel y
// cada descarte costaría un rearmado completo. Se filtran en el cliente, sobre
// el payload ya cacheado (ver ./reco-descartes).
export function clavesExcluidas(votos: Voto[], marcados: Marcado[], enHome: string[]): string[] {
  return [
    ...votos.map((x) => `${x.tipo}:${x.tmdb_id}`),
    ...marcados.map((x) => `${x.tipo}:${x.tmdb_id}`),
    ...enHome,
  ];
}
