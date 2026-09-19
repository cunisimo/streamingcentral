// El TURNO distribuido del Home: estados y reconciliación. Etapa 2 de
// capacidad (#17), informe docs/medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md §4.4.
//
// ============================================================================
// QUÉ DECIDE ACÁ, Y QUÉ NO
// ============================================================================
// Acá vive la traducción de "lo que devolvió Redis" (o el error de transporte)
// a un ESTADO con el que la secuencia del Home (lib/home-servir.ts) puede
// razonar. Tres clases de resultado por operación, y el error de transporte
// nunca se confunde con "ocupado" ni con "perdí":
//
//   tomar     adquirido | ocupado | sin-redis
//             `null` o excepción → se RECONCILIA con `GET turno`: si el valor es
//             mío, el SET ejecutó y la respuesta se perdió (el SDK reintenta su
//             propio SET y recibe `null` por SU turno). Sin esto, un turno
//             propio quedaría huérfano 15 s y nadie compondría.
//   renovar   renovado | perdido | indeterminado — SÓLO el 0 del script marca
//             perdido; una excepción se reintenta en la vuelta siguiente.
//   publicar  publicado | publicada-solo-fresca | rechazado | indeterminado —
//             con respuesta perdida se mira `gen`: si termina en `:<mío>`, el
//             script corrió; si no y el turno sigue siendo mío, un reintento
//             (el script es idempotente: si ya publicó, encuentra el turno
//             borrado y devuelve 0).
//   enfriar   enfriado | no-era-mio | indeterminado
//   liberar   liberado | no-era-mio | indeterminado
//
// 🔴 Un `indeterminado` NUNCA habilita una operación insegura: este módulo no
// conoce `DEL` ni `SET … XX`. Lo peor que pasa es un turno que vence solo.
// Las seis primitivas son deps inyectadas (lib/cache.ts las enchufa sobre el
// cliente real; lib/turno-memoria.ts las emula sin Redis), y por eso esto se
// prueba con `node --test` sin arrastrar Upstash (lib/turno.test.ts).

/** Las SEIS primitivas del turno más TOMAR (3.c.1). `eval*` son los scripts Lua del informe §4.3 y de lib/pausa-lua.ts. */
export interface OpsTurno {
  /** `SET clave valor NX PX ms` → `"OK"` o `null`. Puede lanzar. Camino de la Etapa 2 (con la pausa apagada). */
  setNx(clave: string, valor: string, px: number): Promise<"OK" | null>;
  /**
   * TOMAR (3.c.1): KEYS = [turno, pausa]; ARGV = [propietario, px]. Comprueba la
   * pausa compartida y hace el SET NX en UNA operación atómica (§40.5). La
   * respuesta viene tal cual del transporte: `crearTurno` la interpreta y
   * cualquier forma inesperada es `sin-redis`, nunca "adquirido".
   */
  evalTomar(claves: [string, string], args: [string, string]): Promise<unknown>;
  get(clave: string): Promise<string | null>;
  /** RENOVAR: `1` renovado, `0` no era mío. */
  evalRenovar(clave: string, propietario: string, px: number): Promise<number>;
  /** PUBLICAR: KEYS = [turno, fresca, ub, gen]; ARGV = [propietario, fresca_json, ttl_fresca_s, ub_json, ttl_ub_s, dia]. */
  evalPublicar(claves: [string, string, string, string], args: [string, string, string, string, string, string]): Promise<number>;
  /** ENFRIAR: KEYS = [turno, degradado]; ARGV = [propietario, degradado_json, ms]. */
  evalEnfriar(claves: [string, string], args: [string, string, string]): Promise<number>;
  /** LIBERAR: `1` liberado, `0` no era mío. */
  evalLiberar(clave: string, propietario: string): Promise<number>;
}

/**
 * Las primitivas de la PAUSA compartida (3.c.1, lib/pausa-lua.ts). Devuelven
 * `unknown` a propósito: lo que vuelve del transporte se valida en
 * lib/tmdb-pausa.ts, y cualquier forma que no sea la esperada es
 * `indeterminado`. (Una señal abortada no llega como valor: con `signal` como
 * función, el SDK 1.38.0 lanza y no reintenta; el `200` sintético `"Aborted"`
 * sólo existe con una señal estática, que lib/cache.ts no usa.)
 */
export interface OpsPausa {
  /** PAUSAR: KEYS = [pausa, ev, proc, eventos, cubos]; ARGV = [id, ms, contador, familia, retryAfterMs]. Puede lanzar. */
  evalPausar(claves: [string, string, string, string, string], args: [string, string, string, string, string]): Promise<unknown>;
  /** `PTTL pausa`: > 0 vigente por esos ms; -2 sin pausa. La LECTURA del nivel 2 (con su timeout propio). */
  pttl(clave: string): Promise<unknown>;
  /** CUBO: KEYS = [cubos]; ARGV = [campo] → minuto de Redis. */
  evalCubo(claves: [string], args: [string]): Promise<unknown>;
  /** SALUD: KEYS = [pausa, cubos] → [pttl, 429, pausas, ya-mayor, ya-aplicada, pausaNoLeida, pausadosUB, pausados503]. */
  evalSalud(claves: [string, string], args: []): Promise<unknown>;
}

export type ResultadoTomar =
  | { estado: "adquirido"; reconciliado: boolean }
  | { estado: "ocupado"; valor: string }
  | { estado: "sin-redis" }
  /** 3.c.1: la pausa compartida está vigente; el script no adquirió. `restanteMs` es el PTTL que devolvió Redis. */
  | { estado: "pausado"; restanteMs: number }
  /**
   * 3.c.1 (auditoría sobre 1403ae4): el PLAZO de la operación venció antes de
   * saber. Un TOMAR pudo haberse aplicado en Redis sin que llegara la respuesta
   * y ya no cabe reconciliarlo: NO se limpia después —el turno, si quedó,
   * vence por su TTL (`px`)—. Sólo con `senal` en `tomar`.
   */
  | { estado: "indeterminado" };
export type ResultadoRenovar = "renovado" | "perdido" | "indeterminado";
export type ResultadoPublicar = "publicado" | "publicada-solo-fresca" | "rechazado" | "indeterminado";
export type ResultadoEnfriar = "enfriado" | "no-era-mio" | "indeterminado";
export type ResultadoLiberar = "liberado" | "no-era-mio" | "indeterminado";

export interface ClavesPublicar { turno: string; fresca: string; ub: string; gen: string }

/**
 * `pausa`: la clave de la pausa compartida (3.c.1). Con ella, `tomar` usa el
 * script TOMAR (pausa + SET NX en una operación); sin ella —el kill switch
 * `TMDB_PAUSA_429=0`— el SET NX de la Etapa 2, sin tocar la pausa.
 */
export function crearTurno(ops: OpsTurno, cfg: { pausa?: { clave: string } } = {}) {
  /** `GET turno`, con la excepción convertida en `undefined` (= no se pudo saber). */
  const leer = async (clave: string): Promise<string | null | undefined> => {
    try { return await ops.get(clave); } catch { return undefined; }
  };

  /**
   * Un intento de adquisición. Con pausa: el script; su respuesta se VALIDA
   * (`['adquirido']`, `['ocupado', valor]`, `['pausado', entero > 0]`) y
   * cualquier otra forma —`null`, un número, una cadena suelta— se trata como
   * fallo de transporte: nunca como adquirido ni como pausado. (Una señal
   * abortada LANZA en el cliente acotado; no vuelve como valor.) Devuelve `undefined` para "no se pudo saber" (excepción o forma
   * inesperada), y entonces se reconcilia con GET como en la Etapa 2.
   */
  const intentar = async (p: { clave: string; propietario: string; px: number }): Promise<ResultadoTomar | "no-adquirido" | undefined> => {
    if (!cfg.pausa) {
      try { return (await ops.setNx(p.clave, p.propietario, p.px)) === "OK" ? { estado: "adquirido", reconciliado: false } : "no-adquirido"; } catch { return undefined; }
    }
    let r: unknown;
    try { r = await ops.evalTomar([p.clave, cfg.pausa.clave], [p.propietario, String(p.px)]); } catch { return undefined; }
    if (!Array.isArray(r)) return undefined;
    if (r.length === 1 && r[0] === "adquirido") return { estado: "adquirido", reconciliado: false };
    if (r.length === 2 && r[0] === "pausado" && Number.isInteger(r[1]) && (r[1] as number) > 0) return { estado: "pausado", restanteMs: r[1] as number };
    if (r.length === 2 && r[0] === "ocupado" && typeof r[1] === "string") {
      // El script ejecutó, la respuesta se perdió y el SDK reintentó: el turno ya es mío.
      return r[1] === p.propietario ? { estado: "adquirido", reconciliado: true } : { estado: "ocupado", valor: r[1] };
    }
    return undefined;
  };

  /**
   * `opts.senal` (3.c.1, auditoría sobre 1403ae4): el plazo compartido de TODA
   * la operación lógica (intento, reconciliación, segundo intento). Las
   * primitivas ya lo respetan por su cuenta (el cliente acotado lo lee al
   * empezar cada petición); acá decide: una primitiva que falló con el plazo
   * vencido es `indeterminado` —no se sabe si aplicó— y no se emite ningún
   * comando más. Sin señal, la secuencia de siempre.
   */
  async function tomar(p: { clave: string; propietario: string; px: number }, opts: { senal?: AbortSignal } = {}): Promise<ResultadoTomar> {
    const vencido = () => !!opts.senal?.aborted;
    if (vencido()) return { estado: "indeterminado" };
    const primero = await intentar(p);
    if (primero !== undefined && primero !== "no-adquirido") return primero;
    if (vencido()) return { estado: "indeterminado" };
    const fallo = primero === undefined;
    // `null` o excepción: reconciliar. El GET cuesta un comando y evita el
    // turno huérfano; en el camino frío es barato.
    const valor = await leer(p.clave);
    if (valor === undefined) return vencido() ? { estado: "indeterminado" } : { estado: "sin-redis" };
    if (valor === p.propietario) return { estado: "adquirido", reconciliado: true };
    if (valor !== null) return { estado: "ocupado", valor };
    // Nadie lo tiene y el SET había fallado: el comando no ejecutó. Un segundo
    // intento, acotado a uno; si también falla, Redis no está.
    if (!fallo) return { estado: "ocupado", valor: "" };
    if (vencido()) return { estado: "indeterminado" };
    const segundo = await intentar(p);
    if (segundo !== undefined && segundo !== "no-adquirido") return segundo;
    if (vencido()) return { estado: "indeterminado" };
    if (segundo === undefined) return { estado: "sin-redis" };
    const otra = await leer(p.clave);
    if (otra === p.propietario) return { estado: "adquirido", reconciliado: true };
    if (typeof otra === "string") return { estado: "ocupado", valor: otra };
    return vencido() ? { estado: "indeterminado" } : { estado: "sin-redis" };
  }

  async function renovar(p: { clave: string; propietario: string; px: number }): Promise<ResultadoRenovar> {
    try { return (await ops.evalRenovar(p.clave, p.propietario, p.px)) === 1 ? "renovado" : "perdido"; } catch { return "indeterminado"; }
  }

  const deScript = (r: number): ResultadoPublicar => (r === 1 ? "publicado" : r === -1 ? "publicada-solo-fresca" : "rechazado");

  async function publicar(p: {
    claves: ClavesPublicar; propietario: string; payload: string; ttlFresca: number; ttlUb: number; dia: string;
  }): Promise<ResultadoPublicar> {
    const claves: [string, string, string, string] = [p.claves.turno, p.claves.fresca, p.claves.ub, p.claves.gen];
    const args: [string, string, string, string, string, string] =
      [p.propietario, p.payload, String(p.ttlFresca), p.payload, String(p.ttlUb), p.dia];
    try { return deScript(await ops.evalPublicar(claves, args)); } catch { /* reconciliar */ }
    const gen = await leer(p.claves.gen);
    if (gen === undefined) return "indeterminado";
    if (typeof gen === "string" && gen.endsWith(`:${p.propietario}`)) return "publicado";
    const turno = await leer(p.claves.turno);
    if (turno === undefined) return "indeterminado";
    if (turno !== p.propietario) return "rechazado";
    // El turno sigue siendo mío: el script no corrió. Un reintento, idempotente.
    try { return deScript(await ops.evalPublicar(claves, args)); } catch { return "indeterminado"; }
  }

  async function enfriar(p: { claves: { turno: string; degradado: string }; propietario: string; payload: string; px: number }): Promise<ResultadoEnfriar> {
    try {
      return (await ops.evalEnfriar([p.claves.turno, p.claves.degradado], [p.propietario, p.payload, String(p.px)])) === 1 ? "enfriado" : "no-era-mio";
    } catch { return "indeterminado"; }
  }

  async function liberar(p: { clave: string; propietario: string }): Promise<ResultadoLiberar> {
    try { return (await ops.evalLiberar(p.clave, p.propietario)) === 1 ? "liberado" : "no-era-mio"; } catch { return "indeterminado"; }
  }

  return { tomar, renovar, publicar, enfriar, liberar };
}

export type Turno = ReturnType<typeof crearTurno>;
