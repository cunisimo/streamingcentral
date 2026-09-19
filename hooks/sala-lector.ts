// El lector de `sala_estado` de useSala, sin React (plan de salas, Tarea 3.2).
// Junta la compuerta monotónica (sala-compuerta.ts) con la relectura acotada
// (sala-relectura-nucleo.ts) y con las tres cosas que la vista necesita saber:
// estado nuevo, error, token inválido, y "ya terminó la primera lectura".
//
// 🔴 UNA RESPUESTA DESCARTADA NO TOCA NADA. Ni el estado, ni el error, ni
// `cargando`, ni la máquina de relectura: cuando la compuerta rechaza un
// ticket —más viejo que el último aplicado, o de una generación anterior
// (otra sala, otra credencial)— la lectura sale sin efectos. La primera versión
// aplicaba la compuerta al estado pero dejaba el `finally` suelto, así que una
// lectura de la sala anterior podía apagar el "Cargando…" de la nueva y marcar
// como hecha una relectura que la nueva todavía tenía pendiente.
import { crearCompuerta } from "./sala-compuerta.ts";
import { alReleer, alSenal, inicial, type EstadoRelectura } from "./sala-relectura-nucleo.ts";
import { esTerminal, type RespuestaEstado } from "../lib/sala/estado.ts";

export interface DepsLector {
  /** La RPC `sala_estado` con la sala y credencial de ESTA generación. */
  pedir: () => Promise<{ data: unknown; error: { message: string } | null }>;
  ahora: () => number;
  /** Estado nuevo aplicado (ya pasó la compuerta). `recibidoMs` sirve para el desfase de reloj. */
  alEstado: (e: RespuestaEstado, recibidoMs: number) => void;
  /** Fallo de lectura aplicado (red / RPC), con el estado anterior conservado. */
  alError: (mensaje: string) => void;
  /** La base no reconoce la credencial en esta sala. */
  alTokenInvalido: () => void;
  /** Terminó una lectura de la generación vigente (éxito o error): `cargando` puede apagarse. */
  alTerminarLectura: () => void;
  /** La sala llegó a un estado terminal: cerrar canal, borrar credencial. */
  alTerminal: () => void;
}

export interface Lector {
  leer(): Promise<void>;
  /** Señal del canal: en cuántos ms releer, o null si ya hay una relectura pendiente. */
  senal(): number | null;
  /** Otra sala u otra credencial: nueva generación; lo que estaba en vuelo no cuenta. */
  reiniciar(): void;
  terminal(): boolean;
  /** Diagnóstico/tests. */
  relectura(): EstadoRelectura;
}

export function crearLector(d: DepsLector): Lector {
  const compuerta = crearCompuerta();
  let relectura = inicial();
  let terminal = false;

  return {
    async leer() {
      if (terminal) return;
      const ticket = compuerta.emitir();
      let admitida = false;
      try {
        const { data, error } = await d.pedir();
        admitida = compuerta.aplicar(ticket);
        if (!admitida) return;
        if (error) {
          if (/sala_token_invalido/.test(error.message)) { terminal = true; d.alTokenInvalido(); }
          else d.alError(error.message);
          return;
        }
        const r = data as RespuestaEstado;
        d.alEstado(r, d.ahora());
        if (esTerminal(r)) { terminal = true; d.alTerminal(); }
      } catch (err) {
        admitida = compuerta.aplicar(ticket);
        if (admitida) d.alError(err instanceof Error ? err.message : "fallo");
      } finally {
        // Sólo la lectura admitida cierra la vuelta: marca la relectura como
        // hecha y avisa que terminó (cargando = false).
        if (admitida) {
          relectura = alReleer(relectura, d.ahora());
          d.alTerminarLectura();
        }
      }
    },
    senal() {
      if (terminal) return null;
      const r = alSenal(relectura, d.ahora());
      relectura = r.estado;
      return r.programarEnMs;
    },
    reiniciar() {
      compuerta.reiniciar();
      relectura = inicial();
      terminal = false;
    },
    terminal: () => terminal,
    relectura: () => relectura,
  };
}
