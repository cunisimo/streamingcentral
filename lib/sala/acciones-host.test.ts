// Las acciones del organizador releen el estado en el acto tras un éxito, y no
// dependen del aviso del canal (Etapa 4, corrección del dueño).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pedirTanda, desempatar, type DepsPedirTanda, type DepsDesempatar } from "./acciones-host.ts";

function arnesTanda(status: number, body: unknown, o: { jwt?: string | null; releerFalla?: boolean; postLanza?: boolean } = {}) {
  const log: string[] = [];
  const deps: DepsPedirTanda = {
    jwt: async () => (o.jwt === undefined ? "JWT" : o.jwt),
    post: async (b, jwt) => { log.push(`post ${b.size}/${b.duracion} ${jwt}`); if (o.postLanza) throw new Error("Failed to fetch"); return { status, body }; },
    releer: async () => { log.push("releer"); if (o.releerFalla) throw new Error("red"); },
  };
  return { deps, log };
}

test("preparar 200 → releer UNA vez, en el acto, antes de devolver ok", async () => {
  const { deps, log } = arnesTanda(200, { ok: true });
  const r = await pedirTanda(deps, "R", 10, "cualquiera");
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(log, ["post 10/cualquiera JWT", "releer"]);
});

test("preparar 200 con la relectura fallando: sigue siendo ok (el respaldo reintenta)", async () => {
  const { deps, log } = arnesTanda(200, { ok: true }, { releerFalla: true });
  assert.deepEqual(await pedirTanda(deps, "R", 5, "corta"), { ok: true });
  assert.deepEqual(log, ["post 5/corta JWT", "releer"]);
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
  assert.deepEqual(await desempatar(ok), { ok: true });
  assert.deepEqual(log, ["rpc", "releer"]);
  const mal: DepsDesempatar = { rpc: async () => ({ data: null, error: { message: "sala_no_es_host" } }), releer: async () => { log.push("releer-mal"); } };
  const r = await desempatar(mal);
  assert.equal(r.ok, false); if (!r.ok) assert.match(r.texto, /quien creó la sala/);
  assert.ok(!log.includes("releer-mal"));
});

test("desempatar ok con la relectura fallando sigue siendo ok", async () => {
  const d: DepsDesempatar = { rpc: async () => ({ data: { ganador_pos: 0 }, error: null }), releer: async () => { throw new Error("red"); } };
  assert.deepEqual(await desempatar(d), { ok: true });
});
