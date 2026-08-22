// Cómo se ordenan los resultados del buscador.
//
// Módulo aparte y sin `server-only` para poder probarlo: `lib/enrich.ts` no se
// puede importar desde `node --test`. Acá vive la parte con reglas y sin red.
export const sinAcentos = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Cuánto "empieza con" hay entre el nombre y lo tecleado. Solo separa lo que
// calza de lo que no; el orden dentro de cada grupo lo pone la popularidad.
//
// `exacto` (el nivel 3) se usa en TÍTULOS y no en personas, y la asimetría es a
// propósito. Un título se busca por su nombre completo —escribir "matrix" es
// pedir Matrix— y sin ese nivel una película poco conocida quedaría debajo de
// cualquier popular que comparta el prefijo. A una persona, en cambio, se la
// busca tecleando de a poco ("spielb"), y premiar el nombre completo trae justo
// el ruido que este arreglo vino a sacar: con "coco" salían cuatro desconocidos
// llamados Coco antes que cualquier actor, y con "ste" una persona llamada
// literalmente "Ste", con popularidad 0, arriba de Spielberg.
export function relevancia(nombre: string, q: string, exacto: boolean): number {
  const n = sinAcentos(nombre);
  const t = sinAcentos(q);
  if (!t) return 0;
  if (exacto && n === t) return 3;
  if (n.startsWith(t)) return 2;
  if (n.split(/[\s:.,\-–—'"()¡!¿?]+/).some((w) => w.startsWith(t))) return 2;
  return n.includes(t) ? 1 : 0;
}

export interface OpcionesOrden<T> {
  nombreDe: (t: T) => string;
  popDe: (t: T) => number;
  // Nivel 3 para el nombre completo. Solo en títulos (ver arriba).
  exacto?: boolean;
  // Qué hacer con lo que TMDB devolvió pero cuyo título visible NO contiene la
  // consulta.
  //
  // ESTO ARREGLA LOS TÍTULOS LATINOAMERICANOS. TMDB busca contra TODOS los
  // títulos alternativos de una película, pero devuelve el del idioma pedido. Si
  // buscás "La jungla de cristal" en es-MX, encuentra la 562 y te la devuelve
  // como "Duro de matar": el nombre visible no contiene lo que escribiste, y
  // descartarla por eso es tirar un acierto de TMDB.
  //
  // Van al FINAL y en el orden en que vinieron, sin reordenar por popularidad:
  // no hay con qué medir su relevancia de nuestro lado, así que el único
  // criterio honesto es el ranking propio de TMDB, que fue quien las encontró.
  conservarAlias?: boolean;
}

export function ordenarPorRelevancia<T>(items: T[], q: string, o: OpcionesOrden<T>): T[] {
  const conNivel = items.map((x) => ({
    x, r: relevancia(o.nombreDe(x), q, !!o.exacto), p: o.popDe(x),
  }));
  const directos = conNivel
    .filter((e) => e.r > 0)
    .sort((a, b) => (b.r - a.r) || (b.p - a.p))
    .map((e) => e.x);
  if (!o.conservarAlias) return directos;
  // `filter` conserva el orden de llegada: es el de TMDB, y es a propósito.
  const alias = conNivel.filter((e) => e.r === 0).map((e) => e.x);
  return [...directos, ...alias];
}
