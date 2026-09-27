// La credencial ES el token (plan de salas, Tarea 3.1). Lo que fija:
//   - se genera en el cliente (32 bytes → base64url, 43 chars) y se persiste
//     ANTES de la primera solicitud, así que un reintento manda la misma;
//   - ninguna respuesta del servidor la escribe: `confirmarSala` sólo la MUEVE
//     de la clave de "crear" a la de la sala, y hacerlo dos veces, o en orden
//     inverso respecto de otra respuesta, no cambia nada;
//   - un `localStorage` que lanza no rompe: la pestaña conserva una credencial
//     estable EN MEMORIA por clave;
//   - un intento pendiente y una credencial confirmada son cosas distintas: al
//     confirmar, el origen se borra siempre y la credencial queda anotada como
//     confirmada, así que una creación posterior nunca la reusa (si no,
//     `sala_crear` devolvería la sala ya vencida como repetida).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  nuevaCredencial, esCredencial, credencialParaCrear, confirmarSala, credencialParaUnirse,
  leerToken, borrarToken, CLAVE_CREAR, claveSala, _reiniciarMemoriaParaTests, type Store,
} from "./token-store.ts";

// El respaldo en memoria es del módulo (la pestaña): cada test arranca limpio.
beforeEach(() => _reiniciarMemoriaParaTests());

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

test("store que lanza: la MISMA pestaña conserva una credencial estable EN MEMORIA para todos los reintentos de la misma clave", () => {
  const a = credencialParaCrear(roto);
  assert.ok(esCredencial(a));
  assert.equal(credencialParaCrear(roto), a, "segundo reintento de crear → la misma");
  assert.equal(credencialParaCrear(roto), a, "tercero también");
  const u = credencialParaUnirse("R1", roto);
  assert.equal(credencialParaUnirse("R1", roto), u, "reintento de unirse → la misma");
  assert.notEqual(u, a, "claves distintas → credenciales distintas");
  assert.equal(leerToken("R1", roto), u, "leerToken la recupera de la memoria");
  assert.notEqual(credencialParaUnirse("R2", roto), u);
  // Y confirmar / borrar tampoco lanzan ni pierden lo que hay.
  assert.doesNotThrow(() => confirmarSala("R9", roto));
  assert.equal(leerToken("R9", roto), a, "la de crear pasó a la sala, en memoria");
  borrarToken("R1", roto);
  assert.equal(leerToken("R1", roto), null);
});

// Store que persiste todo salvo las claves de sala (setItem lanza sólo ahí).
function parcial() {
  const m = new Map<string, string>();
  const store: Store = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { if (k.startsWith("yump:sala:") && k !== CLAVE_CREAR) throw new Error("QuotaExceeded"); m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
  return { m, store };
}

test("CICLO COMPLETO con storage parcial: crear → confirmar → cerrar/borrar la sala → una nueva creación obtiene OTRA credencial", () => {
  const { m, store } = parcial();
  const c = credencialParaCrear(store);
  assert.equal(m.get(CLAVE_CREAR), c, "el intento se persiste");
  confirmarSala("R1", store);
  assert.equal(m.has(claveSala("R1")), false, "el store no pudo guardar el destino");
  assert.equal(leerToken("R1", store), c, "la pestaña la tiene en memoria bajo la sala");
  assert.equal(m.has(CLAVE_CREAR), false, "el origen se borró: ya no es un intento, es la credencial de R1");
  // La sala se cierra (o el estado terminal la borra).
  borrarToken("R1", store);
  assert.equal(leerToken("R1", store), null);
  // Una creación NUEVA no puede reusar la credencial de R1: sala_crear la devolvería como la sala vencida.
  const d = credencialParaCrear(store);
  assert.notEqual(d, c);
  assert.equal(credencialParaCrear(store), d, "y el intento nuevo sí es estable entre reintentos");
});

test("CICLO COMPLETO con storage roto (todo lanza): igual, la nueva creación obtiene otra credencial", () => {
  const c = credencialParaCrear(roto);
  assert.equal(credencialParaCrear(roto), c);
  confirmarSala("R1", roto);
  assert.equal(leerToken("R1", roto), c);
  borrarToken("R1", roto);
  const d = credencialParaCrear(roto);
  assert.notEqual(d, c);
});

test("una credencial confirmada no vuelve a valer como intento aunque el store la siga devolviendo bajo la clave de crear", () => {
  // Store cuyo removeItem no hace nada: el origen queda "pegado".
  const m = new Map<string, string>();
  const pegajoso: Store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: () => { /* no borra */ } };
  const c = credencialParaCrear(pegajoso);
  confirmarSala("R1", pegajoso);
  assert.equal(m.get(CLAVE_CREAR), c, "el store no la borró");
  assert.equal(leerToken("R1", pegajoso), c);
  const d = credencialParaCrear(pegajoso);
  assert.notEqual(d, c, "pero la pestaña sabe que está confirmada y genera otra");
  assert.equal(m.get(CLAVE_CREAR), d, "y la nueva pisa a la vieja en el store");
});

test("confirmarSala con setItem mudo (no lanza, no persiste): destino en memoria, origen borrado", () => {
  const m = new Map<string, string>();
  const mudo: Store = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { if (k === CLAVE_CREAR) m.set(k, v); /* las demás se tragan en silencio */ },
    removeItem: (k) => { m.delete(k); },
  };
  const c = credencialParaCrear(mudo);
  confirmarSala("R1", mudo);
  assert.equal(leerToken("R1", mudo), c, "se releyó el destino, no quedó, y fue a memoria");
  assert.equal(m.has(CLAVE_CREAR), false);
});

test("cuando el store SÍ conserva, la memoria no se usa: lo persistido gana y se limpia el respaldo", () => {
  const s = memoria();
  const c = credencialParaCrear(s);
  confirmarSala("R1", s);
  assert.equal(s.m.get(claveSala("R1")), c);
  assert.equal(s.m.has(CLAVE_CREAR), false);
  // Si alguien borra el store por afuera, no queda una copia fantasma en memoria.
  s.m.clear();
  assert.equal(leerToken("R1", s), null);
});
