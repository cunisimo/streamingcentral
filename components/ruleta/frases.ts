// `atencion` es dato (alta/media/fondo) y sirve para filtrar del lado de la
// base. NUNCA se muestra crudo: acá se traduce a una frase escrita a mano.
// El banco vive en el código y no en la base para que la voz sea una sola.
const BANCO: Record<string, string[]> = {
  alta:  ["Pide cabeza", "Si te das vuelta un segundo, ya no entendés nada"],
  media: ["Se sigue sola", "Ni liviana ni pesada"],
  fondo: ["Se mira fácil", "Aguanta que cocines"],
};

// La variante se elige por tmdb_id y no al azar: así el mismo título muestra
// siempre la misma frase, y no cambia sola al re-renderizar la tarjeta.
export function fraseAtencion(atencion: string | null, tmdbId: number): string | null {
  const frases = atencion ? BANCO[atencion] : undefined;
  if (!frases?.length) return null;
  return frases[tmdbId % frases.length];
}
