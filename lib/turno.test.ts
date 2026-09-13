// Etapa 2 de capacidad (#17): el TURNO distribuido, estados y reconciliación.
//
// ============================================================================
// LO QUE ESTE MÓDULO DECIDE, Y POR QUÉ ES PURO
// ============================================================================
// Cada operación sobre el turno tiene TRES clases de resultado y el error de
// transporte nunca se confunde con "ocupado" ni con "perdí" (informe §4.4):
//
//   tomar     adquirido | ocupado | sin-redis      (indeterminado → reconciliar con GET)
//   renovar   renovado | perdido | indeterminado   (sólo el 0 del script marca perdido)
//   publicar  publicado | publicada-solo-fresca | rechazado | indeterminado
//   enfriar   enfriado | no-era-mio | indeterminado
//   liberar   liberado | no-era-mio | indeterminado
//
// `lib/cache.ts` arrastra el cliente de Upstash y no se puede importar desde
// `node --test`; acá se prueba la decisión con deps inyectadas, y `lib/cache.ts`
// sólo enchufa las seis primitivas reales. Escrito ANTES del módulo.
//
// 🔴 EL CONTROL QUE MÁS IMPORTA: un fallo de EVAL no habilita ninguna operación
// insegura. Las deps son un Proxy que LANZA si el módulo toca cualquier cosa que
// no sea una de las seis primitivas (`del`, `set … XX`, lo que fuera).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearTurno, type OpsTurno } from "./turno.ts";
import { crearOpsEnMemoria } from "./turno-memoria.ts";

const PRIMITIVAS = ["setNx", "get", "evalRenovar", "evalPublicar", "evalEnfriar", "evalLiberar"] as const;

/** Deps de prueba: cada primitiva se programa con una lista de respuestas; una función lanza. */
function deps(programa: Partial<Record<(typeof PRIMITIVAS)[number], Array<unknown | (() => never)>>>) {
  const llamadas: string[] = [];
  const base: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
  for (const p of PRIMITIVAS) {
    base[p] = async (...a: unknown[]) => {
      llamadas.push(`${p}(${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(",")})`);
      const cola = programa[p] ?? [];
      if (!cola.length) throw new Error(`${p}: sin respuesta programada`);
      const r = cola.shift();
      if (typeof r === "function") return (r as () => never)();
      return r;
    };
  }
  const ops = new Proxy(base, {
    get(t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (!(prop in t)) throw new Error(`operación INSEGURA o desconocida sobre el turno: ${String(prop)}`);
      return t[prop as string];
    },
  }) as unknown as OpsTurno;
  return { ops, llamadas };
}
const falla = () => { throw new Error("transporte caído"); };
const C = { turno: "home:turno:k", fresca: "home:k", ub: "home:ub:k", gen: "home:gen:k", degradado: "home:degradado:k" };

// ----------------------------------------------------------------- tomar
test("tomar: SET NX OK → adquirido, sin reconciliar", async () => {
  const d = deps({ setNx: ["OK"] });
  const r = await crearTurno(d.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 });
  assert.deepEqual(r, { estado: "adquirido", reconciliado: false });
  assert.deepEqual(d.llamadas, ["setNx(home:turno:k,A,15000)"]);
});

test("tomar: null y GET ajeno → ocupado, con el valor (para distinguir `enfriando:`)", async () => {
  const d = deps({ setNx: [null], get: ["enfriando:B"] });
  const r = await crearTurno(d.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 });
  assert.deepEqual(r, { estado: "ocupado", valor: "enfriando:B" });
});

test("tomar: null y GET == mío → adquirido RECONCILIADO (el SET ejecutó y la respuesta se perdió)", async () => {
  // El SDK reintentó su propio SET y recibió `null` por SU turno: sin esto el
  // turno propio quedaría huérfano 15 s (§4.4).
  const d = deps({ setNx: [null], get: ["A"] });
  const r = await crearTurno(d.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 });
  assert.deepEqual(r, { estado: "adquirido", reconciliado: true });
});

test("tomar: SET lanza y GET == mío → adquirido reconciliado; GET ajeno → ocupado", async () => {
  const a = deps({ setNx: [falla], get: ["A"] });
  assert.deepEqual(await crearTurno(a.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 }), { estado: "adquirido", reconciliado: true });
  const b = deps({ setNx: [falla], get: ["B"] });
  assert.deepEqual(await crearTurno(b.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 }), { estado: "ocupado", valor: "B" });
});

test("tomar: SET lanza y GET null → un segundo SET; OK → adquirido; si vuelve a lanzar → sin-redis", async () => {
  const a = deps({ setNx: [falla, "OK"], get: [null] });
  assert.deepEqual(await crearTurno(a.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 }), { estado: "adquirido", reconciliado: false });
  assert.equal(a.llamadas.filter((l) => l.startsWith("setNx")).length, 2);
  const b = deps({ setNx: [falla, falla], get: [null] });
  assert.deepEqual(await crearTurno(b.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 }), { estado: "sin-redis" });
});

test("tomar: SET lanza y GET lanza → sin-redis (Redis no disponible, §3.7)", async () => {
  const d = deps({ setNx: [falla], get: [falla] });
  assert.deepEqual(await crearTurno(d.ops).tomar({ clave: C.turno, propietario: "A", px: 15000 }), { estado: "sin-redis" });
});

// ----------------------------------------------------------------- renovar
test("renovar: 1 → renovado; 0 → perdido; excepción → indeterminado y NO perdido", async () => {
  const t = (r: unknown[]) => crearTurno(deps({ evalRenovar: r }).ops).renovar({ clave: C.turno, propietario: "A", px: 15000 });
  assert.equal(await t([1]), "renovado");
  assert.equal(await t([0]), "perdido");
  assert.equal(await t([falla]), "indeterminado");
});

// ----------------------------------------------------------------- publicar
const pub = (ops: OpsTurno) => crearTurno(ops).publicar({
  claves: { turno: C.turno, fresca: C.fresca, ub: C.ub, gen: C.gen },
  propietario: "A", payload: '{"hero":[]}', ttlFresca: 21600, ttlUb: 129600, dia: "2026-09-13",
});

test("publicar: 1 → publicado; -1 → publicada-solo-fresca; 0 → rechazado", async () => {
  assert.equal(await pub(deps({ evalPublicar: [1] }).ops), "publicado");
  assert.equal(await pub(deps({ evalPublicar: [-1] }).ops), "publicada-solo-fresca");
  assert.equal(await pub(deps({ evalPublicar: [0] }).ops), "rechazado");
});

test("publicar: el script recibe las CUATRO claves y los SEIS argumentos en el orden del contrato Lua", async () => {
  const d = deps({ evalPublicar: [1] });
  await pub(d.ops);
  assert.deepEqual(d.llamadas, [
    'evalPublicar(["home:turno:k","home:k","home:ub:k","home:gen:k"],["A","{\\"hero\\":[]}","21600","{\\"hero\\":[]}","129600","2026-09-13"])',
  ]);
});

test("publicar con respuesta perdida: gen termina en :A → publicado (el script corrió)", async () => {
  const d = deps({ evalPublicar: [falla], get: ["2026-09-13:A"] });
  assert.equal(await pub(d.ops), "publicado");
  assert.deepEqual(d.llamadas.slice(1), ["get(home:gen:k)"]);
});

test("publicar con respuesta perdida: gen ajena y turno todavía mío → un reintento idempotente", async () => {
  const d = deps({ evalPublicar: [falla, 1], get: ["2026-09-13:B", "A"] });
  assert.equal(await pub(d.ops), "publicado");
  assert.equal(d.llamadas.filter((l) => l.startsWith("evalPublicar")).length, 2);
});

test("publicar con respuesta perdida: gen ajena y turno ajeno → rechazado; GET que lanza → indeterminado", async () => {
  const a = deps({ evalPublicar: [falla], get: ["2026-09-13:B", "B"] });
  assert.equal(await pub(a.ops), "rechazado");
  assert.equal(a.llamadas.filter((l) => l.startsWith("evalPublicar")).length, 1, "no se reintenta sin turno");
  const b = deps({ evalPublicar: [falla], get: [falla] });
  assert.equal(await pub(b.ops), "indeterminado");
});

// ----------------------------------------------------------------- enfriar y liberar
test("enfriar: 1 → enfriado; 0 → no-era-mio; excepción → indeterminado", async () => {
  const t = (r: unknown[]) => crearTurno(deps({ evalEnfriar: r }).ops).enfriar({
    claves: { turno: C.turno, degradado: C.degradado }, propietario: "A", payload: "{}", px: 15000,
  });
  assert.equal(await t([1]), "enfriado");
  assert.equal(await t([0]), "no-era-mio");
  assert.equal(await t([falla]), "indeterminado");
});

test("liberar: 1 → liberado; 0 → no-era-mio; excepción → indeterminado", async () => {
  const t = (r: unknown[]) => crearTurno(deps({ evalLiberar: r }).ops).liberar({ clave: C.turno, propietario: "A" });
  assert.equal(await t([1]), "liberado");
  assert.equal(await t([0]), "no-era-mio");
  assert.equal(await t([falla]), "indeterminado");
});

test("🔴 ningún fallo habilita una operación insegura: el módulo sólo toca las seis primitivas", async () => {
  // Todas las ramas de fallo, con deps que lanzan si se toca cualquier otra cosa.
  const d = deps({
    setNx: [falla, falla], get: [null, falla, falla],
    evalRenovar: [falla], evalPublicar: [falla], evalEnfriar: [falla], evalLiberar: [falla],
  });
  const t = crearTurno(d.ops);
  assert.deepEqual(await t.tomar({ clave: C.turno, propietario: "A", px: 1 }), { estado: "sin-redis" });
  assert.equal(await t.renovar({ clave: C.turno, propietario: "A", px: 1 }), "indeterminado");
  assert.equal(await pub(d.ops), "indeterminado");
  assert.equal(await t.enfriar({ claves: { turno: C.turno, degradado: C.degradado }, propietario: "A", payload: "{}", px: 1 }), "indeterminado");
  assert.equal(await t.liberar({ clave: C.turno, propietario: "A" }), "indeterminado");
  for (const l of d.llamadas) assert.ok(PRIMITIVAS.some((p) => l.startsWith(`${p}(`)), l);
});

// ============================================================================
// La emulación en MEMORIA (desarrollo sin Redis), con la misma semántica que
// los scripts Lua del informe §4.3. Es lo que `lib/cache.ts` usa sin credenciales.
// ============================================================================
function memoria() {
  let ahora = 1_000_000;
  const store = new Map<string, { v: unknown; exp: number }>();
  const ops = crearOpsEnMemoria(store, () => ahora);
  return { ops, store, avanzar: (ms: number) => { ahora += ms; }, leer: (k: string) => { const e = store.get(k); return e && e.exp > ahora ? e.v : null; } };
}

test("memoria: SET NX PX respeta la existencia y el vencimiento", async () => {
  const m = memoria();
  assert.equal(await m.ops.setNx(C.turno, "A", 1000), "OK");
  assert.equal(await m.ops.setNx(C.turno, "B", 1000), null);
  assert.equal(await m.ops.get(C.turno), "A");
  m.avanzar(1001);
  assert.equal(await m.ops.get(C.turno), null);
  assert.equal(await m.ops.setNx(C.turno, "B", 1000), "OK");
});

test("memoria: RENOVAR sólo si es mío, y extiende el vencimiento", async () => {
  const m = memoria();
  await m.ops.setNx(C.turno, "A", 1000);
  assert.equal(await m.ops.evalRenovar(C.turno, "B", 5000), 0);
  assert.equal(await m.ops.evalRenovar(C.turno, "A", 5000), 1);
  m.avanzar(3000);
  assert.equal(await m.ops.get(C.turno), "A", "renovado: sigue vivo a los 3 s");
});

test("memoria: PUBLICAR escribe las tres y borra el turno; rechaza si el turno no es mío", async () => {
  const m = memoria();
  const claves: [string, string, string, string] = [C.turno, C.fresca, C.ub, C.gen];
  await m.ops.setNx(C.turno, "A", 1000);
  assert.equal(await m.ops.evalPublicar(claves, ["B", '{"n":1}', "10", '{"n":1}', "20", "2026-09-13"]), 0);
  assert.equal(m.leer(C.fresca), null, "un rechazo no escribe nada");
  assert.equal(await m.ops.evalPublicar(claves, ["A", '{"n":1}', "10", '{"n":1}', "20", "2026-09-13"]), 1);
  assert.deepEqual(m.leer(C.fresca), { n: 1 }, "la memoria guarda el payload PARSEADO, como lo devuelve batchGet");
  assert.deepEqual(m.leer(C.ub), { n: 1 });
  assert.equal(m.leer(C.gen), "2026-09-13:A");
  assert.equal(m.leer(C.turno), null, "el turno se borra al publicar");
  m.avanzar(10_001);
  assert.equal(m.leer(C.fresca), null, "TTL de la fresca (EX en segundos)");
  assert.deepEqual(m.leer(C.ub), { n: 1 }, "el UB vive más");
});

test("memoria: PUBLICAR con gen de un día posterior → -1: sólo la fresca, UB y gen intactos", async () => {
  const m = memoria();
  const claves: [string, string, string, string] = [C.turno, C.fresca, C.ub, C.gen];
  await m.ops.setNx(C.turno, "B", 1000);
  await m.ops.evalPublicar(claves, ["B", '{"dia":"14"}', "10", '{"dia":"14"}', "20", "2026-09-14"]);
  await m.ops.setNx(C.turno, "A", 1000);
  assert.equal(await m.ops.evalPublicar(claves, ["A", '{"dia":"13"}', "10", '{"dia":"13"}', "20", "2026-09-13"]), -1);
  assert.deepEqual(m.leer(C.fresca), { dia: "13" });
  assert.deepEqual(m.leer(C.ub), { dia: "14" }, "el UB del día nuevo no se pisa");
  assert.equal(m.leer(C.gen), "2026-09-14:B");
  assert.equal(m.leer(C.turno), null);
});

test("memoria: ENFRIAR convierte el turno en `enfriando:` y guarda el degradado aparte; LIBERAR sólo si es mío", async () => {
  const m = memoria();
  await m.ops.setNx(C.turno, "A", 1000);
  assert.equal(await m.ops.evalEnfriar([C.turno, C.degradado], ["B", '{"d":1}', "5000"]), 0);
  assert.equal(m.leer(C.degradado), null);
  assert.equal(await m.ops.evalEnfriar([C.turno, C.degradado], ["A", '{"d":1}', "5000"]), 1);
  assert.equal(await m.ops.get(C.turno), "enfriando:A");
  assert.deepEqual(m.leer(C.degradado), { d: 1 });
  assert.equal(await m.ops.setNx(C.turno, "C", 1000), null, "ocupado durante el enfriamiento");
  assert.equal(await m.ops.evalLiberar(C.turno, "A"), 0, "el valor ya no es A");
  m.avanzar(5001);
  assert.equal(await m.ops.get(C.turno), null, "el enfriamiento vence solo");
  await m.ops.setNx(C.turno, "A", 1000);
  assert.equal(await m.ops.evalLiberar(C.turno, "B"), 0);
  assert.equal(await m.ops.evalLiberar(C.turno, "A"), 1);
  assert.equal(await m.ops.get(C.turno), null);
});
