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
  claveMixta, clavePorId, repararLote, repararUno,
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
  const r = await repararUno(base, deps.pedirRespaldo, "card", deps.activo ?? true);
  return { valor: r.item, fallo: r.fallo };
}

/** Una lista de un solo tipo: `top:pop:`, categorías, pools. */
export async function adaptadorTopPop<T extends Localizable>(deps: {
  pedirBase: () => Promise<T[]>;
  pedirRespaldo: () => Promise<Localizable[] | null | undefined>;
  clave?: ClaveDeLote<T>;
  activo?: boolean;
}): Promise<Producido<T[]>> {
  const base = await deps.pedirBase();
  const r = await repararLote(base, deps.pedirRespaldo, "lista", {
    clave: deps.clave ?? (clavePorId as ClaveDeLote<T>),
    activo: deps.activo ?? true,
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
    activo: deps.activo ?? true,
  });
  return {
    valor: { candidatos: rep.items, totalPaginas: r.total_pages, total: r.total_results },
    fallo: rep.fallo,
  };
}

/**
 * El riel compuesto de "Elegidas para vos".
 *
 * `armar` recibe un `reparar` y puede llamarlo cuantas veces quiera. El `fallo`
 * se decide DESPUÉS de que `armar` terminó, así que los retornos tempranos
 * —`sin-candidatos`, `filtrado`— quedan cubiertos sin tener que acordarse de
 * marcar nada antes de cada `return`.
 */
export async function adaptadorRiel<V>(deps: {
  armar: (reparar: <T extends Localizable>(base: T[]) => Promise<T[]>) => Promise<V>;
  pedirRespaldo: () => Promise<Localizable[] | null | undefined>;
  activo?: boolean;
}): Promise<Producido<V>> {
  let fallo = false;
  const reparar = async <T extends Localizable>(base: T[]): Promise<T[]> => {
    const r = await repararLote(base, deps.pedirRespaldo, "riel", {
      clave: claveMixta as ClaveDeLote<T>,
      claveRespaldo: claveMixta,
      activo: deps.activo ?? true,
    });
    if (r.fallo) fallo = true;
    return r.items;
  };
  const valor = await deps.armar(reparar);
  return { valor, fallo };
}
