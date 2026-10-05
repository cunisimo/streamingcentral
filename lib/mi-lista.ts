// "Mi lista" completa (/cuenta/lista): selector Películas | Series (pedido del
// dueño, 5/10). PURO: la vista le inyecta la carga, así se prueba sin red.
//
// - Al entrar se carga UNA vez (refs de Supabase + /api/cards, que devuelve en
//   el orden de `itemRefs("list")`: lo agregado más recientemente primero).
// - Elegir Películas o Series es filtrar lo ya cargado: no consulta nada.
// - Al volver de una ficha se restaura filtro, tarjetas y scroll del snapshot,
//   reconciliado contra `MyListContext` (la lista en memoria, la misma que
//   tocan la ficha y las tarjetas): lo que se sacó desaparece sin consultar; si
//   se agregó algo, se recarga una vez y se conservan filtro y scroll.
import type { UITitle } from "./types";

export type TipoLista = "movie" | "tv";

export const MENSAJE_VACIO_TIPO: Record<TipoLista, string> = {
  movie: "Todavía no guardaste películas.",
  tv: "Todavía no guardaste series.",
};

export interface SnapshotMiLista { tipo: TipoLista; items: UITitle[] }

export interface VistaMiLista {
  items: UITitle[];
  tipo: TipoLista;
  // Dónde dejar la página; `null` = arriba (entrada nueva).
  scrollY: number | null;
}

const claveDe = (t: { type: string; id: number }) => `${t.type}:${t.id}`;

// Conserva el orden de llegada: dentro de cada tipo sigue la recencia.
export const deTipo = (items: UITitle[], tipo: TipoLista) => items.filter((t) => t.type === tipo);

// Películas si hay; si no hay películas pero sí series, Series. Vacía: Películas.
export function tipoInicial(items: UITitle[]): TipoLista {
  if (items.some((t) => t.type === "movie")) return "movie";
  if (items.some((t) => t.type === "tv")) return "tv";
  return "movie";
}

export async function abrirMiLista(o: {
  // Sólo cuando se VOLVIÓ a la vista (atrás/adelante) y hay snapshot vigente.
  snapshot: { datos: SnapshotMiLista; scrollY: number } | null;
  // Lo que hay en Mi lista según el contexto; `null` si todavía no se sabe.
  enLista: ReadonlySet<string> | null;
  cargar: () => Promise<UITitle[]>;
}): Promise<VistaMiLista> {
  if (o.snapshot) {
    const { datos, scrollY } = o.snapshot;
    if (o.enLista) {
      const guardadas = new Set(datos.items.map(claveDe));
      const hayNuevas = [...o.enLista].some((k) => !guardadas.has(k));
      if (!hayNuevas) {
        const enLista = o.enLista;
        return { items: datos.items.filter((t) => enLista.has(claveDe(t))), tipo: datos.tipo, scrollY };
      }
    }
    return { items: await o.cargar(), tipo: datos.tipo, scrollY };
  }
  const items = await o.cargar();
  return { items, tipo: tipoInicial(items), scrollY: null };
}
