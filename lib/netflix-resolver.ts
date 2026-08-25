// Resolver un título del TSV de Netflix a un id de TMDB.
//
// Vive acá, separado de `lib/netflix-top10.ts`, por la misma razón que
// `reconciliar.ts` en el sync: es la regla que decide con qué ficha se muestra
// un título bajo el sello "dato oficial", y una regla así tiene que poder
// probarse sin red. `netflix-top10.ts` es `server-only` y arrastra el cliente de
// TMDB y el de Supabase, así que un test de Node no puede importarlo.
//
// La red entra por PUERTOS que inyecta el llamador. Este archivo no conoce
// TMDB: sabe pedir "buscá esto" y "¿está en Netflix AR?".

/** Un resultado de búsqueda, ya aplanado (TMDB usa `title` en cine y `name` en TV). */
export interface Candidato { id: number; title: string }

export interface Puertos {
  /** Búsqueda por texto. LANZA si el transporte falla — no devuelve lista vacía. */
  buscar: (consulta: string) => Promise<Candidato[]>;
  /** NUNCA lanza: ante un error devuelve false, que es lo que impide aceptar a ciegas. */
  enNetflixAR: (id: number) => Promise<boolean>;
}

export interface Resolucion { tmdbId: number | null; needsReview: boolean }

// Minúsculas, sin acentos, sin puntuación, espacios colapsados. Se usa para
// comparar el título del TSV contra el de TMDB: "Fear" != "State of Fear".
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La parte anterior a los dos puntos, o `null` si no hay una reducción que
 * valga la pena.
 *
 * EXIGE dos puntos SEGUIDOS DE ESPACIO, y eso no es cosmética. Medido sobre la
 * historia entera del TSV argentino: de 1969 títulos únicos, 209 tienen ':' y
 * **uno solo** no lleva espacio después — "3:10 to Yuma", donde los dos puntos
 * son una hora y no un separador de subtítulo. Reducir ese a "3" es la peor
 * consulta imaginable: devuelve cualquier cosa, y entre cualquier cosa siempre
 * va a haber algo que esté en Netflix AR.
 *
 * Se corta en los PRIMEROS dos puntos. En esos mismos 209 títulos no hay
 * ninguno con más de uno, así que "primeros" y "últimos" son hoy la misma
 * decisión; se elige la primera por ser la lectura literal de "la parte
 * anterior a los dos puntos".
 */
export function consultaReducida(rawTitle: string): string | null {
  const i = rawTitle.search(/:\s/);
  if (i <= 0) return null;
  const prefijo = rawTitle.slice(0, i).trim();
  const resto = rawTitle.slice(i + 1).trim();
  // Sin prefijo no hay qué buscar; sin resto no se tiró nada, así que la
  // "reducida" sería la consulta completa otra vez.
  if (!prefijo || !resto) return null;
  return prefijo;
}

/**
 * Las reglas, en orden. Las tres primeras son las de siempre y no cambiaron:
 *
 *  1. título exacto -> se acepta
 *  2. título distinto pero está en Netflix AR -> se acepta con needs_review
 *  3. sin match -> tmdb_id null + needs_review
 *
 * Lo que se agrega es un CUARTO paso, que corre sólo si los anteriores no
 * aceptaron nada y el título tiene un subtítulo: repetir la búsqueda con la
 * parte anterior a los dos puntos. Nace de una fila real —
 * "Operation Safed Sagar: The Highest Air Force Mission", semana 2026-08-16 —
 * donde TMDB devuelve CERO resultados para el título completo y exactamente uno
 * para "Operation Safed Sagar": `tv/284753`, que además tiene Netflix en AR. El
 * subtítulo de TMDB es otro ("The Untold Story of the Kargil War"), así que sin
 * la segunda consulta esa fila se quedaba en `null` para siempre.
 *
 * EL PASO 4 ES MÁS DESCONFIADO QUE LOS OTROS TRES, y tiene que serlo: la
 * reducida tira información a propósito, así que su evidencia vale menos.
 *
 *  - **Exige UN solo resultado.** Es el criterio de "coincidencia dudosa" y
 *    reemplaza a cualquier cuenta de palabras: si TMDB devuelve varios, el
 *    nombre reducido no identifica una obra y no hay forma honesta de elegir.
 *    "Monster: The Ed Gein Story" reduce a "Monster", y entre varios "Monster"
 *    alguno va a estar en Netflix AR — quedarse con el primero sería inventar.
 *  - **Primero el proveedor, después el título**, al revés que en la consulta
 *    completa. Allá el título coincidente es evidencia fuerte porque se compara
 *    completo; acá se compara contra un prefijo, así que la evidencia dura pasa
 *    a ser que Netflix efectivamente lo tenga en Argentina.
 *  - **Todo lo que salga de acá va con `needsReview`**, aunque el título del
 *    prefijo coincida exacto: lo emparejamos con información incompleta.
 *
 * Una CAÍDA de la búsqueda completa aborta sin intentar la reducida. Un error
 * de transporte no es "no encontré", es "no sé", y seguir con menos información
 * justo cuando falta información es como se fabrican las asociaciones falsas.
 */
export async function resolverTitulo(rawTitle: string, p: Puertos): Promise<Resolucion> {
  const sinMatch: Resolucion = { tmdbId: null, needsReview: true };

  // Un solo chequeo de proveedores por id en toda la resolución: un candidato
  // puede aparecer en las dos consultas y la llamada es cara.
  const vistos = new Map<number, boolean>();
  const enNetflix = async (id: number) => {
    const y = vistos.get(id);
    if (y !== undefined) return y;
    const r = await p.enNetflixAR(id);
    vistos.set(id, r);
    return r;
  };

  let completos: Candidato[];
  try {
    completos = await p.buscar(rawTitle);
  } catch {
    return sinMatch;
  }

  const objetivo = normalizeTitle(rawTitle);
  const exacto = completos.find((c) => normalizeTitle(c.title) === objetivo);
  if (exacto) return { tmdbId: exacto.id, needsReview: false };

  for (const c of completos) {
    if (await enNetflix(c.id)) return { tmdbId: c.id, needsReview: true };
  }

  // --- Paso 4: la segunda consulta, acotada -------------------------------
  const reducida = consultaReducida(rawTitle);
  if (!reducida) return sinMatch;

  let cortos: Candidato[];
  try {
    cortos = await p.buscar(reducida);
  } catch {
    return sinMatch;
  }
  if (cortos.length !== 1) return sinMatch;

  const c = cortos[0];
  if (await enNetflix(c.id)) return { tmdbId: c.id, needsReview: true };
  if (normalizeTitle(c.title) === normalizeTitle(reducida)) {
    return { tmdbId: c.id, needsReview: true };
  }
  return sinMatch;
}
