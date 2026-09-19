// La credencial ES el token (plan de salas, Tarea 3.1). Lo que fija:
//   - se genera en el cliente (32 bytes → base64url, 43 chars) y se persiste
//     ANTES de la primera solicitud, así que un reintento manda la misma;
//   - ninguna respuesta del servidor la escribe: `confirmarSala` sólo la MUEVE
//     de la clave de "crear" a la de la sala, y hacerlo dos veces, o en orden
//     inverso respecto de otra respuesta, no cambia nada;
//   - un `localStorage` que lanza no rompe: se genera una efímera y se sigue.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nuevaCredencial, esCredencial, credencialParaCrear, confirmarSala, credencialParaUnirse,
  leerToken, borrarToken, CLAVE_CREAR, claveSala, type Store,
} from "./token-store.ts";

function memoria(): Store & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
const roto: Store = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => { throw new Error("x"); } };
// Bytes deterministas para poder afirmar la codificación exacta.
const bytesFijos = (n: number) => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = (n + i) & 255; return b; };

test("nuevaCredencial: 32 bytes en base64url sin relleno = 43 caracteres del alfabeto [A-Za-z0-9_-]", () => {
  const c = nuevaCredencial();
  assert.equal(c.length, 43);
  assert.ok(esCredencial(c), c);
  assert.notEqual(nuevaCredencial(), c);
  // Codificación exacta con bytes conocidos: 0x00..0x1F → "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8".
  assert.equal(nuevaCredencial(() => bytesFijos(0)), "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
  // Bytes altos producen '-' y '_' (nunca '+' ni '/'), y sin '='.
  const alta = nuevaCredencial(() => new Uint8Array(32).fill(0xfb));
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(alta), alta);
  assert.ok(alta.includes("-") || alta.includes("_"));
});

test("esCredencial rechaza lo que no tiene la forma exacta", () => {
  for (const mala of ["", "abc", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "+", "A".repeat(42) + "=", null, undefined]) {
    assert.equal(esCredencial(mala), false, String(mala));
  }
});

test("credencialParaCrear: la persiste ANTES de devolverla y el reintento devuelve la MISMA", () => {
  const s = memoria();
  const a = credencialParaCrear(s);
  assert.equal(s.m.get(CLAVE_CREAR), a);
  assert.equal(credencialParaCrear(s), a);
  assert.equal(credencialParaCrear(s), a);
});

test("un valor persistido con forma inválida se reemplaza (no se manda basura al servidor)", () => {
  const s = memoria();
  s.m.set(CLAVE_CREAR, "corrupto");
  const c = credencialParaCrear(s);
  assert.ok(esCredencial(c));
  assert.equal(s.m.get(CLAVE_CREAR), c);
});

test("confirmarSala MUEVE la credencial de crear a la clave de la sala; es idempotente", () => {
  const s = memoria();
  const c = credencialParaCrear(s);
  confirmarSala("R1", s);
  assert.equal(s.m.get(claveSala("R1")), c);
  assert.equal(s.m.has(CLAVE_CREAR), false);
  assert.equal(leerToken("R1", s), c);
  // Segunda confirmación (respuesta repetida o desordenada): nada cambia.
  confirmarSala("R1", s);
  assert.equal(leerToken("R1", s), c);
  // Y una creación NUEVA después genera otra credencial, sin tocar la de R1.
  const d = credencialParaCrear(s);
  assert.notEqual(d, c);
  assert.equal(leerToken("R1", s), c);
});

test("respuestas en orden inverso: la credencial que quedó es la que el cliente ya tenía; nada del servidor la pisa", () => {
  const s = memoria();
  const c = credencialParaCrear(s);
  // Dos reintentos en vuelo con la MISMA credencial; llega primero la segunda respuesta, después la primera.
  confirmarSala("R1", s);
  confirmarSala("R1", s);
  assert.equal(leerToken("R1", s), c);
  assert.equal(s.m.size, 1);
});

test("credencialParaUnirse: una por sala, persistida antes de la primera solicitud, estable entre reintentos", () => {
  const s = memoria();
  const a = credencialParaUnirse("R9", s);
  assert.ok(esCredencial(a));
  assert.equal(s.m.get(claveSala("R9")), a);
  assert.equal(credencialParaUnirse("R9", s), a);
  // Otra sala, otra credencial: una credencial no puede ser de dos participantes.
  assert.notEqual(credencialParaUnirse("R8", s), a);
});

test("borrarToken deja la sala sin credencial; leerToken devuelve null", () => {
  const s = memoria();
  credencialParaUnirse("R9", s);
  borrarToken("R9", s);
  assert.equal(leerToken("R9", s), null);
  assert.equal(s.m.has(claveSala("R9")), false);
});

test("con un store que lanza no se rompe nada: devuelve una credencial válida (efímera) y las demás operaciones callan", () => {
  const c = credencialParaCrear(roto);
  assert.ok(esCredencial(c));
  assert.doesNotThrow(() => confirmarSala("R1", roto));
  assert.ok(esCredencial(credencialParaUnirse("R1", roto)));
  assert.equal(leerToken("R1", roto), null);
  assert.doesNotThrow(() => borrarToken("R1", roto));
});
