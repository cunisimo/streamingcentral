// Volver a Mi lista con una escritura de "Mi lista" todavía pendiente (auditoría
// del 5/10). La ficha hace `void list?.toggle(...)`: el contexto cambia las
// claves de forma optimista y recién después espera a Supabase. Si la vista
// decide con esas claves, un alta recarga antes de existir en la base y una
// baja fallida deja el título oculto aunque el contexto revierta después.
//
// Las escrituras son promesas CONTROLADAS: el test decide cuándo y cómo
// responde "Supabase", después de que la vista empezó a decidir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirMiLista, type SnapshotMiLista } from "./mi-lista.ts";
import { crearListaEnMemoria } from "./mi-lista-memoria.ts";
import type { UITitle } from "./types.ts";

const t = (k: string): UITitle => { const [type, id] = k.split(":"); return { id: Number(id), type, title: k } as unknown as UITitle; };
const claves = (xs: UITitle[]) => xs.map((x) => `${x.type}:${x.id}`);
const tick = () => new Promise((r) => setImmediate(r));

const INICIAL = ["movie:1", "movie:2", "tv:3"];
const SNAPSHOT = { datos: { tipo: "movie", items: INICIAL.map(t) } as SnapshotMiLista, scrollY: 500 };

function mundo() {
  // Lo que hay en Supabase, lo más reciente primero (como `itemRefs("list")`).
  const servidor = [...INICIAL];
  const cargas = { n: 0 };
  let responder: ((ok: boolean) => void) | null = null;
  const lista = crearListaEnMemoria((k, on) => new Promise((fin) => {
    responder = (ok) => {
      if (ok) { if (on) servidor.unshift(k); else servidor.splice(servidor.indexOf(k), 1); }
      fin(ok ? {} : { error: "falló la escritura" });
    };
  }));
  lista.reemplazar(INICIAL);
  // La carga real lee la base: refs de Supabase → /api/cards.
  const cargar = async () => { cargas.n++; return servidor.map(t); };
  return { lista, cargar, cargas, servidor, responder: (ok: boolean) => responder!(ok) };
}

// Tocar "Mi lista" en la ficha y volver INMEDIATAMENTE: la vista empieza a
// decidir con la escritura en vuelo, y Supabase responde después.
async function volverConPendiente(k: string, ok: boolean, esperar: boolean) {
  const m = mundo();
  void m.lista.toggle(k);
  const enLista = esperar ? m.lista.asentado : async () => m.lista.claves();
  const vista = abrirMiLista({ snapshot: SNAPSHOT, enLista, cargar: m.cargar });
  await tick();
  m.responder(ok);
  const v = await vista;
  return { v, m };
}

test("alta confirmada: espera la escritura, recarga UNA vez y muestra el título nuevo primero", async () => {
  const { v, m } = await volverConPendiente("movie:9", true, true);
  assert.equal(m.cargas.n, 1);
  assert.deepEqual(claves(v.items), ["movie:9", ...INICIAL]);
  assert.equal(v.tipo, "movie");
  assert.equal(v.scrollY, 500);
});

test("alta fallida: respeta el rollback, no muestra el título y no consulta", async () => {
  const { v, m } = await volverConPendiente("movie:9", false, true);
  assert.ok(!claves(v.items).includes("movie:9"));
  assert.deepEqual(claves(v.items), INICIAL);
  assert.equal(m.cargas.n, 0, "con el rollback ya aplicado no hay nada nuevo: snapshot");
  assert.ok(!m.lista.claves().has("movie:9"));
});

test("baja confirmada: el título desaparece del snapshot sin consultas", async () => {
  const { v, m } = await volverConPendiente("movie:2", true, true);
  assert.deepEqual(claves(v.items), ["movie:1", "tv:3"]);
  assert.equal(m.cargas.n, 0);
  assert.equal(v.scrollY, 500);
});

test("baja fallida: respeta el rollback y conserva el título, sin consultas", async () => {
  const { v, m } = await volverConPendiente("movie:2", false, true);
  assert.deepEqual(claves(v.items), INICIAL);
  assert.equal(m.cargas.n, 0);
  assert.ok(m.lista.claves().has("movie:2"));
});

test("sin cambios pendientes: tarjetas, filtro y scroll del snapshot, sin consultas", async () => {
  const m = mundo();
  const v = await abrirMiLista({ snapshot: SNAPSHOT, enLista: m.lista.asentado, cargar: m.cargar });
  assert.deepEqual(claves(v.items), INICIAL);
  assert.equal(v.tipo, "movie");
  assert.equal(v.scrollY, 500);
  assert.equal(m.cargas.n, 0);
});

test("entrada nueva (sin snapshot) con un alta pendiente: la carga ve el alta confirmada", async () => {
  const m = mundo();
  void m.lista.toggle("tv:7");
  const vista = abrirMiLista({ snapshot: null, enLista: m.lista.asentado, cargar: m.cargar });
  await tick();
  m.responder(true);
  const v = await vista;
  assert.equal(m.cargas.n, 1);
  assert.equal(claves(v.items)[0], "tv:7");
});

test("varias escrituras encadenadas: `asentado` espera también la que empieza mientras espera", async () => {
  const m = mundo();
  void m.lista.toggle("movie:9");
  let resuelto = false;
  const espera = m.lista.asentado().then(() => { resuelto = true; });
  await tick();
  m.responder(true);              // termina la primera…
  void m.lista.toggle("movie:1"); // …pero ya empezó otra
  await tick();
  assert.equal(resuelto, false, "no puede resolver con una escritura en vuelo");
  m.responder(true);
  await espera;
  assert.deepEqual([...m.lista.claves()].sort(), ["movie:2", "movie:9", "tv:3"]);
});

// El fallo, demostrado: decidir con las claves optimistas SIN esperar (lo que
// hacía la vista antes de la corrección) rompe exactamente los dos casos de la
// auditoría. Si alguien vuelve a pasar las claves en vez de `asentado`, esto lo
// explica.
test("REGRESIÓN: sin esperar las escrituras, el alta confirmada falta y la baja fallida queda oculta", async () => {
  const alta = await volverConPendiente("movie:9", true, false);
  assert.ok(!claves(alta.v.items).includes("movie:9"), "la recarga corrió antes de que Supabase confirmara");
  assert.ok(alta.m.servidor.includes("movie:9"), "…aunque el alta sí quedó en la base");
  const baja = await volverConPendiente("movie:2", false, false);
  assert.ok(!claves(baja.v.items).includes("movie:2"), "se filtró con la baja optimista");
  assert.ok(baja.m.lista.claves().has("movie:2"), "…aunque el contexto ya revirtió");
});
