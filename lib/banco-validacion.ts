// Validación del banco aislado: escenario por escenario, lo que la app dice
// tiene que ser lo que los dobles recibieron. Módulo PURO, sin imports, para
// poder probarlo con `node --test`; `scripts/banco/correr.mjs` lo ejecuta.
//
// ============================================================================
// POR QUÉ EXISTE
// ============================================================================
// El primer corredor controlaba un solo escenario y no abortaba ante una
// diferencia. En la corrida publicada en ceeed75, una solicitud que el cliente
// abortó por timeout siguió viva en Next y terminó dentro del escenario
// siguiente: un escenario quedó sin líneas y con actividad en los dobles, el
// siguiente con dos líneas para una respuesta, y el informe afirmó
// "coincidencia en todos" sin haberla sumado. Esto es lo que lo impide:
//
//   - cada línea `[home]` terminal lleva su CLAVE y se atribuye al escenario
//     por el sufijo de clave que sale de la query (plataformas ordenadas y
//     toggles, como arma `claveHome`);
//   - cada solicitud deja una línea `[home] pedido <clave>` al entrar: pedidos
//     que no terminaron = solicitudes ACTIVAS en el servidor, y un escenario
//     con activas no puede dar paso al siguiente sin reiniciar Next;
//   - un timeout del cliente NUNCA es una finalización: la respuesta queda con
//     `estado: null`, no cuenta como completada, y no se inventan métricas;
//   - las sumas de las líneas terminales se comparan con los deltas de los
//     dobles en las cuatro unidades; una sola diferencia invalida el escenario,
//     y un escenario inválido invalida la corrida.
//
// Los escenarios que PUEDEN quedar incompletos (una ventana limitada con Redis
// caído) lo declaran con `permiteIncompleto`: si no completan, quedan como
// "no completó en más de X ms", sin igualdades —que no pueden cumplir— y sin
// duración ni respuesta final inventadas.

import { canonizarProviders, claveDeTipos, tiposDesdeParam } from "./canonizar-home.ts";

export interface Respuesta { estado: number | null; ms: number; error?: string }

export interface LineaTerminal {
  clave: string | null;
  msTotal: number | null;
  cache: string | null;
  composiciones: number | null;
  esperas: number | null;
  tmdb: number;
  supabase: number;
  redisIntentos: number;
  redisComandos: number;
  // Etapa 2 (#17): el segmento del turno de la línea. `null` en una línea de la Etapa 1.
  turno: string | null;
  origen: string | null;
  publicacion: string | null;
  renovaciones: number | null;
  propietario: string | null;
  turnoPerdido: boolean;
}

/** Una línea `[home] compone <clave> <propietario>[ (sin-redis)]`: composición INICIADA. */
export interface Compone { clave: string; propietario: string; sinRedis: boolean }
/** Lo que el doble de Redis registró sobre el turno (SETNX, RENOVAR, PUBLICAR, ENFRIAR, LIBERAR, EXPIRA…). */
export interface RegistroTurno { op: string; clave: string; propietario: string; resultado: unknown }

export interface DeltasDobles { tmdb: number; supabase: number; redisHttp: number; redisComandos: number }

export interface EscenarioObservado {
  id: string;
  query: string;
  veces: number;
  /** El sufijo de clave que identifica a este escenario (ver `sufijoDeClave`). */
  claveSufijo: string;
  respuestas: Respuesta[];
  /** Claves de las líneas `[home] pedido <clave>` vistas en la ventana. */
  pedidos: string[];
  terminales: LineaTerminal[];
  dobles: DeltasDobles;
  /** Puede terminar sin completar (p. ej. Redis caído en una ventana limitada). */
  permiteIncompleto?: boolean;
  ventanaMs?: number;
  /** Lo que el escenario AFIRMA sobre la app (Etapas 1 y 2): se comprueba y, si no cierra, invalida. */
  esperado?: {
    composiciones?: number; esperas?: number; cacheDeTodas?: string; tmdb?: number; supabase?: number;
    /** Etapa 2: cota superior de composiciones (ráfagas con enfriamiento). */
    composicionesMax?: number;
    /** Etapa 2: cuántas líneas terminales por origen, exacto. */
    origenes?: Record<string, number>;
    /** Etapa 2: PUBLICAR con resultado 1 (o -1 si `publicacionesParciales`) en el registro del doble. */
    publicaciones?: number;
    publicacionesParciales?: number;
    /** Etapa 2: SET NX que devolvieron OK en el doble. */
    setNxOk?: number;
    enfriadas?: number;
    /** Etapa 2: cuántas líneas por estado del turno (adquirido/reconciliado/ocupado/sin-redis), exacto. */
    turnos?: Record<string, number>;
    /** Etapa 2: al menos una línea con esta cantidad de renovaciones o más. */
    renovacionesMin?: number;
  };
  /** Etapa 2: las líneas `compone` de la ventana. */
  compone?: Compone[];
  /** Etapa 2: el registro del turno en el doble (delta de la ventana). */
  registroTurno?: RegistroTurno[];
  /**
   * Etapa 2 (E-muere): solicitudes cuyo proceso fue ASESINADO por el corredor.
   * No completan ni siguen activas: su composición quedó interrumpida. Con
   * ellas declaradas, el escenario puede comprobar lo que AFIRMA (origenes,
   * publicaciones, sin turno) pero NO las igualdades con los dobles: el
   * proceso muerto consumió TMDB y Redis sin dejar su línea terminal.
   */
  interrumpidas?: number;
}

export interface Validacion {
  id: string;
  estado: "completo" | "incompleto" | "completo-con-interrupciones";
  valida: boolean;
  problemas: string[];
  /** Pedidos vistos menos líneas terminales: solicitudes que siguen corriendo en Next. */
  activasEnServidor: number;
  /** Sólo `true` cuando las cuatro igualdades se comprobaron y cerraron. */
  igualdadesVerificadas: boolean;
  resumen?: string;
  sumas?: DeltasDobles;
  /** Sumas de la app que no tienen contraparte en los dobles: composiciones y esperas compartidas. */
  home?: { composiciones: number; esperas: number; caches: Record<string, number> };
  /** Etapa 2: la composición iniciada contra el turno del doble. */
  turno?: { compone: number; sinTurno: number; sinRedis: number; setNxOk: number; publicaciones: number; enfriadas: number; liberadas: number; origenes: Record<string, number> };
}

/**
 * El sufijo `:<plataformas>:<toggles>` con el que termina la clave del Home para
 * una query, con la MISMA canonización que producción (lib/canonizar-home.ts,
 * Etapa 1): `N,,d,zzz,M` → `d,m,n`; `t=accion:movie` → vacío. Usar la función
 * de producción acá es a propósito: lo que el banco comprueba de forma
 * independiente son los contadores de los dobles, no la forma de la clave.
 */
export function sufijoDeClave(query: string): string {
  const sp = new URLSearchParams(query);
  return `:${canonizarProviders(sp.get("providers")).join(",")}:${claveDeTipos(tiposDesdeParam(sp.getAll("t")))}`;
}

export const esLineaPedido = (l: string): boolean => /^\[home\] pedido /.test(l);
export const esLineaTerminal = (l: string): boolean => /^\[home\] \d+ms total/.test(l);
export const claveDePedido = (l: string): string => l.replace(/^\[home\] pedido /, "").trim();
export const esLineaCompone = (l: string): boolean => /^\[home\] compone /.test(l);
export function propietarioDeCompone(l: string): Compone {
  const m = l.match(/^\[home\] compone (\S+) (\S+)( \(sin-redis\))?\s*$/);
  if (!m) throw new Error(`no es una línea compone: ${l}`);
  return { clave: m[1], propietario: m[2], sinRedis: !!m[3] };
}

export function parsearLineaHome(l: string): LineaTerminal {
  const n = (re: RegExp) => { const m = l.match(re); return m ? Number(m[1]) : null; };
  const s = (re: RegExp) => { const m = l.match(re); return m ? m[1] : null; };
  return {
    clave: s(/\| clave (\S+)\s*$/),
    msTotal: n(/^\[home\] (\d+)ms total/),
    cache: s(/cache (HIT|MISS|COMPARTIDA|ULTIMO-BUENO|ESPERADA|VACIO|DEGRADADO-COMPARTIDA|\?)/),
    composiciones: n(/(\d+) composici/),
    esperas: n(/(\d+) esperas? compartida/),
    tmdb: n(/tmdb (\d+) llamadas/) ?? 0,
    supabase: n(/supabase (\d+) consultas/) ?? 0,
    redisIntentos: n(/(\d+) intentos http/) ?? 0,
    redisComandos: n(/(\d+) comandos/) ?? 0,
    turno: s(/\| turno (\S+) \|/),
    origen: s(/\| origen (\S+) \|/),
    publicacion: s(/\| publicacion (\S+) \|/),
    renovaciones: n(/\| renovaciones (\d+) \|/),
    propietario: s(/\| propietario (\S+)/),
    turnoPerdido: /\| TURNO PERDIDO/.test(l),
  };
}

export function validarEscenario(e: EscenarioObservado): Validacion {
  const problemas: string[] = [];
  const completadas = e.respuestas.filter((r) => r.estado !== null).length;
  const abortadas = e.respuestas.length - completadas;
  const activas = e.pedidos.length - e.terminales.length;

  // Atribución: cada pedido y cada línea terminal tiene que ser de ESTE escenario.
  for (const p of e.pedidos) {
    if (!p.endsWith(e.claveSufijo)) problemas.push(`pedido con clave de otro escenario: ${p} (se esperaba …${e.claveSufijo})`);
  }
  for (const t of e.terminales) {
    if (t.clave === null) problemas.push("línea terminal sin clave: no se puede atribuir");
    else if (!t.clave.endsWith(e.claveSufijo)) problemas.push(`línea terminal con clave de otro escenario: ${t.clave} (se esperaba …${e.claveSufijo})`);
  }
  // Cantidades: pedidos = solicitudes hechas; líneas terminales = respuestas completadas.
  if (e.pedidos.length !== e.respuestas.length) {
    problemas.push(`pedidos vistos en el servidor: ${e.pedidos.length}, solicitudes hechas: ${e.respuestas.length} — entró trabajo ajeno o faltan pedidos`);
  }
  if (e.terminales.length !== completadas) {
    problemas.push(`${e.terminales.length} línea(s) terminal(es) para ${completadas} respuesta(s) completada(s)`
      + (abortadas && e.terminales.length > completadas ? " — el servidor terminó una solicitud que el cliente abortó: no es ni completo ni incompleto" : ""));
  }

  const sumas: DeltasDobles = {
    tmdb: e.terminales.reduce((a, t) => a + t.tmdb, 0),
    supabase: e.terminales.reduce((a, t) => a + t.supabase, 0),
    redisHttp: e.terminales.reduce((a, t) => a + t.redisIntentos, 0),
    redisComandos: e.terminales.reduce((a, t) => a + t.redisComandos, 0),
  };

  const interrumpidas = e.interrumpidas ?? 0;
  const estado: Validacion["estado"] = completadas === e.veces && activas === 0
    ? "completo"
    : interrumpidas > 0 && completadas + interrumpidas === e.veces && activas === interrumpidas
      ? "completo-con-interrupciones"
      : "incompleto";
  let igualdadesVerificadas = false;
  const home = {
    composiciones: e.terminales.reduce((a, t) => a + (t.composiciones ?? 0), 0),
    esperas: e.terminales.reduce((a, t) => a + (t.esperas ?? 0), 0),
    caches: e.terminales.reduce<Record<string, number>>((a, t) => { const k = t.cache ?? "?"; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  };
  // Etapa 2: composiciones iniciadas contra el turno del doble. Una línea
  // `compone` cuyo propietario no obtuvo SET NX = OK ni figura como reconciliado
  // en su línea terminal es una composición SIN TURNO: inválida siempre, salvo
  // que la propia línea diga `(sin-redis)` (Redis caído, a propósito).
  const reg = e.registroTurno ?? [];
  const compone = e.compone ?? [];
  const conSetNx = new Set(reg.filter((r) => r.op === "SETNX" && r.resultado === "OK").map((r) => r.propietario));
  const reconciliados = new Set(e.terminales.filter((t) => t.turno === "reconciliado").map((t) => t.propietario));
  const sinTurno = compone.filter((c) => !c.sinRedis && !conSetNx.has(c.propietario) && !reconciliados.has(c.propietario));
  for (const c of sinTurno) problemas.push(`composición sin turno: ${c.propietario} compuso ${c.clave} sin SET NX = OK ni reconciliación`);
  const turno = {
    compone: compone.length,
    sinTurno: sinTurno.length,
    sinRedis: compone.filter((c) => c.sinRedis).length,
    setNxOk: reg.filter((r) => r.op === "SETNX" && r.resultado === "OK").length,
    publicaciones: reg.filter((r) => r.op === "PUBLICAR" && r.resultado === 1).length,
    enfriadas: reg.filter((r) => r.op === "ENFRIAR" && r.resultado === 1).length,
    liberadas: reg.filter((r) => r.op === "LIBERAR" && r.resultado === 1).length,
    origenes: e.terminales.reduce<Record<string, number>>((a, t) => { if (t.origen) a[t.origen] = (a[t.origen] ?? 0) + 1; return a; }, {}),
  };

  if ((estado === "completo" || estado === "completo-con-interrupciones") && e.esperado) {
    const x = e.esperado;
    if (x.composicionesMax !== undefined && home.composiciones > x.composicionesMax) problemas.push(`composiciones: se esperaban a lo sumo ${x.composicionesMax} y hubo ${home.composiciones}`);
    if (x.origenes !== undefined) {
      const claves = new Set([...Object.keys(x.origenes), ...Object.keys(turno.origenes)]);
      for (const o of claves) if ((x.origenes[o] ?? 0) !== (turno.origenes[o] ?? 0)) problemas.push(`origenes: ${o} se esperaba ${x.origenes[o] ?? 0} y hubo ${turno.origenes[o] ?? 0}`);
    }
    if (x.publicaciones !== undefined && turno.publicaciones !== x.publicaciones) problemas.push(`publicaciones (PUBLICAR = 1 en el doble): se esperaban ${x.publicaciones} y hubo ${turno.publicaciones}`);
    if (x.publicacionesParciales !== undefined) {
      const p = reg.filter((r) => r.op === "PUBLICAR" && r.resultado === -1).length;
      if (p !== x.publicacionesParciales) problemas.push(`publicaciones parciales (PUBLICAR = -1): se esperaban ${x.publicacionesParciales} y hubo ${p}`);
    }
    if (x.setNxOk !== undefined && turno.setNxOk !== x.setNxOk) problemas.push(`SET NX = OK: se esperaban ${x.setNxOk} y hubo ${turno.setNxOk}`);
    if (x.enfriadas !== undefined && turno.enfriadas !== x.enfriadas) problemas.push(`ENFRIAR = 1: se esperaban ${x.enfriadas} y hubo ${turno.enfriadas}`);
    if (x.turnos !== undefined) {
      const vistos = e.terminales.reduce<Record<string, number>>((a, t) => { if (t.turno) a[t.turno] = (a[t.turno] ?? 0) + 1; return a; }, {});
      for (const k of new Set([...Object.keys(x.turnos), ...Object.keys(vistos)])) if ((x.turnos[k] ?? 0) !== (vistos[k] ?? 0)) problemas.push(`turnos: ${k} se esperaba ${x.turnos[k] ?? 0} y hubo ${vistos[k] ?? 0}`);
    }
    if (x.renovacionesMin !== undefined && !e.terminales.some((t) => (t.renovaciones ?? 0) >= x.renovacionesMin!)) problemas.push(`renovaciones: ninguna línea llegó a ${x.renovacionesMin}`);
    if (x.composiciones !== undefined && home.composiciones !== x.composiciones) problemas.push(`composiciones: se esperaban ${x.composiciones} y hubo ${home.composiciones}`);
    if (x.esperas !== undefined && home.esperas !== x.esperas) problemas.push(`esperas compartidas: se esperaban ${x.esperas} y hubo ${home.esperas}`);
    if (x.cacheDeTodas !== undefined && (Object.keys(home.caches).length !== 1 || home.caches[x.cacheDeTodas] !== e.terminales.length)) problemas.push(`cache: se esperaba ${x.cacheDeTodas} en todas y hubo ${JSON.stringify(home.caches)}`);
    if (x.tmdb !== undefined && sumas.tmdb !== x.tmdb) problemas.push(`tmdb: se esperaban ${x.tmdb} llamadas y hubo ${sumas.tmdb}`);
    if (x.supabase !== undefined && sumas.supabase !== x.supabase) problemas.push(`supabase: se esperaban ${x.supabase} consultas y hubo ${sumas.supabase}`);
  }

  if (estado === "completo") {
    const comparar = (nombre: string, app: number, doble: number) => {
      if (app !== doble) problemas.push(`${nombre}: la app dice ${app} y el doble recibió ${doble}`);
    };
    comparar("tmdb (llamadas)", sumas.tmdb, e.dobles.tmdb);
    comparar("supabase (consultas)", sumas.supabase, e.dobles.supabase);
    comparar("redis intentos http", sumas.redisHttp, e.dobles.redisHttp);
    comparar("redis comandos", sumas.redisComandos, e.dobles.redisComandos);
    igualdadesVerificadas = problemas.length === 0;
  } else if (estado === "completo-con-interrupciones") {
    // Las igualdades con los dobles no son exigibles: el proceso asesinado
    // consumió sin dejar su línea. Lo afirmado (arriba) sí se comprobó.
    igualdadesVerificadas = false;
  } else if (!e.permiteIncompleto) {
    problemas.push(`incompleto sin permiso: ${completadas}/${e.veces} completadas, ${activas} solicitud(es) activa(s) en el servidor`);
  }

  const resumen = estado === "completo"
    ? `${completadas}/${e.veces} completadas; igualdades ${igualdadesVerificadas ? "verificadas" : "NO cierran"}`
    : estado === "completo-con-interrupciones"
      ? `${completadas}/${e.veces} completadas y ${interrumpidas} interrumpida(s) por el corredor; afirmaciones comprobadas, igualdades con los dobles NO exigibles`
      : `no completó en más de ${e.ventanaMs ?? Math.max(...e.respuestas.map((r) => r.ms), 0)} ms: ${completadas}/${e.veces} completadas, ${activas} activa(s) en el servidor; actividad observada en los dobles sin igualdad exigible`;

  return { id: e.id, estado, valida: problemas.length === 0, problemas, activasEnServidor: activas, igualdadesVerificadas, resumen, sumas, home, turno };
}

export function validarCorrida(vs: Validacion[]): { valida: boolean; invalidos: string[]; incompletos: string[] } {
  return {
    valida: vs.every((v) => v.valida),
    invalidos: vs.filter((v) => !v.valida).map((v) => v.id),
    incompletos: vs.filter((v) => v.estado === "incompleto").map((v) => v.id),
  };
}
