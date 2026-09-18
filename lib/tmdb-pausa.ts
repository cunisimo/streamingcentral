// La PAUSA ante 429 vista desde UN proceso. Etapa 3.c.1 de capacidad (#19),
// informe docs/medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md §39.5,
// §40.1, §41.2, §41.3, §43.6-§43.9 y §45-§52.
//
// ============================================================================
// QUÉ RESUELVE
// ============================================================================
// Cuando TMDB responde 429, hoy cada proceso sigue drenando su cola entera:
// medido, 750-778 llamadas más en 3,4-4,4 s tras el primer 429 (§44.3). Acá
// hay DOS niveles, y ninguno toca qué pide el Home ni en qué orden:
//
//   Nivel 1 — LOCAL, inmediato, sin Redis. El primer 429 fija `pausaLocalHasta`
//   en memoria; desde ese instante las llamadas que esperan el semáforo de
//   lib/tmdb.ts no se inician (salen rechazadas), las en vuelo terminan solas.
//   Nivel 2 — COMPARTIDO, por Redis. El mismo 429 escribe la pausa compartida
//   (script PAUSAR, idempotente por evento: `<uuid>:<contador>`, §40.1) para
//   las demás instancias; y un LECTOR no bloqueante la relee a lo sumo una vez
//   por Δt (§41.2/§43.6): una lectura en vuelo por proceso, `F_max = 1` fallo
//   → 30 s de enfriamiento (§43.8), nunca una tormenta contra Redis.
//
// La pausa local es lo que decide: la compartida sólo la ALARGA (nunca la
// acorta), venga de PAUSAR (`ya-mayor`) o del lector. Con Redis caído queda el
// nivel 1, contado como `pausaNoLeida`.
//
// Lo que este módulo NO hace: no decide el Home (lib/home-servir.ts, que lee
// `vigente()`), no cancela llamadas en vuelo (ya cuentan para TMDB), no
// reintenta PAUSAR a mano (el SDK reintenta y el script es idempotente) y no
// conoce el reloj de Redis (los cubos se sellan dentro de los scripts).
// Puro: `ops`, el reloj y el registro se inyectan; lib/cache.ts enchufa las
// primitivas reales y lib/tmdb-pausa.test.ts lo prueba con reloj virtual.
import { CLAVES_PAUSA } from "./pausa-lua.ts";
import type { OpsPausa } from "./turno.ts";

export const CONSTANTES_PAUSA = {
  /** Sin `Retry-After`: el mismo default que fabrica lib/tmdb-http.ts (5 s, §42.3). */
  PAUSA_DEFECTO_MS: 5_000,
  /** Tope a un `Retry-After` desmedido [propuesto]: acota el daño de una cabecera absurda; una pausa que sigue se extiende con el 429 siguiente. */
  PAUSA_MAX_MS: 60_000,
  /** Δt del lector: una lectura por segundo, contada desde el INICIO de la anterior (§43.6: sólo Δt, sin K). */
  DELTA_LECTURA_MS: 1_000,
  /** Timeout propio de cada lectura; lo aplica el cliente inyectado (lib/cache.ts) y acá sólo se documenta. */
  TIMEOUT_LECTURA_MS: 1_000,
  /** Fallos seguidos que enfrían al lector (§43.8: alineado con "≤ 1 intento fallido por composición"). */
  F_MAX: 1,
  /** Sin leer tras `F_MAX` fallos; el nivel 1 sigue vivo mientras tanto. */
  ENFRIAMIENTO_LECTOR_MS: 30_000,
} as const;

export type CampoCubo = "pausaNoLeida" | "pausadosUB" | "pausados503";

export interface DepsPausa {
  ops: OpsPausa;
  /** Identidad del proceso: parte del id de evento y de la marca de agua. */
  uuid: string;
  /** Kill switch `TMDB_PAUSA_429=0`: con `false`, nada lee, nada escribe, `vigente()` es 0. */
  activa: boolean;
  ahora?: () => number;
  log?: (linea: string) => void;
}

export interface Pausa {
  /** Milisegundos que le quedan a la pausa LOCAL de este proceso; 0 si no hay. Sincrónico. */
  vigente(): number;
  /** Nivel 1 en el acto y nivel 2 serializado. Resuelve cuando el evento (propio o fundido) terminó su viaje a Redis. */
  registrar429(o: { retryAfterMs: number | null; familia: string }): Promise<void>;
  /** Gancho del semáforo: cada permiso concedido le da al lector la oportunidad de releer, según Δt. Sincrónico, nunca bloquea. */
  permiso(): void;
  /** Contadores del cliente en los cubos de Redis; fire-and-forget. */
  anotarCubo(campo: CampoCubo): void;
  // Observación (tests y línea de log):
  eventosEnviados(): number;
  ultimoEvento(): { id: string; ms: number } | null;
  lecturasIniciadas(): number;
  lecturasEnVuelo(): number;
  lecturasFallidas(): number;
}

export function crearPausa(deps: DepsPausa): Pausa {
  const C = CONSTANTES_PAUSA;
  const ahora = deps.ahora ?? Date.now;
  const log = deps.log ?? ((l: string) => console.log(l));
  let pausaLocalHasta = 0;
  const alargar = (ms: number) => { if (ms > 0) pausaLocalHasta = Math.max(pausaLocalHasta, ahora() + ms); };

  // --- escritura serializada: uno en vuelo por proceso; lo que llega mientras tanto se funde ---
  let contador = 0;
  let enVuelo: Promise<void> | null = null;
  let pendiente: { ms: number; familia: string; retryAfterMs: number | null; listo: Promise<void>; resolver: () => void } | null = null;
  let ultimo: { id: string; ms: number } | null = null;

  const enviar = async (ms: number, familia: string, retryAfterMs: number | null): Promise<void> => {
    contador += 1;
    const id = `${deps.uuid}:${contador}`;
    ultimo = { id, ms };
    let r: unknown;
    try {
      r = await deps.ops.evalPausar(
        [CLAVES_PAUSA.pausa, CLAVES_PAUSA.ev(id), CLAVES_PAUSA.proc(deps.uuid), CLAVES_PAUSA.eventos, CLAVES_PAUSA.cubos],
        [id, String(ms), String(contador), familia, String(retryAfterMs ?? ms)],
      );
    } catch (e) {
      log(`[tmdb] pausa ${id} ${ms}ms: PAUSAR indeterminado (${String(e).slice(0, 80)}); rige la pausa local`);
      return;
    }
    if (Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && Number.isInteger(r[1])) {
      const restante = r[1] as number;
      // `ya-mayor` / `ya-aplicada` traen el PTTL de la compartida: si es mayor, la local se alinea.
      alargar(restante);
      log(`[tmdb] pausa ${id} ${ms}ms: ${r[0]} (compartida ${restante}ms)`);
      return;
    }
    log(`[tmdb] pausa ${id} ${ms}ms: PAUSAR indeterminado (respuesta ${JSON.stringify(r)}); rige la pausa local`);
  };
  const bombear = (): void => {
    if (enVuelo || !pendiente) return;
    const p = pendiente; pendiente = null;
    enVuelo = enviar(p.ms, p.familia, p.retryAfterMs).finally(() => { enVuelo = null; p.resolver(); bombear(); });
  };

  // --- el lector (nivel 2) ---
  let lecturaEnVuelo = false, inicioUltimaLectura = -Infinity, fallosSeguidos = 0, enfriadoHasta = -Infinity;
  let lecturasIniciadas = 0, lecturasFallidas = 0;
  const leer = async () => {
    lecturaEnVuelo = true; lecturasIniciadas += 1; inicioUltimaLectura = ahora();
    let r: unknown;
    try { r = await deps.ops.pttl(CLAVES_PAUSA.pausa); } catch { r = undefined; }
    lecturaEnVuelo = false;
    if (!Number.isInteger(r)) {
      // Timeout, error o el `"Aborted"` sintético del SDK: nunca es "sin pausa".
      lecturasFallidas += 1; fallosSeguidos += 1;
      anotarCubo("pausaNoLeida");
      if (fallosSeguidos >= C.F_MAX) { enfriadoHasta = ahora() + C.ENFRIAMIENTO_LECTOR_MS; fallosSeguidos = 0; }
      return;
    }
    fallosSeguidos = 0;
    alargar(r as number);   // > 0 vigente por esos ms; -2/-1 no tocan la local
  };

  const anotarCubo = (campo: CampoCubo) => {
    if (!deps.activa) return;
    deps.ops.evalCubo([CLAVES_PAUSA.cubos], [campo]).catch(() => { /* telemetría: nunca bloquea ni propaga */ });
  };

  return {
    vigente() { return deps.activa ? Math.max(0, pausaLocalHasta - ahora()) : 0; },
    registrar429({ retryAfterMs, familia }) {
      if (!deps.activa) return Promise.resolve();
      const ms = Math.min(C.PAUSA_MAX_MS, Math.max(1, Math.round(retryAfterMs ?? C.PAUSA_DEFECTO_MS)));
      alargar(ms);                                                  // nivel 1: antes de cualquier I/O
      if (pendiente) {
        pendiente.ms = Math.max(pendiente.ms, ms);                    // fundido: el Retry-After mayor
        return pendiente.listo;
      }
      let resolver!: () => void;
      const listo = new Promise<void>((r) => { resolver = r; });
      pendiente = { ms, familia, retryAfterMs, listo, resolver };
      bombear();
      return listo;
    },
    permiso() {
      if (!deps.activa || lecturaEnVuelo) return;
      const t = ahora();
      if (t < enfriadoHasta) return;
      if (t - inicioUltimaLectura < C.DELTA_LECTURA_MS) return;
      void leer();
    },
    anotarCubo,
    eventosEnviados: () => contador,
    ultimoEvento: () => ultimo,
    lecturasIniciadas: () => lecturasIniciadas,
    lecturasEnVuelo: () => (lecturaEnVuelo ? 1 : 0),
    lecturasFallidas: () => lecturasFallidas,
  };
}
