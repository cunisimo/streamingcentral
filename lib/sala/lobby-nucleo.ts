// Lo que el organizador necesita saber SIN salir del botón (decisión del dueño,
// 23/09). Client-safe y puro: sin React, sin fetch, sin reloj.
//
// 🔴 EL PROBLEMA QUE RESUELVE NO ERA QUE FALTARA LA INFORMACIÓN. La lista
// "Quiénes están (2 de 6)" ya existía y ya se actualizaba sola por Realtime: lo
// que fallaba es que está arriba de todo y "Empezar" está abajo del todo, con
// las plataformas, el enlace y la configuración en el medio. En un teléfono,
// mirando el botón la lista queda fuera de pantalla, así que el organizador no
// se entera de que ya puede empezar. La cuenta se repite junto al botón.
//
// Y el botón deshabilitado NO decía por qué: tocarlo no hacía nada, y de ahí
// salió la lectura de que "Empezar" servía para obtener el enlace.

/** El máximo de la sala (009_salas.sql). Se muestra para que "2 de 6" se lea. */
export const CUPO = 6;
/** Debajo de esto la base rechaza la preparación (`sala_sin_quorum`). */
export const MINIMO = 2;

/** El texto del botón: dice el estado, no sólo la acción. */
export function rotuloEmpezar(n: number): string {
  return n < MINIMO ? "Falta que se sume alguien" : `Empezar con ${n}`;
}

/** La línea de arriba del botón: cuántos hay y qué se puede hacer. */
export function lineaGente(n: number): string {
  if (n < MINIMO) return `Por ahora estás sólo vos (1 de ${CUPO}). Pasá el enlace y esperá acá: la lista se actualiza sola.`;
  if (n >= CUPO) return `Están ${n} de ${CUPO}: la sala está llena.`;
  return `Están ${n} de ${CUPO}. Pueden seguir sumándose hasta que empieces.`;
}

/**
 * Quiénes llegaron entre dos lecturas del estado. Se compara por nombre y como
 * MULTICONJUNTO (dos "Ana" son dos personas): la RPC no expone un id de
 * participante —el id sale del token y no viaja— así que no hay nada más
 * estable que comparar. Lo peor que puede pasar con nombres repetidos es que el
 * aviso nombre a la persona equivocada; no afecta ni el estado ni la votación.
 */
export function reciénLlegados(antes: readonly string[], ahora: readonly string[]): string[] {
  const restantes = [...antes];
  const nuevos: string[] = [];
  for (const n of ahora) {
    const i = restantes.indexOf(n);
    if (i >= 0) restantes.splice(i, 1);
    else nuevos.push(n);
  }
  return nuevos;
}

/** El aviso de llegada. `null` cuando no llegó nadie: la vista no muestra nada. */
export function avisoDeLlegada(nuevos: readonly string[]): string | null {
  if (nuevos.length === 0) return null;
  if (nuevos.length === 1) return `Se sumó ${nuevos[0]}.`;
  if (nuevos.length === 2) return `Se sumaron ${nuevos[0]} y ${nuevos[1]}.`;
  return `Se sumaron ${nuevos.length} personas.`;
}
