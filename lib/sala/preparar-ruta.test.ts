// Handler PURO de POST /api/sala/preparar (plan de salas, Tarea 2.2, Step 3b).
// Sin Next ni Supabase: recibe cabecera, cuerpo y dependencias, y devuelve
// {status, body}. Lo que fija:
//   - kill switch del servidor (SALAS_ACTIVAS=0) → 503 antes de validar nada;
//   - sin Bearer o sesión inválida → 401;
//   - cantidad o duración inválidas → 400 con el motivo, SIN valores por defecto;
//   - room_id que no es uuid → 400;
//   - el uid verificado (nunca el cuerpo) es el que llega a prepararRonda;
//   - los motivos de negocio salen con 409 y los fallos con 500.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manejarPreparar } from "./preparar-ruta.ts";

const ROOM = "11111111-2222-4333-8444-555555555555";
function deps(over: Partial<Parameters<typeof manejarPreparar>[1]> = {}) {
  const recibido: unknown[] = [];
  return {
    recibido,
    deps: {
      salasActivas: true,
      usuarioDeToken: async (t: string | null) => (t === "JWT-OK" ? "UID-1" : null),
      preparar: async (args: unknown) => { recibido.push(args); return { ok: true as const, round_id: "R", numero: 1, started_at: "s", deadline_at: "d", enriquecidas: 10, descartadas: 0 }; },
      ...over,
    },
  };
}
const cuerpo = (o: Record<string, unknown>) => JSON.stringify(o);

test("503 con el kill switch del servidor, antes de mirar la sesión", async () => {
  const { deps: d, recibido } = deps({ salasActivas: false });
  const r = await manejarPreparar({ authorization: "Bearer JWT-OK", cuerpo: cuerpo({ room_id: ROOM, size: 10, duracion: "cualquiera" }) }, d);
  assert.equal(r.status, 503); assert.deepEqual(r.body, { ok: false, motivo: "desactivado" }); assert.equal(recibido.length, 0);
});

test("401 sin Bearer o con sesión inválida", async () => {
  const { deps: d } = deps();
  for (const auth of [null, "", "Bearer ", "Bearer otra", "Basic x"]) {
    const r = await manejarPreparar({ authorization: auth, cuerpo: cuerpo({ room_id: ROOM, size: 10, duracion: "cualquiera" }) }, d);
    assert.equal(r.status, 401, String(auth));
  }
});

test("400 con cuerpo inválido, size fuera de {5,10,20}, size ausente, duración inválida o room_id no uuid — sin defaults", async () => {
  const { deps: d, recibido } = deps();
  const casos: [string, string][] = [
    ["{no json", "cuerpo"],
    [cuerpo({ room_id: ROOM, size: 7, duracion: "cualquiera" }), "size_invalido"],
    [cuerpo({ room_id: ROOM, size: "10", duracion: "cualquiera" }), "size_invalido"],
    [cuerpo({ room_id: ROOM, duracion: "cualquiera" }), "size_invalido"],
    [cuerpo({ room_id: ROOM, size: 10, duracion: "chicos" }), "duracion_invalida"],
    [cuerpo({ room_id: ROOM, size: 10 }), "duracion_invalida"],
    [cuerpo({ room_id: "no-uuid", size: 10, duracion: "corta" }), "room_id_invalido"],
    [cuerpo({ size: 10, duracion: "corta" }), "room_id_invalido"],
  ];
  for (const [c, motivo] of casos) {
    const r = await manejarPreparar({ authorization: "Bearer JWT-OK", cuerpo: c }, d);
    assert.equal(r.status, 400, c); assert.equal((r.body as { motivo: string }).motivo, motivo, c);
  }
  assert.equal(recibido.length, 0);
});

test("200 con la sesión verificada como hostUid (nunca del cuerpo) y la config exacta", async () => {
  const { deps: d, recibido } = deps();
  const r = await manejarPreparar({ authorization: "Bearer JWT-OK", cuerpo: cuerpo({ room_id: ROOM, size: 20, duracion: "larga", hostUid: "ATACANTE" }) }, d);
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, round_id: "R", numero: 1, started_at: "s", deadline_at: "d", enriquecidas: 10, descartadas: 0 });
  assert.deepEqual(recibido, [{ roomId: ROOM, hostUid: "UID-1", size: 20, duracion: "larga" }]);
});

test("los motivos de negocio salen con 409 y el fallo con 500", async () => {
  for (const [motivo, status] of [["insuficientes", 409], ["sin_quorum", 409], ["estado", 409], ["no_es_host", 403], ["desactivadas", 503], ["fallo", 500]] as const) {
    const { deps: d } = deps({ preparar: async () => ({ ok: false as const, motivo, alcanzables: [5] }) });
    const r = await manejarPreparar({ authorization: "Bearer JWT-OK", cuerpo: cuerpo({ room_id: ROOM, size: 10, duracion: "cualquiera" }) }, d);
    assert.equal(r.status, status, motivo);
    assert.deepEqual(r.body, { ok: false, motivo, alcanzables: [5] });
  }
});
