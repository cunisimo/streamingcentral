// Los cuatro "producir" que envuelven la reparación de idioma.
//
// Cada uno hace lo mismo: pedir la base, repararla, y devolver
// `{ valor, fallo }` para que `resolverConCache` decida si se guarda.
//
// POR QUÉ VIVEN ACÁ. Producción los usa desde `lib/enrich.ts`, `lib/top.ts`,
// `lib/reco.ts` y `lib/pools.ts`; los tests los usan con TMDB falso. Así el
// test recorre la MISMA implementación que corre en producción, en vez de
// reimplementarla — que es lo que dejaba pasar los bugs.
//
// Módulo puro: solo depende de `lib/idioma.ts`, que tampoco importa runtime.
import {
  clavePorId, repararLote, repararUno,
  type ClaveDeLote, type Localizable,
} from "./idioma.ts";
import type { Producido } from "./reparar-y-cachear.ts";

/** Un título suelto: la ficha y `card:`. */
export async function adaptadorCard<T extends Localizable>(deps: {
  pedirBase: () => Promise<T>;
  pedirRespaldo: () => Promise<Localizable | null | undefined>;
  activo?: boolean;
}): Promise<Producido<T>> {
  const base = await deps.pedirBase();
  const r = await repararUno(base, deps.pedirRespaldo, "card", deps.activo);
  return { valor: r.item, fallo: r.fallo };
}

/** Una lista de un solo tipo: el productor de `top:pop:` (`listByCategory`),
 *  las categorías y los pools por plataforma. */
export async function adaptadorLista<T extends Localizable>(deps: {
  pedirBase: () => Promise<T[]>;
  pedirRespaldo: () => Promise<Localizable[] | null | undefined>;
  clave?: ClaveDeLote<T>;
  activo?: boolean;
}): Promise<Producido<T[]>> {
  const base = await deps.pedirBase();
  const r = await repararLote(base, deps.pedirRespaldo, "lista", {
    clave: deps.clave ?? (clavePorId as ClaveDeLote<T>),
    activo: deps.activo,
  });
  return { valor: r.items, fallo: r.fallo };
}

/** La consulta combinada: los metadatos de paginación se arman DESPUÉS de
 *  reparar, así que un fallo del respaldo no puede perderlos. */
export async function adaptadorPaginaCombinada<T extends Localizable>(deps: {
  pedirBase: () => Promise<{ results: T[]; total_pages: number; total_results: number }>;
  pedirRespaldo: () => Promise<Localizable[] | null | undefined>;
  clave?: ClaveDeLote<T>;
  activo?: boolean;
}): Promise<Producido<{ candidatos: T[]; totalPaginas: number; total: number }>> {
  const r = await deps.pedirBase();
  const rep = await repararLote(r.results, deps.pedirRespaldo, "combinada", {
    clave: deps.clave ?? (clavePorId as ClaveDeLote<T>),
    activo: deps.activo,
  });
  return {
    valor: { candidatos: rep.items, totalPaginas: r.total_pages, total: r.total_results },
    fallo: rep.fallo,
  };
}

/**
 * El riel compuesto de "Elegidas para vos".
 *
 * LA FORMA ES LA QUE IMPONE LA ARQUITECTURA REAL. La primera versión de este
 * adaptador le pasaba un `reparar` a `armar`, y eso NO encaja: las reparaciones
 * de `reco:v2` pasan adentro de `recomendadosDe`, `cruzadosDe` y `perfilDe`, no
 * en el nivel del riel. Envolverlas habría sido una segunda reparación encima
 * de la que ya existe.
 *
 * Lo que sí es del nivel del riel: correr `armar` dentro de un scope de
 * métricas y decidir el `fallo` AL TERMINAR. Así quedan cubiertos los retornos
 * tempranos —`sin-candidatos`, `filtrado`— sin tener que marcar nada antes de
 * cada `return`.
 *
 * `conMetricas` se inyecta para que el test use exactamente el mismo
 * `withMetricasIdioma` que producción.
 */
export async function adaptadorRiel<V>(deps: {
  armar: () => Promise<V>;
  conMetricas: <T>(fn: () => Promise<T>) => Promise<{ res: T; metricas: { fallos: number } }>;
}): Promise<Producido<V>> {
  const { res, metricas } = await deps.conMetricas(deps.armar);
  return { valor: res, fallo: metricas.fallos > 0 };
}
