// Las acciones del organizador releen el estado en el acto tras un éxito, y no
// dependen del aviso del canal (Etapa 4, corrección del dueño).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pedirTanda, desempatar, asegurarRelectura, ESPERAS_RELECTURA, type DepsPedirTanda, type DepsDesempatar } from "./acciones-host.ts";

function arnesTanda(status: number, body: unknown, o: { jwt?: string | null; releerFalla?: boolean; postLanza?: boolean } = {}) {
  const log: string[] = [];
  const deps: DepsPedirTanda = {
    jwt: async () => (o.jwt === undefined ? "JWT" : o.jwt),
    post: async (b, jwt) => { log.push(`post ${b.size}/${b.duracion} ${jwt}`); if (o.postLanza) throw new Error("Failed to fetch"); return { status, body }; },
    releer: async () => { log.push("releer"); if (o.releerFalla) throw new Error("red"); },
    // Reloj falso: los reintentos no esperan de verdad en los tests.
    relectura: { dormir: async () => {} },
  };
  return { deps, log };
}

test("preparar 200 → releer UNA vez, en el acto, antes de devolver ok", async () => {
  const { deps, log } = arnesTanda(200, { ok: true });
  const r = await pedirTanda(deps, "R", 10, "cualquiera");
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.relectura === undefined, "sin cadena de reintentos: la primera lectura anduvo");
  assert.deepEqual(log, ["post 10/cualquiera JWT", "releer"]);
});

test("preparar 200 con la relectura fallando: RESPONDE YA y la cadena sigue aparte", async () => {
  // `dormir` bloqueante: la cadena no avanza hasta que el test la suelta, así se
  // ve que la respuesta no la espera.
  let soltar: (() => void)[] = [];
  const { deps, log } = arnesTanda(200, { ok: true }, { releerFalla: true });
  deps.relectura = { dormir: () => new Promise<void>((res) => soltar.push(res)) };
  const r = await pedirTanda(deps, "R", 5, "corta");
  assert.equal(r.ok, true);
  assert.deepEqual(log, ["post 5/corta JWT", "releer"], "respondió con UNA sola lectura, sin esperar reintentos");
  // Ahora sí: se suelta cada espera y la cadena termina sola.
  const cadena = r.ok ? r.relectura! : Promise.reject();
  for (let i = 0; i < ESPERAS_RELECTURA.length; i++) {
    while (!soltar.length) await new Promise((res) => setImmediate(res));
    soltar.shift()!();
    await new Promise((res) => setImmediate(res));
  }
  assert.deepEqual(await cadena, { intentos: 4, ok: false });
  assert.equal(log.filter((l) => l === "releer").length, 4, "cuatro lecturas y ninguna más");
});

test("preparar 409 insuficientes: NO relee, devuelve texto y tamaños alcanzables", async () => {
  const { deps, log } = arnesTanda(409, { ok: false, motivo: "insuficientes", alcanzables: [5, 7] });
  const r = await pedirTanda(deps, "R", 20, "cualquiera");
  assert.equal(r.ok, false);
  if (!r.ok) { assert.match(r.texto, /tanda de 5/); assert.deepEqual(r.alcanzables, [5], "7 no es un tamaño válido"); }
  assert.ok(!log.includes("releer"));
});

test("preparar sin sesión o con fallo de red: no postea / no relee", async () => {
  const sin = arnesTanda(200, {}, { jwt: null });
  const r1 = await pedirTanda(sin.deps, "R", 10, "cualquiera");
  assert.equal(r1.ok, false); assert.deepEqual(sin.log, []);
  const red = arnesTanda(200, {}, { postLanza: true });
  const r2 = await pedirTanda(red.deps, "R", 10, "cualquiera");
  assert.equal(r2.ok, false); if (!r2.ok) assert.match(r2.texto, /Sin conexión/);
  assert.ok(!red.log.includes("releer"));
});

test("desempatar ok → releer UNA vez en el acto; con error de la RPC no relee y traduce el código", async () => {
  const log: string[] = [];
  const ok: DepsDesempatar = { rpc: async () => { log.push("rpc"); return { data: { ganador_pos: 2 }, error: null }; }, releer: async () => { log.push("releer"); } };
  const r0 = await desempatar(ok);
  assert.equal(r0.ok, true);
  assert.deepEqual(log, ["rpc", "releer"]);
  const mal: DepsDesempatar = { rpc: async () => ({ data: null, error: { message: "sala_no_es_host" } }), releer: async () => { log.push("releer-mal"); } };
  const r = await desempatar(mal);
  assert.equal(r.ok, false); if (!r.ok) assert.match(r.texto, /quien creó la sala/);
  assert.ok(!log.includes("releer-mal"));
});

test("desempatar ok con la relectura fallando sigue siendo ok", async () => {
  const d: DepsDesempatar = { rpc: async () => ({ data: { ganador_pos: 0 }, error: null }), releer: async () => { throw new Error("red"); }, relectura: { dormir: async () => {} } };
  const r = await desempatar(d);
  assert.equal(r.ok, true);
  await (r.ok ? r.relectura! : Promise.reject());
});

// --- Reintentos acotados de la relectura (corrección del dueño, 22/09) -------
// Si la relectura inmediata falla, el respaldo NO puede depender de que Realtime
// se declare desconectado: se reintenta con esperas crecientes y un tope.

function relojFalso() {
  const esperas: number[] = [];
  return { esperas, dormir: async (ms: number) => { esperas.push(ms); } };
}

test("preparar 200 con la relectura fallando: reintenta hasta que sale, con las esperas declaradas", async () => {
  let n = 0;
  const reloj = relojFalso();
  const deps: DepsPedirTanda = {
    jwt: async () => "JWT",
    post: async () => ({ status: 200, body: { ok: true } }),
    releer: async () => { n++; if (n < 3) throw new Error("red"); },
    relectura: { dormir: reloj.dormir },
  };
  const r = await pedirTanda(deps, "R", 10, "cualquiera");
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.relectura, "la cadena quedó en curso");
  assert.deepEqual(await (r.ok ? r.relectura! : Promise.reject()), { intentos: 3, ok: true });
  assert.equal(n, 3);
  assert.deepEqual(reloj.esperas, [...ESPERAS_RELECTURA].slice(0, 2), "esperó 0,8 s y 2 s");
});

test("si TODOS los reintentos fallan, la cadena se ABANDONA: no hay polling permanente", async () => {
  let n = 0;
  const reloj = relojFalso();
  const deps: DepsDesempatar = {
    rpc: async () => ({ data: { ganador_pos: 1 }, error: null }),
    releer: async () => { n++; throw new Error("red"); },
    relectura: { dormir: reloj.dormir },
  };
  const r = await desempatar(deps);
  assert.equal(r.ok, true, "el desempate fue exitoso igual");
  assert.deepEqual(await (r.ok ? r.relectura! : Promise.reject()), { intentos: 1 + ESPERAS_RELECTURA.length, ok: false });
  assert.equal(n, 1 + ESPERAS_RELECTURA.length, "4 lecturas en total y ninguna más");
  assert.deepEqual(reloj.esperas, [...ESPERAS_RELECTURA]);
  // Nada quedó programado: la cadena terminó sola.
  const antes = n;
  await new Promise((res) => setImmediate(res));
  assert.equal(n, antes);
});

test("con la relectura inmediata OK no hay cadena ni esperas", async () => {
  const reloj = relojFalso();
  let n = 0;
  const r = await desempatar({
    rpc: async () => ({ data: {}, error: null }),
    releer: async () => { n++; },
    relectura: { dormir: reloj.dormir },
  });
  assert.deepEqual(r, { ok: true, relectura: undefined });
  assert.equal(n, 1);
  assert.deepEqual(reloj.esperas, []);
});

test("asegurarRelectura es la pieza reusable: primera lectura y, si falla, cadena acotada", async () => {
  const reloj = relojFalso();
  let n = 0;
  const a = await asegurarRelectura(async () => { n++; }, { dormir: reloj.dormir });
  assert.deepEqual(a, { ok: true });
  const b = await asegurarRelectura(async () => { n++; throw new Error("x"); }, { esperasMs: [10], dormir: reloj.dormir });
  assert.equal(b.ok, false);
  assert.deepEqual(await b.pendiente!, { intentos: 2, ok: false });
  assert.deepEqual(reloj.esperas, [10]);
});
