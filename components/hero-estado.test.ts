import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  claveTrackHero, estadoAplicable, guardarEstadoHero, leerEstadoHero, normalizar, ESTADO_INICIAL,
} from "./hero-estado.ts";

// sessionStorage no existe en Node. Se falsea con lo mínimo que usa el módulo,
// que además deja ver que el contrato es chico: tres métodos.
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  get size() { return this.m.size; }
}
let fake: FakeStorage;
beforeEach(() => {
  fake = new FakeStorage();
  (globalThis as unknown as { sessionStorage: FakeStorage }).sessionStorage = fake;
});

// --- ida y vuelta ------------------------------------------------------------

test("volver de una ficha devuelve el mismo chip y la misma tanda", () => {
  // El bug: elegir "Terror", tocar "Otras" dos veces, abrir una ficha y volver
  // te dejaba en "6 para hoy" desde cero. La posición horizontal se restauraba,
  // pero sobre otro contenido.
  guardarEstadoHero({ slug: "terror", offset: 2 });
  assert.deepEqual(leerEstadoHero(), { slug: "terror", offset: 2 });
});

test("volver al estado base BORRA lo guardado, no lo deja pegado", () => {
  guardarEstadoHero({ slug: "terror", offset: 2 });
  guardarEstadoHero(ESTADO_INICIAL);
  assert.deepEqual(leerEstadoHero(), ESTADO_INICIAL);
  assert.equal(fake.size, 0, "no queda basura en sessionStorage");
});

test("sin nada guardado se arranca en el estado base", () => {
  assert.deepEqual(leerEstadoHero(), ESTADO_INICIAL);
});

// --- lo guardado no se cree a ciegas ----------------------------------------

test("un sessionStorage corrupto no rompe: se vuelve al estado base", () => {
  fake.setItem("yump:hero-estado", "{ esto no es json");
  assert.deepEqual(leerEstadoHero(), ESTADO_INICIAL);
});

test("un estado con forma vieja o inválida se normaliza", () => {
  assert.deepEqual(normalizar({ slug: 123, offset: "dos" }), ESTADO_INICIAL);
  assert.deepEqual(normalizar({ slug: "terror" }), { slug: "terror", offset: 0 });
  assert.deepEqual(normalizar({ slug: "terror", offset: -5 }), { slug: "terror", offset: 0 });
  assert.deepEqual(normalizar(null), ESTADO_INICIAL);
});

// --- la clave del scroll -----------------------------------------------------

test("cada conjunto de 6 tiene su propia clave", () => {
  // Es lo que hace que cambiar de chip o tocar "Otras" arranque del principio:
  // clave nueva, nada guardado, y `useTrackScroll` asigna 0.
  const a = claveTrackHero({ slug: "todos", offset: 0 });
  const b = claveTrackHero({ slug: "todos", offset: 1 });
  const c = claveTrackHero({ slug: "terror", offset: 0 });
  assert.notEqual(a, b, "otra tanda es otro contenido");
  assert.notEqual(a, c, "otro chip es otro contenido");
});

test("la misma tanda del mismo chip da la misma clave", () => {
  // Sin esto, volver de una ficha no encontraría la posición guardada.
  assert.equal(
    claveTrackHero({ slug: "terror", offset: 2 }),
    claveTrackHero({ slug: "terror", offset: 2 }),
  );
});

test("la clave no colisiona con la de otros rieles", () => {
  // Los rieles de Shelf usan `shelfKey` o el encabezado; "Próximamente" usa
  // "upcoming". El prefijo evita que un chip llamado "upcoming" los pise.
  assert.ok(claveTrackHero({ slug: "upcoming", offset: 0 }).startsWith("hero:"));
});

// --- un slug que ya no existe descarta el estado ENTERO ----------------------

const CHIPS = ["terror", "comedia", "accion"];

test("un slug desconocido vuelve al estado base, offset incluido", () => {
  // El borde: descartar solo el chip y conservar el offset dejaba al usuario en
  // `todos` con la tanda 2 — "6 para hoy" mostrando la tercera tanda del pool
  // general, un estado que nunca eligió y que no tiene forma de explicarse.
  assert.deepEqual(estadoAplicable({ slug: "policial", offset: 2 }, CHIPS), ESTADO_INICIAL);
});

test("un chip que sigue existiendo conserva su tanda", () => {
  const e = { slug: "terror", offset: 3 };
  assert.deepEqual(estadoAplicable(e, CHIPS), e);
});

test("`todos` con tanda es válido y se conserva", () => {
  // No es un estado inválido: es "6 para hoy" más tres "Mostrame otras".
  assert.deepEqual(estadoAplicable({ slug: "todos", offset: 3 }, CHIPS), { slug: "todos", offset: 3 });
});

test("sin chips todavía, cualquier slug se descarta", () => {
  // Pasa de verdad: si la lista llegara vacía, es preferible el estado base a
  // restaurar un chip que no se puede mostrar.
  assert.deepEqual(estadoAplicable({ slug: "terror", offset: 1 }, []), ESTADO_INICIAL);
});

test("descartar y guardar deja el sessionStorage limpio", () => {
  // Las dos mitades juntas: el estado inválido no queda esperando a la próxima
  // carga. `guardarEstadoHero` del estado base BORRA la clave.
  guardarEstadoHero({ slug: "policial", offset: 2 });
  guardarEstadoHero(estadoAplicable(leerEstadoHero(), CHIPS));
  assert.equal(fake.size, 0);
  assert.deepEqual(leerEstadoHero(), ESTADO_INICIAL);
});
