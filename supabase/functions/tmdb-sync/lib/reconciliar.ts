// Qué borrar de la base después de una corrida del sync.
//
// Vive en su propio módulo, sin una sola dependencia de plataforma —ni `Deno`,
// ni el cliente de Supabase, ni el de TMDB— por un motivo concreto: es la regla
// que decide qué FILAS DESAPARECEN, y una regla así tiene que poder probarse sin
// levantar nada. Adentro de `sync-upcoming.ts` no se podía: ese archivo importa
// `Deno.env` y el runtime de Node no lo conoce.
//
// El tipo se declara acá en vez de importarse de `lib/tmdb.ts` por lo mismo:
// importarlo, aunque fuera solo el tipo, ataría este módulo a un archivo que usa
// APIs de Deno.
type MediaType = "movie" | "tv";

/**
 * Se borra lo que SÍ se evaluó y perdió todos sus providers AR: ya no califica
 * para la agenda.
 *
 * LO QUE NO SE BORRA, y es la parte que importa:
 *
 *  - Lo que quedó fuera por paginación. Nunca se evaluó, así que no hay
 *    evidencia de que haya dejado de calificar.
 *  - Lo que la reparación de idioma DESCARTÓ. Un candidato descartado no entra a
 *    `evaluados`, así que no puede aparecer acá.
 *
 * Ese segundo punto es lo que hace que descartar sea seguro. Si un descarte
 * terminara borrando la fila anterior, "no escribir" sería PEOR que escribir
 * mal: se perdería el dato viejo, que estaba bien. Hay un test que lo fija.
 *
 * La clave es el PAR `tmdb_id:media_type`, nunca el id solo: TMDB reutiliza los
 * números entre tipos y la película 1399 y la serie 1399 existen las dos.
 */
export function aBorrar(
  evaluados: { tmdb_id: number; media_type: MediaType }[],
  conservados: { tmdb_id: number; media_type: MediaType }[],
  tipo: MediaType,
): number[] {
  const vivos = new Set(conservados.map((c) => `${c.tmdb_id}:${c.media_type}`));
  return evaluados
    .filter((c) => c.media_type === tipo && !vivos.has(`${c.tmdb_id}:${c.media_type}`))
    .map((c) => c.tmdb_id);
}
