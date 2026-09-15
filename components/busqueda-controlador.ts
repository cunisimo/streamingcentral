// El controlador de la búsqueda con texto: generación, debounce y respuesta,
// separado de React para poder probarlo con un reloj y un fetch inyectados
// (auditoría de Codex sobre 09b9dbe, hallazgo 1).
//
// 🔴 LA REGLA: la generación sube EN EL INSTANTE en que cambia el término (o las
// plataformas, o se restaura, o se desmonta), no cuando vence el debounce. Una
// respuesta que pertenece a una generación anterior se descarta ENTERA —no toca
// resultados, ni el aviso de TMDB, ni el estado de carga— aunque llegue en la
// ventana de 250 ms en la que el pedido nuevo todavía no salió. En 09b9dbe el
// número de pedido se tomaba dentro del temporizador, y en esa ventana la
// respuesta vieja seguía siendo "vigente".
//
// El estado (resultados, cargando, aviso) lo lleva el reductor puro de
// components/busqueda-estado.ts; acá sólo se decide QUÉ evento entra y cuándo.
import { ESTADO_INICIAL, reducirBusqueda, type EstadoBusqueda, type Resultados } from "./busqueda-estado.ts";

export interface DepsControlador {
  /** El fetch a /api/search. Recibe la señal de cancelación del pedido. */
  pedir: (term: string, plataformas: string[], senal: AbortSignal) => Promise<{ ok: boolean; body: unknown }>;
  /** `setTimeout` inyectable; devuelve la cancelación. */
  programar: (fn: () => void, ms: number) => () => void;
  /** Recibe cada estado nuevo (en React: `setBusqueda`). */
  emitir: (estado: EstadoBusqueda) => void;
  debounceMs?: number;
}

export function crearControladorBusqueda(deps: DepsControlador) {
  let generacion = 0;
  let estado: EstadoBusqueda = ESTADO_INICIAL;
  let cancelarTimer: (() => void) | null = null;
  let enVuelo: AbortController | null = null;

  const emitir = (evento: Parameters<typeof reducirBusqueda>[1]) => {
    estado = reducirBusqueda(estado, evento);
    deps.emitir(estado);
  };
  // Todo lo pendiente de la generación anterior muere acá, ANTES de decidir
  // qué hacer con la nueva.
  const invalidar = () => {
    generacion++;
    if (cancelarTimer) { cancelarTimer(); cancelarTimer = null; }
    if (enVuelo) { enVuelo.abort(); enVuelo = null; }
  };

  return {
    /** El término o las plataformas cambiaron (o se confirmó el mismo término con otras plataformas). */
    cambiarTermino(term: string, plataformas: string[]) {
      invalidar();
      const t = term.trim();
      if (t.length < 2) { emitir({ tipo: "termino-corto" }); return; }
      emitir({ tipo: "nuevo-termino" });
      const mia = generacion;
      cancelarTimer = deps.programar(() => {
        cancelarTimer = null;
        if (mia !== generacion) return;
        const ctl = new AbortController();
        enVuelo = ctl;
        deps.pedir(t, plataformas, ctl.signal)
          .then(({ ok, body }) => {
            if (mia !== generacion) return;          // respuesta de un pedido superado: nada
            enVuelo = null;
            emitir({ tipo: "respuesta", ok, body, vigente: true });
          })
          .catch(() => {
            if (mia !== generacion) return;
            enVuelo = null;
            emitir({ tipo: "fallo-red" });
          });
      }, deps.debounceMs ?? 250);
    },
    /** Volver de una ficha: los resultados vienen del snapshot; nada pendiente puede pisarlos. */
    restaurar(res: Resultados) {
      invalidar();
      emitir({ tipo: "restaurado", res });
    },
    desmontar() { invalidar(); },
    estado: () => estado,
  };
}
