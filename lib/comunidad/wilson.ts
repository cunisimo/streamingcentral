// Wilson (T10, E5b): el límite inferior del intervalo de confianza al 95 %
// (z = 1,96) para la proporción de "Me sirvió" sobre los votos vigentes. Es la
// MISMA fórmula que `comunidad.wilson` en la base (018), que es la que ordena;
// esta copia sirve para las pruebas y para ordenar en el cliente si alguna vez
// hiciera falta. Sin votos, 0. Referencia del método (no una validación sobre
// una población representativa: los votos son voluntarios):
// https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm
export const Z_WILSON = 1.96;

export function wilson(positivos: number, total: number, z = Z_WILSON): number {
  // Con 0 positivos, exactamente 0 (la fórmula en coma flotante puede dejar ~1e-17).
  if (!(total > 0) || !(positivos > 0)) return 0;
  const p = positivos / total;
  const z2 = z * z;
  return (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total);
}

/**
 * Desempate documentado (diseño §3.3): Wilson desc, primera publicación desc,
 * id desc. `publicada` es un número (por ejemplo, microsegundos desde la época:
 * la base guarda microsegundos y `Date.parse` los perdería).
 */
export function compararUtiles(
  a: { positivos: number; total: number; publicada: number; id: number },
  b: { positivos: number; total: number; publicada: number; id: number },
): number {
  const wa = wilson(a.positivos, a.total), wb = wilson(b.positivos, b.total);
  if (wa !== wb) return wb - wa;
  if (a.publicada !== b.publicada) return b.publicada - a.publicada;
  return b.id - a.id;
}
