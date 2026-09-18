// La SECUENCIA del Home con turno distribuido y último bueno. Etapa 2 de
// capacidad (#17), informe docs/medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md §5.1;
// Etapa 3.c.1 (#19), la PAUSA compartida ante 429 y los plazos absolutos,
// informe docs/medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md §40.5, §42,
// §43, §46-§52.
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
//  2b. PAUSA LOCAL vigente (3.c.1, §43.3; auditoría sobre 6fc63b5, punto 1): este
//     proceso vio un 429 y su pausa todavía rige. No se compone contra TMDB
//     pase lo que pase con Redis, y el pedido NO espera los reintentos del
//     SDK: la fresca y el UB se leen por el LECTOR ACOTADO (`deps.leerAcotada`:
//     cliente aparte, sin reintentos, señal de T_LECTURA_PAUSA_MS por
//     petición — cancela de verdad, no queda nada vivo después de responder)
//     y lo que no llega se da por ausente. Fresca → HIT; UB → `ultimo-bueno-pausa`;
//     sin UB → la misma regla de 3 (espera breve acotada + UNA readquisición
//     con su timeout) o el 503. Límite del recorrido: 2 lecturas acotadas +
//     ESPERA_PAUSA_MAX + JITTER + T_ADQ_MAX (≈ 10,25 s; con UB, ≈ 2 s).
//  3. tomar el turno: adquirido | ocupado | sin-redis | PAUSADO (3.c.1)
//     sin-redis → componer sin coordinar, SERVIR y NO GUARDAR NADA (§3.7): con
//     Redis vuelto a mitad, una escritura directa pisaría sin fencing lo que
//     otro acaba de publicar. Con PAUSA LOCAL vigente (§43.3) NUNCA se compone
//     contra TMDB, ni con Redis caído: es `pausado` con el restante local.
//     pausado (3.c.1, §42/§43): la pausa compartida está vigente y el script no
//     adquirió. Con UB → el UB en el acto (`ultimo-bueno-pausa`), sin componer
//     ni fondo. Sin UB → UN solo sueño de `min(restante, ESPERA_PAUSA_MAX)` +
//     jitter, si cabe en el presupuesto (plazo absoluto); después UNA sola
//     readquisición: adquirido → componer; pausado/indeterminado → el vacío
//     `pausa` que la ruta convierte en 503 + Retry-After; nunca un segundo
//     sueño, nunca 50 s, nunca un 200 vacío.
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
//         cliente de Redis no se rediseña acá. Ninguna renovación se INICIA con
//         la señal vencida; la última se anota con sus dos instantes (envío y
//         respuesta): el PEXPIRE corre cuando Redis atiende el comando, en
//         algún punto entre ambos, y el turno vence 15 s después de ESA
//         aplicación (§52) — no se afirma un restante exacto desde el cliente.
//     4c  componer (la señal de la solicitud llega a TMDB y Supabase por
//         lib/senal-solicitud.ts). Si el productor RECHAZA: se corta la
//         renovación, se LIBERA el turno (compare-and-delete) y, con UB, se
//         sirve el UB registrando `errorProductor`; sin UB, el error se
//         propaga como siempre (la ruta responde 500) — pero ya sin turno
//         huérfano ni temporizador vivo.
//     4d  cancelada por la señal, o devuelta en el plazo o después (§49) →
//         LIBERAR (no ENFRIAR, no PUBLICAR), UB si hay o vacío `cancelada`.
//     4d' PAUSA vigente al devolver (3.c.1, §40.5): el 429 llegó durante la
//         cola; la composición se cancela: LIBERAR, UB si hay
//         (`ultimo-bueno-pausa`) o vacío `pausa` (→ 503). Nunca ENFRIAR: un
//         Home mutilado por un 429 no se guarda ni como degradado.
//     4e  degradado → ENFRIAR: el turno pasa a `enfriando:<yo>` por
//         ENFRIAMIENTO_MS y el degradado va a su clave aparte (nunca a la fresca
//         ni al UB); se sirve UB si hay (degradado descartado), si no el degradado
//     4f  bueno → PUBLICAR (fresca + UB + generación, atómico, con fencing por
//         propietario y por día); rechazado → servir lo propio sin publicar.
//         PUBLICAR sólo se INICIA si queda RESERVA_PUBLICACION_MS antes del
//         plazo (§47/§48); si no, LIBERAR sin publicar.
//  5. ocupado: UB → servirlo; degradado compartido → servirlo; nada → esperar
//     reintentando el turno cada ESPERA_MS hasta TOPE_ESPERA_MS o la señal:
//     fresca/UB/degradado aparecidos → servir; turno adquirido → ir a 4 si el
//     presupuesto restante alcanza para componer; agotado → vacío degradado.
//
// ============================================================================
// LOS PLAZOS (3.c.1, §46-§48) — UN reloj absoluto, nunca `ahora − t0`
// ============================================================================
//  · `plazo` de la solicitud = inicioRuta + PRESUPUESTO_REQUEST_MS, creado junto
//    con la señal ANTES de la lectura previa (lib/home.ts). Todo presupuesto es
//    `plazo − ahora()`: la lectura previa también consume (§46: con `t0` local
//    un rescate podía empezar con 15 s reales creyendo tener 45).
//  · El fondo (3.b) tiene DOS límites: interno = inicioFondo + 50 s, externo =
//    inicioRuta + maxDuration − MARGEN_CIERRE_MS; `plazoEfectivo = min` (§47).
//    Si al iniciar no quedan COMPOSICION_MAX_MS + RESERVA_PUBLICACION_MS, no se
//    compone (`fondo no-iniciado-presupuesto`), el UB ya salió.
//  · Después del plazo efectivo no se INICIA nada productivo ni de publicación:
//    TMDB/Supabase (la señal), RENOVAR, ENFRIAR, PUBLICAR. Lo ya enviado a
//    Redis completa o pierde su respuesta (§48). Única excepción de cierre: UN
//    LIBERAR best effort, una sola vez por composición (`limpiar`, guardia por
//    intentos), y sólo con `ahora() < inicioRuta + MAX_DURATION_MS` (§49/§50,
//    estricto). Si no puede, el turno vence por su TTL.
//
// 🔴 ESTE MÓDULO NO ESCRIBE. Las únicas escrituras del contrato del Home son
// PUBLICAR y ENFRIAR, dentro de `turno` (lib/turno.ts); no existe `escribir` en
// las deps. Es puro: reloj, `dormir` y las lecturas se inyectan, y se prueba
// con la emulación en memoria y un reloj virtual (lib/home-servir.test.ts).
import { anotar } from "./metricas.ts";
import type { Turno } from "./turno.ts";
import type { CampoCubo } from "./tmdb-pausa.ts";

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
  /** Lo que se exige que QUEDE antes del plazo para INICIAR PUBLICAR (§48.2): una reserva, no una cota de cuánto tarda (medido 0,13-0,35 s). */
  RESERVA_PUBLICACION_MS: 1_000,
  /** Arranque frío, red y serialización, fuera del presupuesto. */
  MARGEN_MS: 10_000,
  /** maxDuration = 60 de /api/home menos el margen. */
  PRESUPUESTO_REQUEST_MS: 60_000 - 10_000,
  /** Enfriamiento tras un degradado (§3.10): el valor inicial es el del turno, a medir. */
  ENFRIAMIENTO_MS: 15_000,
  /** El `maxDuration` de la ruta: Vercel lo cuenta desde el inicio de la solicitud (§47). */
  MAX_DURATION_MS: 60_000,
  /** Reserva [propuesta] entre el plazo externo del fondo y el corte duro: publicación + línea + asentar waitUntil (§47.2). */
  MARGEN_CIERRE_MS: 5_000,
  /** Sin UB y pausado: cuánto se espera COMO MÁXIMO a que la pausa termine (§42.3: = REINTENTAR_POR_DEFECTO_MS; propuesta sin datos reales). */
  ESPERA_PAUSA_MAX_MS: 5_000,
  /** Jitter del único sueño, para que varias solicitudes no despierten en el mismo milisegundo (§42.2). */
  JITTER_MAX_MS: 250,
  /** Timeout propio de la readquisición tras el sueño (§43.4) [propuesto]. */
  T_ADQ_MAX_MS: 2_000,
  /** `Retry-After` conservador cuando la readquisición queda indeterminada (§43.5: = REINTENTAR_POR_DEFECTO_MS). */
  RETRY_AFTER_FALLBACK_MS: 5_000,
  /**
   * Con la pausa LOCAL vigente, tope de cada lectura de Redis de esta secuencia
   * (auditoría sobre 6fc63b5, punto 1; sobre d322282: el tope CANCELA el
   * trabajo, no sólo ignora el resultado): sin él, un Redis caído dejaba al
   * pedido esperando los 6 reintentos del SDK por lectura (medido: 23,1 s
   * hasta el 503). El tope lo aplica el LECTOR ACOTADO (`deps.leerAcotada`: un
   * cliente de Redis aparte, sin reintentos, con una señal de esta duración
   * por petición — lib/cache.ts), no una carrera acá: lo que no llega no
   * sigue reintentando después de responder. Sólo rige con pausa local; el
   * camino sano no lo toca.
   */
  T_LECTURA_PAUSA_MS: 1_000,
} as const;
export type Constantes = { -readonly [K in keyof typeof CONSTANTES]: number };

/** Los DOS límites absolutos del fondo (§47.2) y el efectivo. Puro: lo usan el adaptador (lib/home.ts) y los tests. */
export function plazosDelFondo(inicioRuta: number, inicioFondo: number, c: Pick<Constantes, "PRESUPUESTO_REQUEST_MS" | "MAX_DURATION_MS" | "MARGEN_CIERRE_MS"> = CONSTANTES) {
  const plazoInterno = inicioFondo + c.PRESUPUESTO_REQUEST_MS;
  const plazoExterno = inicioRuta + c.MAX_DURATION_MS - c.MARGEN_CIERRE_MS;
  const plazoEfectivo = Math.min(plazoInterno, plazoExterno);
  return { plazoInterno, plazoExterno, plazoEfectivo, limitadoPor: plazoInterno <= plazoExterno ? "interno" as const : "externo" as const };
}

export type ResultadoLimpieza = "liberado" | "no-era-mio" | "indeterminado" | "omitido-sin-margen" | "omitido-ya-intentado";

/**
 * La limpieza LIBERAR de una composición (§49-§50): UN solo intento (guardia
 * por intentos: la segunda llamada, venga del `catch` que venga, no envía nada),
 * sólo ESTRICTAMENTE antes del corte duro de Vercel (`ahora < inicioRuta +
 * maxDuration`; en el instante exacto ya no), best effort (un rechazo es
 * `indeterminado`, nunca una excepción). Si no puede, el turno vence por TTL.
 * Exportada para probar el mecanismo real llamándolo dos veces.
 */
export function crearLimpieza(o: { ahora: () => number; inicioRuta: number; maxDurationMs: number; liberar: () => Promise<"liberado" | "no-era-mio" | "indeterminado"> }) {
  let intentos = 0;
  return async (): Promise<ResultadoLimpieza> => {
    if (intentos >= 1) return "omitido-ya-intentado";
    intentos += 1;
    if (!(o.ahora() < o.inicioRuta + o.maxDurationMs)) return "omitido-sin-margen";
    try { return await o.liberar(); } catch { return "indeterminado"; }
  };
}

export interface ClavesHome { fresca: string; ub: string; gen: string; degradado: string; turno: string }

export type MotivoVacio = "espera-agotada" | "cancelada" | "pausa" | "pausa-indeterminada" | "presupuesto-insuficiente";

export interface DepsServir<T> {
  claves: ClavesHome;
  /** `<instancia>:<pid>:<contador>` (§3.1). */
  propietario: string;
  /** El día argentino de esta solicitud, para la generación del UB. */
  dia: string;
  ttl: { fresca: number; ub: number };
  /** Lee esas claves en UN comando (en producción: N `batchGet` en el mismo tick = un MGET). */
  leer: (claves: string[]) => Promise<(T | null)[]>;
  /**
   * La misma lectura, ACOTADA (3.c.1, auditoría sobre d322282): un MGET por un
   * cliente aparte que no reintenta y aborta cada petición a los
   * T_LECTURA_PAUSA_MS. Lo que no llega es `null` (o un rechazo: el cliente
   * real lanza al abortar; acá se trata igual), y nada sigue vivo después.
   * Sólo se usa con la pausa LOCAL vigente; sin pausa, `leer` de siempre.
   */
  leerAcotada: (claves: string[]) => Promise<(T | null)[]>;
  turno: Turno;
  /**
   * La composición. `fallo` = degradado (alguna fuente cayó). `pausada` (3.c.1)
   * = alguna llamada a TMDB fue RECHAZADA por la pausa durante esta composición:
   * el resultado está mutilado por un 429 aunque la pausa ya haya vencido al
   * devolver, y se trata como cancelada (LIBERAR), nunca como degradado.
   */
  producir: () => Promise<{ valor: T; fallo: boolean; pausada?: boolean }>;
  /** Si un resultado bueno merece publicarse (p. ej. "sin plataformas" no). Default: siempre. */
  publicable?: (v: T) => boolean;
  /**
   * El payload vacío marcado degradado, para los finales sin contenido. Los
   * motivos de la 3.c.1 (`pausa`, `pausa-indeterminada`, `presupuesto-insuficiente`)
   * llevan `reintentarEnMs`: la ruta los convierte en 503 + Retry-After (§41.5).
   */
  vacio: (motivo: MotivoVacio, extra?: { reintentarEnMs: number }) => T;
  senal?: AbortSignal;
  /**
   * Etapa 3.b, "último bueno primero" (§33): cuando el líder tiene un UB, el
   * adaptador intenta registrar la composición en fondo (`waitUntil`). Devuelve
   * `true` si la registró —y entonces la solicitud responde el UB en el acto y
   * `iniciar` corre después, con la señal de fondo y el PLAZO EFECTIVO (§47)
   * que el adaptador calcula al iniciar— o `false` sin haber iniciado nada, y
   * el líder compone en línea como siempre. Ausente: comportamiento de siempre.
   */
  programarEnFondo?: (iniciar: (senal?: AbortSignal, plazoEfectivo?: number) => Promise<void>) => boolean;
  ahora?: () => number;
  /** Dormir cancelable: con la señal abortada resuelve en el acto y no deja temporizador. */
  dormir?: (ms: number, senal?: AbortSignal) => Promise<void>;
  constantes?: Partial<Constantes>;
  /** Dónde va la línea `[home] compone …`. Default: console.log. */
  log?: (linea: string) => void;
  // --- 3.c.1 ---
  /** Plazo absoluto de la solicitud (§46), creado junto con la señal ANTES de la lectura previa. Default: `ahora() + PRESUPUESTO_REQUEST_MS` (compatibilidad). */
  plazo?: number;
  /** Comienzo real de la ruta (§47): el mismo instante del que sale `plazo`. Default: `plazo − PRESUPUESTO_REQUEST_MS`. */
  inicioRuta?: number;
  /** La pausa LOCAL del proceso (lib/tmdb-pausa.ts). Ausente = kill switch: la secuencia de siempre. */
  pausa?: { vigente(): number; anotarCubo(campo: CampoCubo): void };
  /** Jitter del sueño en ms, inyectable (default: azar en [0, JITTER_MAX_MS)). */
  jitter?: () => number;
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
  const { claves: K, propietario, senal, pausa } = deps;
  const plazo = deps.plazo ?? ahora() + c.PRESUPUESTO_REQUEST_MS;
  const inicioRuta = deps.inicioRuta ?? plazo - c.PRESUPUESTO_REQUEST_MS;
  const restanteSolicitud = () => plazo - ahora();
  const abortada = (s: AbortSignal | undefined = senal) => !!s?.aborted;
  const pausaLocal = () => pausa?.vigente() ?? 0;
  const jitter = deps.jitter ?? (() => Math.floor(Math.random() * c.JITTER_MAX_MS));
  anotar((m) => { m.home.propietario = propietario; });

  // 2b. Con la pausa LOCAL vigente, las lecturas van por el LECTOR ACOTADO:
  // Redis puede estar caído (es lo esperable junto a un 429 masivo) y no hay
  // nada que componer mientras la pausa rija. El lector cancela su propia
  // petición al tope; nada queda reintentando después de responder.
  // Se decide POR LECTURA, no sólo al entrar: la pausa puede nacer entre una
  // lectura y la siguiente (un 429 de otra solicitud del proceso).
  const localAlEntrar = pausaLocal();
  const leerAcotada = async (claves: string[]): Promise<(T | null)[]> => {
    if (pausaLocal() <= 0) return deps.leer(claves);
    // El lector acotado LANZA cuando su señal aborta o Redis falla (así se
    // comporta el cliente real sin reintentos): acá eso es "no llegó", nunca
    // un error del Home, y se cuenta como lectura acotada.
    const r = await deps.leerAcotada(claves).catch(() => null);
    if (r === null || r.every((v) => v == null)) anotar((m) => { m.home.lecturasAcotadas += 1; });
    return r ?? claves.map(() => null);
  };
  if (localAlEntrar > 0) anotar((m) => { m.home.pausaMs = localAlEntrar; });

  // 1. La fresca, y nada más.
  const [fresca] = await leerAcotada([K.fresca]);
  if (fresca != null) {
    anotar((m) => { m.home.cache = "hit"; m.home.origen = "fresca"; });
    return fresca;
  }
  // 2. Sólo en el MISS: las dos copias de respaldo.
  let [ub, degradado] = await leerAcotada([K.ub, K.degradado]);

  const servirUb = (v: T, cache: "ultimo-bueno" = "ultimo-bueno", origen: "ultimo-bueno" | "ultimo-bueno-fondo" | "ultimo-bueno-pausa" = "ultimo-bueno") => {
    anotar((m) => { m.home.cache = cache; m.home.origen = origen; });
    return v;
  };
  const servirDegradadoCompartido = (v: T) => {
    anotar((m) => { m.home.cache = "degradado-compartida"; m.home.origen = "degradado-compartido"; });
    return v;
  };
  const servirVacio = (motivo: MotivoVacio, reintentarEnMs?: number) => {
    anotar((m) => {
      m.home.cache = "vacio";
      m.home.origen = motivo === "cancelada" ? "vacio-cancelada" : motivo === "espera-agotada" ? "vacio-espera-agotada" : "vacio-pausa";
      if (motivo === "cancelada") m.home.cancelada = true;
    });
    return reintentarEnMs === undefined ? deps.vacio(motivo) : deps.vacio(motivo, { reintentarEnMs });
  };
  /** Pausado (o pausa local con Redis caído), sin UB y sin poder esperar: el vacío que la ruta convierte en 503. */
  const servirPausa = (motivo: "pausa" | "pausa-indeterminada" | "presupuesto-insuficiente", reintentarEnMs: number) => {
    pausa?.anotarCubo("pausados503");
    return servirVacio(motivo, Math.max(1, reintentarEnMs));
  };
  const servirUbPausado = (v: T) => { pausa?.anotarCubo("pausadosUB"); return servirUb(v, "ultimo-bueno", "ultimo-bueno-pausa"); };

  // La limpieza (§49-§50): UNA por solicitud, best effort, sólo estrictamente
  // antes del corte duro de Vercel; nunca publica ni toca el UB; si no puede,
  // el turno vence por TTL. Toda liberación del turno propio pasa por acá.
  const limpieza = crearLimpieza({ ahora, inicioRuta, maxDurationMs: c.MAX_DURATION_MS, liberar: () => deps.turno.liberar({ clave: K.turno, propietario }) });
  const limpiar = async (): Promise<void> => {
    const r = await limpieza();
    anotar((m) => { if (r === "omitido-ya-intentado") m.home.liberacion ??= r; else m.home.liberacion = r; });
  };

  // 4. Con el turno en la mano.
  // `senalActiva`/`plazoActivo`: los de la solicitud en línea, o los del fondo (3.b/§47).
  const componer = async (senalActiva: AbortSignal | undefined = senal, plazoActivo: number = plazo): Promise<T> => {
    // 4.0 Carrera lectura → turno: ¿alguien publicó mientras tanto?
    const [yaEsta] = await deps.leer([K.fresca]);
    if (yaEsta != null) {
      await limpiar();
      anotar((m) => { m.home.cache = "hit"; m.home.origen = "fresca-tras-turno"; });
      return yaEsta;
    }
    // 4a
    log(`[home] compone ${K.fresca} ${propietario}`);
    anotar((m) => { m.home.cache = "miss"; });
    // 4b La renovación corre al lado de la composición y se corta con ella:
    // `fin` la despierta si duerme; `await renovacion` espera la que esté en
    // vuelo. Nada de esto sobrevive a `componer`. Ninguna se INICIA con la señal
    // vencida ni en el plazo o después (estricto, §51).
    const fin = new AbortController();
    const renovacion = (async () => {
      while (!fin.signal.aborted) {
        await dormir(c.RENOVACION_MS, fin.signal);
        if (fin.signal.aborted || abortada(senalActiva) || !(ahora() < plazoActivo)) return;
        const envio = ahora();
        const r = await deps.turno.renovar({ clave: K.turno, propietario, px: c.TURNO_MS });
        const respuesta = ahora();
        if (r === "renovado") anotar((m) => { m.home.renovaciones += 1; m.home.renovacionUltima = { envioMs: envio - inicioRuta, respuestaMs: respuesta - inicioRuta }; });
        else if (r === "perdido") { anotar((m) => { m.home.turnoPerdido = true; }); return; }
        // indeterminado: se reintenta en la vuelta siguiente, no marca perdido.
      }
    })();
    const cortarRenovacion = async () => { fin.abort(); await renovacion; };
    // 4c
    let producido: { valor: T; fallo: boolean; pausada?: boolean };
    try {
      producido = await deps.producir();
    } catch (error) {
      await cortarRenovacion();
      await limpiar();
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
    // 4d Cancelada por la señal, o devuelta en el plazo o después: no es un
    // degradado de TMDB y no se inicia nada productivo (§49).
    if (abortada(senalActiva) || !(ahora() < plazoActivo)) {
      await limpiar();
      return ub != null ? (anotar((m) => { m.home.cancelada = true; }), servirUb(ub)) : servirVacio("cancelada");
    }
    // 4d' La pausa apareció durante la cola (429 propio o propagado) o alguna
    // llamada salió rechazada por ella aunque ya haya vencido: la composición
    // está mutilada. LIBERAR, nunca ENFRIAR ni PUBLICAR (§40.5). Sin UB, el 503
    // lleva lo que resta de la pausa, o 1 s si ya venció (reintentar ya).
    const pausaAlVolver = pausaLocal();
    if (pausaAlVolver > 0 || producido.pausada) {
      await limpiar();
      anotar((m) => { m.home.cancelada = true; m.home.pausaMs = pausaAlVolver; });
      return ub != null ? servirUbPausado(ub) : servirPausa("pausa", Math.max(pausaAlVolver, 1000));
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
      await limpiar();
      anotar((m) => { m.home.origen = "propia"; });
      return producido.valor;
    }
    // 4f PUBLICAR sólo se INICIA con la reserva entera antes del plazo (§47.2/§48.2).
    if (ahora() + c.RESERVA_PUBLICACION_MS > plazoActivo) {
      await limpiar();
      anotar((m) => { m.home.cancelada = true; m.home.origen = "propia-sin-publicar"; });
      return ub != null ? servirUb(ub) : producido.valor;
    }
    // Publicar, con fencing. Si perdí el turno, el script lo rechaza solo.
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

  // 3. Tomar el turno. Con pausa LOCAL vigente, un Redis que no responde no
  // habilita componer contra TMDB (§43.3): es `pausado` con el restante local.
  const tomar = async () => {
    let r = await deps.turno.tomar({ clave: K.turno, propietario, px: c.TURNO_MS });
    const local = pausaLocal();
    if (r.estado === "sin-redis" && local > 0) r = { estado: "pausado", restanteMs: local };
    anotar((m) => { m.home.turno = r.estado === "adquirido" ? (r.reconciliado ? "reconciliado" : "adquirido") : r.estado; if (r.estado === "pausado") m.home.pausaMs = r.restanteMs; });
    return r;
  };
  /** Adquirido: si cabe una composición, componer; si no, un rescate que va a morir no se empieza. */
  const componerSiCabe = async (): Promise<T> => {
    if (restanteSolicitud() < c.COMPOSICION_MAX_MS) {
      await limpiar();
      return servirVacio("espera-agotada");
    }
    return componer();
  };
  // 2b. Pausa local vigente: no se toma el turno (no hay nada que componer);
  // es `pausado` con el restante local. Sin UB, abajo rige la espera breve y
  // la ÚNICA readquisición, ya con su timeout.
  let r: Awaited<ReturnType<typeof tomar>>;
  // Si la pausa regía al entrar o nació durante las lecturas, el pedido sigue el
  // camino acotado aunque la pausa haya vencido justo ahora: un TOMAR sin tope
  // contra un Redis caído sería volver a la promesa reducida. El restante es el
  // FRESCO (las lecturas acotadas consumieron tiempo); vencido, vale 1 ms y la
  // ÚNICA readquisición (con su timeout) decide.
  if (localAlEntrar > 0 || pausaLocal() > 0) { r = { estado: "pausado", restanteMs: Math.max(1, pausaLocal()) }; anotar((m) => { m.home.turno = "pausado"; }); }
  else r = await tomar();
  if (r.estado === "sin-redis") {
    // §3.7: componer sin coordinar, servir, y no escribir nada.
    log(`[home] compone ${K.fresca} ${propietario} (sin-redis)`);
    anotar((m) => { m.home.cache = "miss"; m.home.origen = "sin-redis"; });
    const p = await deps.producir();
    return p.valor;
  }
  if (r.estado === "pausado") {
    // 3.c.1 (§42/§43): con UB, el UB ya; sin UB, un solo sueño acotado y una readquisición.
    if (ub != null) return servirUbPausado(ub);
    const restante = r.restanteMs;
    if (restante > c.ESPERA_PAUSA_MAX_MS) return servirPausa("pausa", restante);
    if (restanteSolicitud() - (restante + c.JITTER_MAX_MS + c.T_ADQ_MAX_MS) < c.COMPOSICION_MAX_MS) return servirPausa("presupuesto-insuficiente", restante);
    const dormirMs = restante + Math.min(jitter(), c.JITTER_MAX_MS);
    log(`[home] duerme ${dormirMs}ms por pausa ${K.fresca} ${propietario}`);
    const tDormir = ahora();
    await dormir(dormirMs, senal);
    const dormido = ahora() - tDormir;
    anotar((m) => { m.home.pausaEsperaMs = dormido; });
    // Vencimiento del presupuesto interno durante el sueño: el centinela 4d de hoy (§44.1/§45).
    if (abortada()) return servirVacio("cancelada");
    // La readquisición, con su propio timeout: si Redis no responde en T_ADQ_MAX
    // es indeterminada; si más tarde la promesa adquiere, se libera.
    let vencioTimeout = false;
    const timeout = new AbortController();
    const readquisicion = tomar().then((x) => { if (vencioTimeout && x.estado === "adquirido") { void deps.turno.liberar({ clave: K.turno, propietario }).catch(() => {}); } return x; });
    const r2 = await Promise.race([readquisicion, dormir(c.T_ADQ_MAX_MS, timeout.signal).then(() => { if (!timeout.signal.aborted) vencioTimeout = true; return "indeterminado" as const; })]);
    timeout.abort();   // sin temporizador vivo si Redis respondió antes
    if (r2 === "indeterminado") {
      anotar((m) => { m.home.turno = "sin-redis"; });
      return servirPausa("pausa-indeterminada", Math.max(c.RETRY_AFTER_FALLBACK_MS, restante - dormido));
    }
    if (r2.estado === "pausado") return servirPausa("pausa", r2.restanteMs);   // nunca un segundo sueño
    if (r2.estado === "sin-redis") {
      log(`[home] compone ${K.fresca} ${propietario} (sin-redis)`);
      anotar((m) => { m.home.cache = "miss"; m.home.origen = "sin-redis"; });
      return (await deps.producir()).valor;
    }
    if (r2.estado === "adquirido") return componerSiCabe();
    r = r2;   // ocupado: la espera compartida de siempre (5), que ya tiene UB/degradado en cuenta
  }
  if (r.estado === "adquirido") {
    // Etapa 3.b: con UB y fondo registrado, el UB sale ya y la fresca se
    // compone detrás de la frontera (`lib/fondo-frontera.ts`: recién cuando la
    // promesa del handler ya llegó a su llamador). `programarEnFondo` es perezoso: si devuelve
    // false no inició nada, y el camino es el de siempre (una composición, en
    // línea). Sin UB no hay nada que servir primero: como siempre.
    if (ub != null && deps.programarEnFondo) {
      const ubServido = ub;
      const iniciar = async (senalFondo?: AbortSignal, plazoEfectivo?: number) => {
        // El fondo corre en SUS contextos (los abre el adaptador): la
        // correlación con la solicitud es por clave y propietario. Con UB, un
        // productor que rechaza no propaga: `componer` libera y devuelve el UB.
        // Lo que sí llegue hasta acá se anota, se libera y se relanza: lo
        // contiene el programador, así que la tarea registrada resuelve igual.
        anotar((m) => { m.home.propietario = propietario; m.home.turno = "adquirido"; });
        const plazoFondo = plazoEfectivo ?? ahora() + c.PRESUPUESTO_REQUEST_MS;
        // §47: sin presupuesto efectivo para componer Y publicar, no se compone.
        if (plazoFondo - ahora() < c.COMPOSICION_MAX_MS + c.RESERVA_PUBLICACION_MS) {
          anotar((m) => { m.home.fondo = "no-iniciado-presupuesto"; });
          await limpiar();
          return;
        }
        try {
          await componer(senalFondo, plazoFondo);
        } catch (error) {
          anotar((m) => { m.home.errorProductor = true; });
          await limpiar();
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
    if (r.estado === "pausado") {
      // La pausa apareció mientras se esperaba: sin UB no hay nada que servir.
      anotarEspera();
      return servirPausa("pausa", r.restanteMs);
    }
    if (r.estado === "adquirido") {
      anotarEspera();
      // §46: el rescate mira el PLAZO ABSOLUTO, no el reloj local.
      // El UB pudo aparecer durante la espera: `componer` lo usa ante un degradado.
      [ub, degradado] = [u, d];
      return componerSiCabe();
    }
  }
  anotarEspera();
  return servirVacio(abortada() ? "cancelada" : "espera-agotada");
}
