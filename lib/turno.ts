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

/** Las SEIS primitivas, y ninguna más. `eval*` son los scripts Lua del informe §4.3. */
export interface OpsTurno {
  /** `SET clave valor NX PX ms` → `"OK"` o `null`. Puede lanzar. */
  setNx(clave: string, valor: string, px: number): Promise<"OK" | null>;
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

export type ResultadoTomar =
  | { estado: "adquirido"; reconciliado: boolean }
  | { estado: "ocupado"; valor: string }
  | { estado: "sin-redis" };
export type ResultadoRenovar = "renovado" | "perdido" | "indeterminado";
export type ResultadoPublicar = "publicado" | "publicada-solo-fresca" | "rechazado" | "indeterminado";
export type ResultadoEnfriar = "enfriado" | "no-era-mio" | "indeterminado";
export type ResultadoLiberar = "liberado" | "no-era-mio" | "indeterminado";

export interface ClavesPublicar { turno: string; fresca: string; ub: string; gen: string }

export function crearTurno(ops: OpsTurno) {
  /** `GET turno`, con la excepción convertida en `undefined` (= no se pudo saber). */
  const leer = async (clave: string): Promise<string | null | undefined> => {
    try { return await ops.get(clave); } catch { return undefined; }
  };

  async function tomar(p: { clave: string; propietario: string; px: number }): Promise<ResultadoTomar> {
    let fallo = false;
    try {
      if ((await ops.setNx(p.clave, p.propietario, p.px)) === "OK") return { estado: "adquirido", reconciliado: false };
    } catch { fallo = true; }
    // `null` o excepción: reconciliar. El GET cuesta un comando y evita el
    // turno huérfano; en el camino frío es barato.
    const valor = await leer(p.clave);
    if (valor === undefined) return { estado: "sin-redis" };
    if (valor === p.propietario) return { estado: "adquirido", reconciliado: true };
    if (valor !== null) return { estado: "ocupado", valor };
    // Nadie lo tiene y el SET había fallado: el comando no ejecutó. Un segundo
    // intento, acotado a uno; si también falla, Redis no está.
    if (!fallo) return { estado: "ocupado", valor: "" };
    try {
      if ((await ops.setNx(p.clave, p.propietario, p.px)) === "OK") return { estado: "adquirido", reconciliado: false };
      const otra = await leer(p.clave);
      if (otra === p.propietario) return { estado: "adquirido", reconciliado: true };
      if (typeof otra === "string") return { estado: "ocupado", valor: otra };
      return { estado: "sin-redis" };
    } catch { return { estado: "sin-redis" }; }
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
