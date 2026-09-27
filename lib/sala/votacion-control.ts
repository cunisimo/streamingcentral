// El bucle de la votación sin React (plan de salas, Tarea 3.4). Dependencias
// inyectadas (enviar, releer, reloj) para poder probarlo con un reloj
// controlado; `components/sala/Votacion.tsx` sólo lo cablea.
//
// Lo que fija:
//   - un solo `sala_votar` en vuelo por vez (`enVuelo`);
//   - al vencer el contador local se manda `pass`, y si esa solicitud falló se
//     reintenta como mucho cada REINTENTO_MS (o antes si vuelve la red);
//   - 🔴 DESPUÉS DE `ronda_cerrada` O `inexistente` LA COMPUERTA SE CIERRA: no
//     sale ni un `sala_votar` más, aunque el contador siga vencido y aunque la
//     relectura del estado falle y se reintente. Sin esto, con `releer`
//     fallando, el intervalo de 250 ms mandaba hasta cuatro RPC por segundo
//     contra una ronda que ya no existe. La ronda que sigue es OTRO componente
//     (`key={ronda.id}`), con su propio control.
import type { Voto } from "./estado.ts";
import { decidirTrasVotar, VOTO_AL_VENCER, type RespuestaVotar } from "./votacion-nucleo.ts";
import { mensajeDeError, SIN_RED } from "./mensajes.ts";

export const REINTENTO_MS = 3000;

export interface DepsControl {
  size: number;
  ahora: () => number;
  /** `sala_votar`. Resuelve con la respuesta de la RPC; lanza ante fallo de red. */
  enviar: (pos: number, voto: Voto) => Promise<{ data: unknown; error: { message: string } | null }>;
  /** `useSala.releer`. Puede fallar: acá no se mira su resultado. */
  releer: () => Promise<void>;
  /** El servidor confirmó el avance de `pos`: borrar su comienzo persistido. */
  alConfirmar: (pos: number) => void;
  /** Nueva posición (null = ya voté todas, o la ronda se cerró: no se muestra otra card). */
  alAvanzar: (siguiente: number | null) => void;
  /** Texto del error visible; `null` lo limpia (al empezar un intento nuevo). */
  alError: (texto: string | null) => void;
  alVuelo: (enVuelo: boolean) => void;
}

export interface ControlVotacion {
  votar(v: Voto, pos: number): Promise<void>;
  /** Un tick del contador de la card `pos`, que arrancó en `arrancoEn`. */
  tick(pos: number, vencida: boolean): void;
  /** Volvió la red: el próximo tick puede reintentar sin esperar REINTENTO_MS. */
  permitirReintento(): void;
  enVuelo(): boolean;
  cerrada(): boolean;
  /** Diagnóstico/tests: cuántos `sala_votar` salieron. */
  enviados(): number;
}

export function crearControlVotacion(d: DepsControl): ControlVotacion {
  let enVuelo = false;
  let cerrada = false;
  let reintentarEn = 0;
  let enviados = 0;

  async function votar(v: Voto, pos: number): Promise<void> {
    if (cerrada || enVuelo) return;
    enVuelo = true; d.alVuelo(true);
    d.alError(null);   // un intento nuevo arranca sin el error del anterior
    try {
      enviados++;
      const { data, error } = await d.enviar(pos, v);
      if (error) { d.alError(mensajeDeError(error.message)); reintentarEn = d.ahora() + REINTENTO_MS; return; }
      const r = decidirTrasVotar(data as RespuestaVotar, pos, d.size);
      if (r.cerrar) d.alConfirmar(pos);
      if (r.rondaCerrada) {
        // Se cierra ANTES de releer y sin mirar si la relectura anduvo: el
        // estado nuevo lo trae useSala cuando pueda (canal, respaldo, plazo).
        // Con un match temprano (ok + estado ≠ votando) además se sale de la
        // card: no se muestra otra, la vista espera el resultado.
        cerrada = true;
        if (r.termine) d.alAvanzar(null);
        d.releer().catch(() => { /* la relectura tiene sus propios reintentos */ });
        return;
      }
      d.alAvanzar(r.siguiente);
      if (r.siguiente === null) d.releer().catch(() => { /* idem */ });
    } catch {
      d.alError(SIN_RED); reintentarEn = d.ahora() + REINTENTO_MS;
    } finally {
      enVuelo = false; d.alVuelo(false);
    }
  }

  return {
    votar,
    tick(pos, vencida) {
      if (cerrada || !vencida || enVuelo) return;
      if (d.ahora() < reintentarEn) return;
      void votar(VOTO_AL_VENCER, pos);
    },
    permitirReintento() { reintentarEn = 0; },
    enVuelo: () => enVuelo,
    cerrada: () => cerrada,
    enviados: () => enviados,
  };
}
