// "Mi lista" en memoria: la lógica de escritura de `MyListContext`, PURA para
// poder probarla con una escritura pendiente controlada.
//
// El cambio es optimista (la tarjeta y la ficha responden al toque) y se
// revierte si la escritura falla. `asentado()` resuelve cuando NO queda
// ninguna escritura en vuelo, con su confirmación o su rollback ya aplicados,
// y devuelve las claves que quedaron. Es lo que espera la vista de Mi lista al
// volver de una ficha: leer las claves optimistas antes de que Supabase
// responda hacía que un alta recargara antes de existir en la base, y que una
// baja fallida dejara el título oculto (issue de auditoría, 5/10).
//
// No hay demoras ni sondeos: se espera a las promesas de las escrituras.

export type Escribir = (clave: string, on: boolean) => Promise<{ error?: string }>;

export interface ListaEnMemoria {
  claves: () => ReadonlySet<string>;
  reemplazar: (claves: Iterable<string>) => void;
  toggle: (clave: string) => Promise<{ on: boolean; error?: string }>;
  asentado: () => Promise<ReadonlySet<string>>;
}

export function crearListaEnMemoria(
  escribir: Escribir,
  // Cada cambio de claves (optimista, rollback o carga) se publica acá.
  avisar: (claves: ReadonlySet<string>) => void = () => {},
): ListaEnMemoria {
  let claves: ReadonlySet<string> = new Set();
  const enVuelo = new Set<Promise<unknown>>();
  const fijar = (nuevas: ReadonlySet<string>) => { claves = nuevas; avisar(nuevas); };
  const con = (k: string, on: boolean) => {
    const n = new Set(claves);
    if (on) n.add(k); else n.delete(k);
    return n;
  };

  return {
    claves: () => claves,
    reemplazar: (nuevas) => fijar(new Set(nuevas)),
    toggle(k) {
      const on = !claves.has(k);
      fijar(con(k, on));
      const deshacer = () => fijar(con(k, !on));
      const op: Promise<{ on: boolean; error?: string }> = escribir(k, on).then(
        (r) => { if (r.error) deshacer(); return { on, error: r.error }; },
        (e: unknown) => { deshacer(); return { on, error: String(e) }; },
      );
      // Se saca del conjunto DENTRO de la misma cadena: cuando `asentado` ve el
      // conjunto vacío, el rollback (si hubo) ya está aplicado.
      const marca: Promise<unknown> = op.then(() => { enVuelo.delete(marca); });
      enVuelo.add(marca);
      return op;
    },
    async asentado() {
      // Una escritura puede empezar mientras se espera otra: se vuelve a mirar
      // hasta que no quede ninguna. Cada vuelta espera promesas reales.
      while (enVuelo.size) await Promise.allSettled([...enVuelo]);
      return claves;
    },
  };
}
