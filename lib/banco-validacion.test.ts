// La VALIDACIÓN del banco aislado: lo que la app dice tiene que ser lo que los
// dobles recibieron, escenario por escenario, y una corrida con una sola
// diferencia NO es una línea base.
//
// ============================================================================
// EL DEFECTO QUE ESTE ARCHIVO REPRODUCE (auditoría de Codex de ceeed75)
// ============================================================================
// El primer corredor sólo controlaba el escenario C0 —y ni siquiera abortaba:
// imprimía un mensaje—. En F5 (Redis caído) el cliente agotó su timeout de
// 180 s; abortar el `fetch` del corredor NO cancela el handler de Next, así que
// la solicitud siguió viva. El corredor arrancó F5r, `sanos()` rehabilitó Redis,
// y la solicitud tardía de F5 terminó DENTRO de la ventana de F5r: F5 quedó con
// cero líneas `[home]` y actividad en los dobles; F5r con dos líneas para una
// respuesta, y sumas que no coincidían con los dobles. El informe afirmó
// "coincidencia en todos los escenarios" sin haberla verificado.
//
// Regla (docs/MANTENIMIENTO.md 8.b): si el instrumento y el control no dan lo
// mismo, primero está roto el instrumento. Acá eso se automatiza.
//
// Escrito ANTES del módulo: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarEscenario, validarCorrida, sufijoDeClave, parsearLineaHome, esLineaTerminal, esLineaPedido,
  type EscenarioObservado, type LineaTerminal,
} from "./banco-validacion.ts";

const linea = (o: Partial<LineaTerminal> = {}): LineaTerminal => ({
  clave: "home:es-ES.r1:v6:123:d,m,n:", msTotal: 100, cache: "MISS", composiciones: 1, esperas: 0,
  tmdb: 926, supabase: 4, redisIntentos: 993, redisComandos: 993, ...o,
});
const pedido = (clave = "home:es-ES.r1:v6:123:d,m,n:") => clave;

function escenario(o: Partial<EscenarioObservado> = {}): EscenarioObservado {
  return {
    id: "X", query: "providers=n,d,m", veces: 1, claveSufijo: ":d,m,n:",
    respuestas: [{ estado: 200, ms: 100 }],
    pedidos: [pedido()], terminales: [linea()],
    dobles: { tmdb: 926, supabase: 4, redisHttp: 993, redisComandos: 993 },
    ...o,
  };
}

// ===========================================================================
// COINCIDENCIA
// ===========================================================================

test("una coincidencia exacta pasa: completo y válido", () => {
  const v = validarEscenario(escenario());
  assert.equal(v.estado, "completo");
  assert.equal(v.valida, true);
  assert.deepEqual(v.problemas, []);
});

test("veces = N: N respuestas, N pedidos y N líneas terminales cuyas sumas dan lo de los dobles", () => {
  const v = validarEscenario(escenario({
    veces: 3, respuestas: [{ estado: 200, ms: 1 }, { estado: 200, ms: 1 }, { estado: 200, ms: 1 }],
    pedidos: [pedido(), pedido(), pedido()],
    terminales: [linea({ tmdb: 900 }), linea({ tmdb: 600 }), linea({ tmdb: 500 })],
    dobles: { tmdb: 2000, supabase: 12, redisHttp: 2979, redisComandos: 2979 },
  }));
  assert.equal(v.valida, true, v.problemas.join("; "));
});

// ===========================================================================
// UNA DIFERENCIA EN CADA DEPENDENCIA FALLA
// ===========================================================================

test("🔴 TMDB: la app dice una cosa y el doble recibió otra → inválido, con el detalle", () => {
  const v = validarEscenario(escenario({ dobles: { tmdb: 927, supabase: 4, redisHttp: 993, redisComandos: 993 } }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /tmdb.*926.*927/);
});

test("🔴 Supabase: diferencia → inválido", () => {
  const v = validarEscenario(escenario({ dobles: { tmdb: 926, supabase: 5, redisHttp: 993, redisComandos: 993 } }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /supabase.*4.*5/);
});

test("🔴 Redis, intentos HTTP: diferencia → inválido", () => {
  const v = validarEscenario(escenario({ dobles: { tmdb: 926, supabase: 4, redisHttp: 994, redisComandos: 993 } }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /intentos.*993.*994/);
});

test("🔴 Redis, comandos: diferencia → inválido", () => {
  const v = validarEscenario(escenario({ dobles: { tmdb: 926, supabase: 4, redisHttp: 993, redisComandos: 992 } }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /comandos.*993.*992/);
});

// ===========================================================================
// SOLAPAMIENTO Y ATRIBUCIÓN
// ===========================================================================

test("🔴 una línea tardía de OTRO escenario (otra clave) en la ventana → inválido", () => {
  const v = validarEscenario(escenario({
    terminales: [linea(), linea({ clave: "home:es-ES.r1:v6:123:d,m,mb,n:", tmdb: 705 })],
    dobles: { tmdb: 1631, supabase: 8, redisHttp: 1986, redisComandos: 1986 },
  }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /clave.*d,m,mb,n/);
});

test("🔴 dos líneas terminales para UNA respuesta → inválido aunque las sumas cierren", () => {
  const v = validarEscenario(escenario({
    terminales: [linea({ tmdb: 500 }), linea({ tmdb: 426 })],
    pedidos: [pedido(), pedido()],
  }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /2 línea.*1 respuesta/);
});

test("🔴 más pedidos que solicitudes hechas: entró trabajo ajeno → inválido", () => {
  const v = validarEscenario(escenario({ pedidos: [pedido(), pedido()] }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /pedidos.*2.*1/);
});

// ===========================================================================
// EL TIMEOUT DEL CLIENTE NO ES EL FINAL DEL SERVIDOR
// ===========================================================================

test("🔴 el cliente abortó (estado null) y NO hay línea terminal: la solicitud sigue ACTIVA en el servidor", () => {
  const v = validarEscenario(escenario({
    respuestas: [{ estado: null, ms: 60000, error: "TimeoutError" }],
    terminales: [], dobles: { tmdb: 481, supabase: 17, redisHttp: 3167, redisComandos: 0 },
  }));
  assert.equal(v.estado, "incompleto");
  assert.equal(v.activasEnServidor, 1, "no detectó la solicitud que sigue corriendo");
  // Sin permiso explícito, un incompleto invalida la corrida.
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /activa/i);
});

test("un escenario que PUEDE quedar incompleto lo declara: válido como 'no completó', sin igualdades ni métricas inventadas", () => {
  const v = validarEscenario(escenario({
    permiteIncompleto: true, ventanaMs: 60000,
    respuestas: [{ estado: null, ms: 60000, error: "TimeoutError" }],
    terminales: [], dobles: { tmdb: 481, supabase: 17, redisHttp: 3167, redisComandos: 0 },
  }));
  assert.equal(v.estado, "incompleto");
  assert.equal(v.valida, true, v.problemas.join("; "));
  assert.equal(v.activasEnServidor, 1);
  assert.equal(v.resumen?.includes("no completó"), true);
  assert.equal(v.igualdadesVerificadas, false, "un incompleto no puede afirmar coincidencia");
});

test("🔴 el cliente abortó pero el servidor SÍ terminó dentro de la ventana: hay línea sin respuesta → inválido", () => {
  // Es distinto del caso anterior: la línea existe, así que el servidor
  // terminó; pero el corredor no tiene respuesta que atribuirle. No se puede
  // presentar como completo ni como incompleto: es una medición rota.
  const v = validarEscenario(escenario({
    permiteIncompleto: true,
    respuestas: [{ estado: null, ms: 60000, error: "TimeoutError" }],
    terminales: [linea()],
  }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /1 línea.*0 respuesta/);
});

test("un incompleto permitido que igual COMPLETÓ dentro de la ventana se valida como completo", () => {
  const v = validarEscenario(escenario({ permiteIncompleto: true }));
  assert.equal(v.estado, "completo");
  assert.equal(v.valida, true);
  assert.equal(v.igualdadesVerificadas, true);
});

// ===========================================================================
// LA CORRIDA ENTERA
// ===========================================================================

test("🔴 una corrida con UN escenario inválido es inválida y lo nombra", () => {
  const c = validarCorrida([
    validarEscenario(escenario({ id: "B1" })),
    validarEscenario(escenario({ id: "F5r", dobles: { tmdb: 1181, supabase: 4, redisHttp: 1284, redisComandos: 1284 } })),
  ]);
  assert.equal(c.valida, false);
  assert.deepEqual(c.invalidos, ["F5r"]);
});

test("🔴 REGRESIÓN: los F5 y F5r publicados en ceeed75 tienen que salir INVÁLIDOS", () => {
  // Los números tal cual quedaron en 2026-09-11-etapa0-linea-base.json.
  const f5 = validarEscenario(escenario({
    id: "F5", claveSufijo: ":d,m,mb,n:",
    respuestas: [{ estado: null, ms: 180032, error: "TimeoutError" }],
    pedidos: ["home:es-ES.r1:v6:123:d,m,mb,n:"], terminales: [],
    dobles: { tmdb: 481, supabase: 17, redisHttp: 3167, redisComandos: 0 },
  }));
  const f5r = validarEscenario(escenario({
    id: "F5r", claveSufijo: ":d,m,mb,n:",
    respuestas: [{ estado: 200, ms: 3044 }],
    pedidos: ["home:es-ES.r1:v6:123:d,m,mb,n:"],
    terminales: [
      linea({ clave: "home:es-ES.r1:v6:123:d,m,mb,n:", tmdb: 957, supabase: 4, redisIntentos: 1025, redisComandos: 1025 }),
      linea({ clave: "home:es-ES.r1:v6:123:d,m,mb,n:", tmdb: 705, supabase: 17, redisIntentos: 3426, redisComandos: 259 }),
    ],
    dobles: { tmdb: 1181, supabase: 4, redisHttp: 1284, redisComandos: 1284 },
  }));
  assert.equal(f5.valida, false, "F5 pasó: una solicitud activa sin permiso de incompleto");
  assert.equal(f5r.valida, false, "F5r pasó: dos líneas para una respuesta y sumas que no cierran");
  assert.equal(validarCorrida([f5, f5r]).valida, false);
});

// ===========================================================================
// LO QUE SE LEE DEL LOG
// ===========================================================================

test("la clave esperada sale de la query con la canonización de producción (Etapa 1)", () => {
  assert.equal(sufijoDeClave("providers=n,d,m"), ":d,m,n:");
  assert.equal(sufijoDeClave("providers=d,m,n"), ":d,m,n:");
  assert.equal(sufijoDeClave("providers=N,,D,zzz,M"), ":d,m,n:");
  assert.equal(sufijoDeClave("providers=n,d,m&t=accion:tv"), ":d,m,n:accion:tv");
  assert.equal(sufijoDeClave("providers=n,d,m&t=accion:movie"), ":d,m,n:", "el default escrito no entra en la clave");
  assert.equal(sufijoDeClave("providers=n,d,m,mb"), ":d,m,mb,n:");
  assert.equal(sufijoDeClave("providers=zzz"), "::");
});

test("🔴 lo ESPERADO por un escenario (composiciones, esperas, cache) se comprueba y una diferencia invalida", () => {
  const cien = Array.from({ length: 100 }, (_, i) => linea(i === 0 ? {} : { cache: "COMPARTIDA", composiciones: 0, esperas: 1, tmdb: 0, supabase: 0, redisIntentos: 1, redisComandos: 1 }));
  const base = escenario({
    veces: 100, respuestas: cien.map(() => ({ estado: 200, ms: 1 })), pedidos: cien.map(() => pedido()), terminales: cien,
    dobles: { tmdb: 926, supabase: 4, redisHttp: 993 + 99, redisComandos: 993 + 99 },
  });
  const ok = validarEscenario({ ...base, esperado: { composiciones: 1, esperas: 99 } });
  assert.equal(ok.valida, true, ok.problemas.join("; "));
  assert.deepEqual(ok.home, { composiciones: 1, esperas: 99, caches: { MISS: 1, COMPARTIDA: 99 } });
  const mal = validarEscenario({ ...base, esperado: { composiciones: 1, esperas: 98 } });
  assert.equal(mal.valida, false);
  assert.match(mal.problemas.join("\n"), /esperas.*98.*99/);
  const hit = validarEscenario(escenario({ terminales: [linea({ cache: "HIT", composiciones: 0, tmdb: 0, supabase: 0, redisIntentos: 1, redisComandos: 1 })], dobles: { tmdb: 0, supabase: 0, redisHttp: 1, redisComandos: 1 }, esperado: { cacheDeTodas: "HIT", tmdb: 0 } }));
  assert.equal(hit.valida, true, hit.problemas.join("; "));
  const noHit = validarEscenario(escenario({ esperado: { cacheDeTodas: "HIT" } }));
  assert.equal(noHit.valida, false);
});

test("se reconocen las líneas de pedido y las terminales, y la terminal trae su clave", () => {
  const p = "[home] pedido home:es-ES.r1:v6:123:d,m,n:";
  const t = "[home] 2576ms total | cache MISS | 1 composición | 0 esperas compartidas | tmdb 926 llamadas (926 ok) 24389ms | supabase 4 consultas (4 ok) 123ms | redis 993 llamadas / 993 intentos http / 993 comandos | 958 claves (30 hit / 928 miss) | 30775ms | lotes: 65 de [1,93] | clave home:es-ES.r1:v6:123:d,m,n:";
  assert.equal(esLineaPedido(p), true);
  assert.equal(esLineaTerminal(t), true);
  assert.equal(esLineaTerminal(p), false);
  const l = parsearLineaHome(t);
  assert.equal(l.esperas, 0);
  assert.equal(parsearLineaHome("[home] 12ms total | cache COMPARTIDA | 0 composiciones | 1 espera compartida | tmdb 0 llamadas (0 ok) 0ms | supabase 0 consultas (0 ok) 0ms | redis 1 llamadas / 1 intentos http / 1 comandos | 1 claves (0 hit / 1 miss) | 5ms | lotes: 1 de [1] | clave k").cache, "COMPARTIDA");
  assert.equal(l.clave, "home:es-ES.r1:v6:123:d,m,n:");
  assert.deepEqual([l.tmdb, l.supabase, l.redisIntentos, l.redisComandos, l.cache, l.composiciones, l.msTotal], [926, 4, 993, 993, "MISS", 1, 2576]);
});

test("una línea terminal SIN clave no se puede atribuir: inválido", () => {
  const v = validarEscenario(escenario({ terminales: [linea({ clave: null })] }));
  assert.equal(v.valida, false);
  assert.match(v.problemas.join("\n"), /sin clave/);
});
