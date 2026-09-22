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

/**
 * Cómo terminó una lectura. Lo mira `useSala.releer`, que es lo que consume
 * `lib/sala/acciones-host.ts`: sólo `"fallo"` justifica reintentar.
 *   aplicada   — se aplicó el estado (o el estado terminal).
 *   descartada — la compuerta la rechazó: hay una más nueva, o cambió la sala.
 *                No se reintenta: lo que valía ya se aplicó o ya no importa.
 *   fallo      — error de la RPC o de red. ES EL ÚNICO QUE SE REINTENTA.
 *   invalida   — `sala_token_invalido`: terminal, no hay nada que reintentar.
 *   omitida    — el lector ya estaba terminal.
 */
export type ResultadoLectura = "aplicada" | "descartada" | "fallo" | "invalida" | "omitida";

export interface Lector {
  /**
   * 🔴 DEVUELVE CÓMO TERMINÓ, Y NO LANZA. La primera versión no devolvía nada y
   * atrapaba los errores para avisarlos por `alError`: con ese contrato,
   * `asegurarRelectura` veía una promesa resuelta y daba la lectura por buena,
   * así que la cadena de reintentos NUNCA arrancaba. Quien necesite reintentar
   * mira este resultado (lo hace `useSala.releer`).
   */
  leer(): Promise<ResultadoLectura>;
  /** Señal del canal: en cuántos ms releer, o null si ya hay una relectura pendiente. */
  senal(): number | null;
  /** Otra sala u otra credencial: nueva generación; lo que estaba en vuelo no cuenta. */
  reiniciar(): void;
  terminal(): boolean;
  /** Diagnóstico/tests. */
  relectura(): EstadoRelectura;
}

/** El error con el que `releer` avisa que la lectura NO se pudo aplicar. */
export class ErrorRelectura extends Error {
  // Sin parameter property: `node --test` corre estos .ts en modo strip-only.
  readonly resultado: ResultadoLectura;
  constructor(resultado: ResultadoLectura) {
    super("sala_relectura_fallida");
    this.resultado = resultado;
  }
}

/**
 * El `releer` que consumen las acciones del organizador
 * (`lib/sala/acciones-host.ts`): **rechaza cuando la lectura falló**, que es lo
 * que dispara la cadena de reintentos acotada. Descartada / inválida / omitida
 * NO son fallos: no hay nada que reintentar.
 */
export function releerDe(lector: Pick<Lector, "leer">): () => Promise<void> {
  return async () => {
    const r = await lector.leer();
    if (r === "fallo") throw new ErrorRelectura(r);
  };
}

export function crearLector(d: DepsLector): Lector {
  const compuerta = crearCompuerta();
  let relectura = inicial();
  let terminal = false;

  return {
    async leer(): Promise<ResultadoLectura> {
      if (terminal) return "omitida";
      const ticket = compuerta.emitir();
      let admitida = false;
      try {
        const { data, error } = await d.pedir();
        admitida = compuerta.aplicar(ticket);
        if (!admitida) return "descartada";
        if (error) {
          if (/sala_token_invalido/.test(error.message)) { terminal = true; d.alTokenInvalido(); return "invalida"; }
          d.alError(error.message);
          return "fallo";
        }
        const r = data as RespuestaEstado;
        d.alEstado(r, d.ahora());
        if (esTerminal(r)) { terminal = true; d.alTerminal(); }
        return "aplicada";
      } catch (err) {
        admitida = compuerta.aplicar(ticket);
        if (admitida) d.alError(err instanceof Error ? err.message : "fallo");
        return admitida ? "fallo" : "descartada";
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
