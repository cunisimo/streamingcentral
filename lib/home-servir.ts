// La SECUENCIA del Home con turno distribuido y último bueno. Etapa 2 de
// capacidad (#17), informe docs/medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md §5.1.
//
// ============================================================================
// QUÉ RESUELVE
// ============================================================================
// La Etapa 1 une las solicitudes simultáneas de UN proceso (lib/home-vuelo.ts).
// Entre instancias de Vercel no coordinaba nada: la misma clave fría en K
// instancias eran K composiciones, y al vencer el TTL alguien pagaba el
// rearmado entero sin nada que mostrar mientras tanto. Acá, por cada clave del
// Home, hay un TURNO de composición en Redis (SET NX PX + cuatro scripts Lua,
// lib/turno.ts) y una segunda copia, el ÚLTIMO BUENO (UB), sin semilla, que se
// sirve en tiempo de HIT mientras uno reconstruye (decisión del dueño).
//
// ============================================================================
// LA SECUENCIA (§5.1), tal cual se ejecuta acá
// ============================================================================
//  1. GET fresca (UNA copia: el camino caliente no paga nada más)   → hit
//  2. MISS → MGET [ub, degradado], una sola vez
//  3. tomar el turno: adquirido | ocupado | sin-redis
//     sin-redis → componer sin coordinar, SERVIR y NO GUARDAR NADA (§3.7): con
//     Redis vuelto a mitad, una escritura directa pisaría sin fencing lo que
//     otro acaba de publicar.
//  4. adquirido (directo o reconciliado):
//     4.0 GET fresca OTRA VEZ. Carrera lectura → turno: entre la lectura y el
//         SET NX otro pudo publicar y liberar; si la fresca apareció, LIBERAR,
//         servir esa fresca (`fresca-tras-turno`) y no componer.
//     4a  "[home] compone <clave> <propietario>": la evidencia de composición
//         iniciada que un proceso asesinado sí alcanza a dejar.
//     4b  renovar cada RENOVACION_MS mientras se compone; `perdido` (el script
//         devolvió 0) → seguir componiendo, no publicar; `indeterminado` → nada.
//         El ciclo es CANCELABLE y se ESPERA: cuando la composición termina
//         (bien o mal) se aborta su señal —el `dormir` despierta en el acto y no
//         queda temporizador— y se aguarda la promesa, así que ninguna
//         renovación corre ni anota métricas después de devolver (auditoría de
//         Codex sobre fb3a3f1: `void renovacion` dejaba un temporizador vivo
//         hasta 5 s y una renovación en vuelo podía anotar después de la línea
//         terminal). ⚠️ LÍMITE: `await renovacion` espera también a un RENOVAR
//         ya enviado a Redis; si esa operación no responde, la respuesta se
//         demora lo que tarde el SDK (sus reintentos no se cancelan por
//         solicitud: la promesa reducida de §3.8). No es una garantía absoluta
//         de deadline ni de "ninguna promesa viva" con Redis colgado; el
//         cliente de Redis no se rediseña acá.
//     4c  componer (la señal de la solicitud llega a TMDB y Supabase por
//         lib/senal-solicitud.ts). Si el productor RECHAZA: se corta la
//         renovación, se LIBERA el turno (compare-and-delete) y, con UB, se
//         sirve el UB registrando `errorProductor`; sin UB, el error se
//         propaga como siempre (la ruta responde 500) — pero ya sin turno
//         huérfano ni temporizador vivo.
//     4d  cancelada por la señal → LIBERAR (no ENFRIAR), UB si hay o vacío
//     4e  degradado → ENFRIAR: el turno pasa a `enfriando:<yo>` por
//         ENFRIAMIENTO_MS y el degradado va a su clave aparte (nunca a la fresca
//         ni al UB); se sirve UB si hay (degradado descartado), si no el degradado
//     4f  bueno → PUBLICAR (fresca + UB + generación, atómico, con fencing por
//         propietario y por día); rechazado → servir lo propio sin publicar
//  5. ocupado: UB → servirlo; degradado compartido → servirlo; nada → esperar
//     reintentando el turno cada ESPERA_MS hasta TOPE_ESPERA_MS o la señal:
//     fresca/UB/degradado aparecidos → servir; turno adquirido → ir a 4 si el
//     presupuesto restante alcanza para componer; agotado → vacío degradado.
//
// 🔴 ESTE MÓDULO NO ESCRIBE. Las únicas escrituras del contrato del Home son
// PUBLICAR y ENFRIAR, dentro de `turno` (lib/turno.ts); no existe `escribir` en
// las deps. Es puro: reloj, `dormir` y las lecturas se inyectan, y se prueba
// con la emulación en memoria y un reloj virtual (lib/home-servir.test.ts).
import { anotar } from "./metricas.ts";
import type { Turno } from "./turno.ts";

export const CONSTANTES = {
  /** Vida del turno sin renovar (§3.2): ≈ 3,5× la única medida real de un MISS (4,05 s). */
  TURNO_MS: 15_000,
  /** Renovación mientras se compone (§3.3): TURNO_MS / 3, dos perdidas seguidas dejan margen. */
  RENOVACION_MS: 5_000,
  /** Período del bucle de espera sin UB (§3.6). */
  ESPERA_MS: 500,
  /** Tope de esa espera (§3.8): provisorio, a confirmar con el banco. */
  TOPE_ESPERA_MS: 20_000,
  /** Máximo de una composición con factor de seguridad: 8 s (banco, L1) × 2. */
  COMPOSICION_MAX_MS: 16_000,
  /** PUBLICAR con el payload real midió 351 ms (§14); ×3 redondeado. */
  PUBLICACION_MAX_MS: 1_000,
  /** Arranque frío, red y serialización, fuera del presupuesto. */
  MARGEN_MS: 10_000,
  /** maxDuration = 60 de /api/home menos el margen. */
  PRESUPUESTO_REQUEST_MS: 60_000 - 10_000,
  /** Enfriamiento tras un degradado (§3.10): el valor inicial es el del turno, a medir. */
  ENFRIAMIENTO_MS: 15_000,
} as const;
export type Constantes = { -readonly [K in keyof typeof CONSTANTES]: number };

export interface ClavesHome { fresca: string; ub: string; gen: string; degradado: string; turno: string }

export interface DepsServir<T> {
  claves: ClavesHome;
  /** `<instancia>:<pid>:<contador>` (§3.1). */
  propietario: string;
  /** El día argentino de esta solicitud, para la generación del UB. */
  dia: string;
  ttl: { fresca: number; ub: number };
  /** Lee esas claves en UN comando (en producción: N `batchGet` en el mismo tick = un MGET). */
  leer: (claves: string[]) => Promise<(T | null)[]>;
  turno: Turno;
  /** La composición. `fallo` = degradado (alguna fuente cayó). */
  producir: () => Promise<{ valor: T; fallo: boolean }>;
  /** Si un resultado bueno merece publicarse (p. ej. "sin plataformas" no). Default: siempre. */
  publicable?: (v: T) => boolean;
  /** El payload vacío marcado degradado, para los dos finales sin contenido. */
  vacio: (motivo: "espera-agotada" | "cancelada") => T;
  senal?: AbortSignal;
  /**
   * Etapa 3.b, "último bueno primero" (§33): cuando el líder tiene un UB, el
   * adaptador intenta registrar la composición en fondo (`waitUntil`). Devuelve
   * `true` si la registró —y entonces la solicitud responde el UB en el acto y
   * `iniciar` corre después, con la señal de fondo que el adaptador le pasa— o
   * `false` sin haber iniciado nada, y el líder compone en línea como siempre.
   * Ausente: comportamiento de siempre.
   */
  programarEnFondo?: (iniciar: (senal?: AbortSignal) => Promise<void>) => boolean;
  ahora?: () => number;
  /** Dormir cancelable: con la señal abortada resuelve en el acto y no deja temporizador. */
  dormir?: (ms: number, senal?: AbortSignal) => Promise<void>;
  constantes?: Partial<Constantes>;
  /** Dónde va la línea `[home] compone …`. Default: console.log. */
  log?: (linea: string) => void;
}

/** El `dormir` real: un `setTimeout` que la señal cancela (y limpia) en el acto. */
export function dormirCancelable(ms: number, senal?: AbortSignal): Promise<void> {
  return new Promise<void>((r) => {
    if (senal?.aborted) { r(); return; }
    const alAbortar = () => { clearTimeout(timer); r(); };
    const timer = setTimeout(() => { senal?.removeEventListener("abort", alAbortar); r(); }, ms);
    senal?.addEventListener("abort", alAbortar, { once: true });
  });
}

export async function servirConTurno<T>(deps: DepsServir<T>): Promise<T> {
  const c: Constantes = { ...CONSTANTES, ...deps.constantes };
  const ahora = deps.ahora ?? Date.now;
  const dormir = deps.dormir ?? dormirCancelable;
  const log = deps.log ?? ((l: string) => console.log(l));
  const publicable = deps.publicable ?? (() => true);
  const { claves: K, propietario, senal } = deps;
  const t0 = ahora();
  const abortada = (s: AbortSignal | undefined = senal) => !!s?.aborted;
  anotar((m) => { m.home.propietario = propietario; });

  // 1. La fresca, y nada más.
  const [fresca] = await deps.leer([K.fresca]);
  if (fresca != null) {
    anotar((m) => { m.home.cache = "hit"; m.home.origen = "fresca"; });
    return fresca;
  }
  // 2. Sólo en el MISS: las dos copias de respaldo.
  let [ub, degradado] = await deps.leer([K.ub, K.degradado]);

  const servirUb = (v: T, cache: "ultimo-bueno" = "ultimo-bueno", origen: "ultimo-bueno" | "ultimo-bueno-fondo" = "ultimo-bueno") => {
    anotar((m) => { m.home.cache = cache; m.home.origen = origen; });
    return v;
  };
  const servirDegradadoCompartido = (v: T) => {
    anotar((m) => { m.home.cache = "degradado-compartida"; m.home.origen = "degradado-compartido"; });
    return v;
  };
  const servirVacio = (motivo: "espera-agotada" | "cancelada") => {
    anotar((m) => { m.home.cache = "vacio"; m.home.origen = motivo === "cancelada" ? "vacio-cancelada" : "vacio-espera-agotada"; if (motivo === "cancelada") m.home.cancelada = true; });
    return deps.vacio(motivo);
  };

  // 4. Con el turno en la mano.
  // `senalActiva`: la de la solicitud en línea, o la del fondo (3.b).
  const componer = async (senalActiva: AbortSignal | undefined = senal): Promise<T> => {
    // 4.0 Carrera lectura → turno: ¿alguien publicó mientras tanto?
    const [yaEsta] = await deps.leer([K.fresca]);
    if (yaEsta != null) {
      await deps.turno.liberar({ clave: K.turno, propietario });
      anotar((m) => { m.home.cache = "hit"; m.home.origen = "fresca-tras-turno"; });
      return yaEsta;
    }
    // 4a
    log(`[home] compone ${K.fresca} ${propietario}`);
    anotar((m) => { m.home.cache = "miss"; });
    // 4b La renovación corre al lado de la composición y se corta con ella:
    // `fin` la despierta si duerme; `await renovacion` espera la que esté en
    // vuelo. Nada de esto sobrevive a `componer`.
    const fin = new AbortController();
    const renovacion = (async () => {
      while (!fin.signal.aborted) {
        await dormir(c.RENOVACION_MS, fin.signal);
        if (fin.signal.aborted || abortada(senalActiva)) return;
        const r = await deps.turno.renovar({ clave: K.turno, propietario, px: c.TURNO_MS });
        if (r === "renovado") anotar((m) => { m.home.renovaciones += 1; });
        else if (r === "perdido") { anotar((m) => { m.home.turnoPerdido = true; }); return; }
        // indeterminado: se reintenta en la vuelta siguiente, no marca perdido.
      }
    })();
    const cortarRenovacion = async () => { fin.abort(); await renovacion; };
    // 4c
    let producido: { valor: T; fallo: boolean };
    try {
      producido = await deps.producir();
    } catch (error) {
      await cortarRenovacion();
      await deps.turno.liberar({ clave: K.turno, propietario });
      anotar((m) => { m.home.errorProductor = true; });
      if (ub != null) {
        console.error(`[home] el productor rechazó; se sirve el último bueno (${K.fresca}):`, error);
        return servirUb(ub);
      }
      // Sin UB no hay nada mejor que dar: la semántica de siempre (el error
      // sube a la ruta → 500), ahora con el turno liberado.
      throw error;
    }
    await cortarRenovacion();
    // 4d Cancelada por la señal: no es un degradado de TMDB.
    if (abortada(senalActiva)) {
      await deps.turno.liberar({ clave: K.turno, propietario });
      return ub != null ? (anotar((m) => { m.home.cancelada = true; }), servirUb(ub)) : servirVacio("cancelada");
    }
    // 4e Degradado: enfriar, y servir el UB si hay.
    if (producido.fallo) {
      const r = await deps.turno.enfriar({ claves: { turno: K.turno, degradado: K.degradado }, propietario, payload: JSON.stringify(producido.valor), px: c.ENFRIAMIENTO_MS });
      anotar((m) => { m.home.enfriado = r === "enfriado"; });
      if (ub != null) { anotar((m) => { m.home.degradadoDescartado = true; }); return servirUb(ub); }
      anotar((m) => { m.home.origen = "degradado-propio"; });
      return producido.valor;
    }
    // No publicable (p. ej. sin plataformas): se sirve y se suelta el turno.
    if (!publicable(producido.valor)) {
      await deps.turno.liberar({ clave: K.turno, propietario });
      anotar((m) => { m.home.origen = "propia"; });
      return producido.valor;
    }
    // 4f Publicar, con fencing. Si perdí el turno, el script lo rechaza solo.
    const r = await deps.turno.publicar({
      claves: { turno: K.turno, fresca: K.fresca, ub: K.ub, gen: K.gen },
      propietario, payload: JSON.stringify(producido.valor), ttlFresca: deps.ttl.fresca, ttlUb: deps.ttl.ub, dia: deps.dia,
    });
    anotar((m) => {
      m.home.publicacion = r;
      m.home.origen = r === "publicado" || r === "publicada-solo-fresca" ? "propia" : "propia-sin-publicar";
    });
    return producido.valor;
  };

  // 3. Tomar el turno.
  const tomar = async () => {
    const r = await deps.turno.tomar({ clave: K.turno, propietario, px: c.TURNO_MS });
    anotar((m) => { m.home.turno = r.estado === "adquirido" ? (r.reconciliado ? "reconciliado" : "adquirido") : r.estado; });
    return r;
  };
  let r = await tomar();
  if (r.estado === "sin-redis") {
    // §3.7: componer sin coordinar, servir, y no escribir nada.
    log(`[home] compone ${K.fresca} ${propietario} (sin-redis)`);
    anotar((m) => { m.home.cache = "miss"; m.home.origen = "sin-redis"; });
    const p = await deps.producir();
    return p.valor;
  }
  if (r.estado === "adquirido") {
    // Etapa 3.b: con UB y fondo registrado, el UB sale ya y la fresca se
    // compone después de responder. `programarEnFondo` es perezoso: si devuelve
    // false no inició nada, y el camino es el de siempre (una composición, en
    // línea). Sin UB no hay nada que servir primero: como siempre.
    if (ub != null && deps.programarEnFondo) {
      const ubServido = ub;
      const iniciar = async (senalFondo?: AbortSignal) => {
        // El fondo corre en SUS contextos (los abre el adaptador): la
        // correlación con la solicitud es por clave y propietario. Con UB, un
        // productor que rechaza no propaga: `componer` libera y devuelve el UB.
        // Lo que sí llegue hasta acá se anota, se libera y se relanza: lo
        // contiene el programador, así que la tarea registrada resuelve igual.
        anotar((m) => { m.home.propietario = propietario; m.home.turno = "adquirido"; });
        try {
          await componer(senalFondo);
        } catch (error) {
          anotar((m) => { m.home.errorProductor = true; });
          try { await deps.turno.liberar({ clave: K.turno, propietario }); } catch { /* ya liberado o sin Redis */ }
          throw error;
        }
      };
      // El programador es perezoso y contiene sus errores; por las dudas, un
      // registro que lance también cuenta como "sin fondo".
      let registrado = false;
      try { registrado = deps.programarEnFondo(iniciar); } catch { registrado = false; }
      if (registrado) {
        anotar((m) => { m.home.fondo = "programado"; });
        return servirUb(ubServido, "ultimo-bueno", "ultimo-bueno-fondo");
      }
    }
    return componer();
  }

  // 5. Ocupado.
  if (ub != null) return servirUb(ub);
  if (degradado != null) return servirDegradadoCompartido(degradado);
  const tEspera = ahora();
  const anotarEspera = () => { const e = ahora() - tEspera; anotar((m) => { m.home.esperaMs = e; }); };
  while (!abortada() && ahora() - tEspera < c.TOPE_ESPERA_MS) {
    await dormir(c.ESPERA_MS, senal);   // la señal de la solicitud despierta la espera en el acto
    if (abortada()) break;
    const [f, u, d] = await deps.leer([K.fresca, K.ub, K.degradado]);
    if (f != null) { anotarEspera(); anotar((m) => { m.home.cache = "esperada"; m.home.origen = "esperada"; }); return f; }
    if (u != null) { anotarEspera(); return servirUb(u); }
    if (d != null) { anotarEspera(); return servirDegradadoCompartido(d); }
    r = await tomar();
    if (r.estado === "sin-redis") {
      anotarEspera();
      log(`[home] compone ${K.fresca} ${propietario} (sin-redis)`);
      anotar((m) => { m.home.cache = "miss"; m.home.origen = "sin-redis"; });
      return (await deps.producir()).valor;
    }
    if (r.estado === "adquirido") {
      anotarEspera();
      const restante = c.PRESUPUESTO_REQUEST_MS - (ahora() - t0);
      if (restante < c.COMPOSICION_MAX_MS) {
        // Un rescate que va a morir en 504 no se empieza.
        await deps.turno.liberar({ clave: K.turno, propietario });
        return servirVacio("espera-agotada");
      }
      // El UB pudo aparecer durante la espera: `componer` lo usa ante un degradado.
      [ub, degradado] = [u, d];
      return componer();
    }
  }
  anotarEspera();
  return servirVacio(abortada() ? "cancelada" : "espera-agotada");
}
