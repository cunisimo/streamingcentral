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

export interface Respuesta { estado: number | null; ms: number; error?: string }

export interface LineaTerminal {
  clave: string | null;
  msTotal: number | null;
  cache: string | null;
  composiciones: number | null;
  tmdb: number;
  supabase: number;
  redisIntentos: number;
  redisComandos: number;
}

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
}

export interface Validacion {
  id: string;
  estado: "completo" | "incompleto";
  valida: boolean;
  problemas: string[];
  /** Pedidos vistos menos líneas terminales: solicitudes que siguen corriendo en Next. */
  activasEnServidor: number;
  /** Sólo `true` cuando las cuatro igualdades se comprobaron y cerraron. */
  igualdadesVerificadas: boolean;
  resumen?: string;
  sumas?: DeltasDobles;
}

/**
 * El sufijo `:<plataformas ordenadas>:<toggles>` con el que termina la clave
 * del Home para una query, tal como la arma `claveHome` (lib/claves.ts):
 * plataformas deduplicadas y ordenadas, toggles `riel:tipo` unidos por coma.
 */
export function sufijoDeClave(query: string): string {
  const sp = new URLSearchParams(query);
  const prov = [...new Set((sp.get("providers") ?? "").split(",").filter(Boolean))].sort();
  const t = (sp.get("t") ?? "").split(",").filter(Boolean).sort().join(",");
  return `:${prov.join(",")}:${t}`;
}

export const esLineaPedido = (l: string): boolean => /^\[home\] pedido /.test(l);
export const esLineaTerminal = (l: string): boolean => /^\[home\] \d+ms total/.test(l);
export const claveDePedido = (l: string): string => l.replace(/^\[home\] pedido /, "").trim();

export function parsearLineaHome(l: string): LineaTerminal {
  const n = (re: RegExp) => { const m = l.match(re); return m ? Number(m[1]) : null; };
  const s = (re: RegExp) => { const m = l.match(re); return m ? m[1] : null; };
  return {
    clave: s(/\| clave (\S+)\s*$/),
    msTotal: n(/^\[home\] (\d+)ms total/),
    cache: s(/cache (HIT|MISS|\?)/),
    composiciones: n(/(\d+) composici/),
    tmdb: n(/tmdb (\d+) llamadas/) ?? 0,
    supabase: n(/supabase (\d+) consultas/) ?? 0,
    redisIntentos: n(/(\d+) intentos http/) ?? 0,
    redisComandos: n(/(\d+) comandos/) ?? 0,
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

  const estado: Validacion["estado"] = completadas === e.veces && activas === 0 ? "completo" : "incompleto";
  let igualdadesVerificadas = false;

  if (estado === "completo") {
    const comparar = (nombre: string, app: number, doble: number) => {
      if (app !== doble) problemas.push(`${nombre}: la app dice ${app} y el doble recibió ${doble}`);
    };
    comparar("tmdb (llamadas)", sumas.tmdb, e.dobles.tmdb);
    comparar("supabase (consultas)", sumas.supabase, e.dobles.supabase);
    comparar("redis intentos http", sumas.redisHttp, e.dobles.redisHttp);
    comparar("redis comandos", sumas.redisComandos, e.dobles.redisComandos);
    igualdadesVerificadas = problemas.length === 0;
  } else if (!e.permiteIncompleto) {
    problemas.push(`incompleto sin permiso: ${completadas}/${e.veces} completadas, ${activas} solicitud(es) activa(s) en el servidor`);
  }

  const resumen = estado === "completo"
    ? `${completadas}/${e.veces} completadas; igualdades ${igualdadesVerificadas ? "verificadas" : "NO cierran"}`
    : `no completó en más de ${e.ventanaMs ?? Math.max(...e.respuestas.map((r) => r.ms), 0)} ms: ${completadas}/${e.veces} completadas, ${activas} activa(s) en el servidor; actividad observada en los dobles sin igualdad exigible`;

  return { id: e.id, estado, valida: problemas.length === 0, problemas, activasEnServidor: activas, igualdadesVerificadas, resumen, sumas };
}

export function validarCorrida(vs: Validacion[]): { valida: boolean; invalidos: string[]; incompletos: string[] } {
  return {
    valida: vs.every((v) => v.valida),
    invalidos: vs.filter((v) => !v.valida).map((v) => v.id),
    incompletos: vs.filter((v) => v.estado === "incompleto").map((v) => v.id),
  };
}
