// El historial de la ruleta: cuándo "Otra" avanza por lo ya visto y cuándo
// consume de la cola, cuándo aparece "Atrás", y qué se puede restaurar.
//
// 🔴 LO QUE ESTOS TESTS PROTEGEN ES EL COSTO. La regla del dueño es que moverse
// por el historial —atrás o adelante— no genere NI UNA llamada de red, y que se
// pida otra tanda sólo cuando la cola se agota de verdad, igual que antes. Eso
// no es una propiedad del componente: es una propiedad de este modelo, y por eso
// se prueba acá.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  iniciar, actual, puedeVolver, atras, otra, sumarTanda,
  valeGuardar, esEstadoValido,
  type SesionRuleta,
} from "./ruleta-historial.ts";
import type { RoulettePick } from "./roulette.ts";

/** Un pick mínimo: al modelo sólo le importa el `id`. */
const pick = (id: number): RoulettePick => ({
  id, type: "movie", title: `T${id}`, poster: null, year: 2020, runtime: null,
  genres: [], platforms: [], razon: "", advertencia: null, atencion: "media",
  watchLink: null,
} as unknown as RoulettePick);

const tanda = (...ids: number[]) => ids.map(pick);
const ids = (s: SesionRuleta) => s.historial.map((p) => p.id);

// --------------------------------------------------------- 1. el arranque

test("la primera recomendación ocupa la posición inicial", () => {
  const s = iniciar("larga", tanda(1, 2, 3))!;
  assert.equal(actual(s)!.id, 1);
  assert.equal(s.pos, 0);
  assert.deepEqual(ids(s), [1]);
  assert.deepEqual(s.cola.map((p) => p.id), [2, 3], "el resto queda en la cola, sin mostrarse");
});

test("🔴 'Atrás' NO aparece en la primera recomendación", () => {
  const s = iniciar("larga", tanda(1, 2, 3))!;
  assert.equal(puedeVolver(s), false);
});

test("una tanda vacía no arranca una sesión", () => {
  assert.equal(iniciar("larga", []), null);
});

// ------------------------------------------------- 2. Otra crea historial

test("'Otra' consume de la cola y habilita 'Atrás'", () => {
  const s0 = iniciar("larga", tanda(1, 2, 3))!;
  const r = otra(s0);
  assert.equal(r.tipo, "cola", "con cola disponible no puede pedir nada");
  if (r.tipo !== "cola") return;
  assert.equal(r.nuevo.id, 2, "lo que sale de la cola es lo que hay que marcar como mostrado");
  assert.equal(actual(r.sesion)!.id, 2);
  assert.deepEqual(ids(r.sesion), [1, 2]);
  assert.equal(puedeVolver(r.sesion), true);
});

test("'Atrás' muestra la recomendación inmediatamente anterior", () => {
  let s = iniciar("larga", tanda(1, 2, 3))!;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;
  assert.equal(actual(s)!.id, 3);
  s = atras(s);
  assert.equal(actual(s)!.id, 2);
  s = atras(s);
  assert.equal(actual(s)!.id, 1);
  assert.equal(puedeVolver(s), false, "en la primera vuelve a desaparecer");
});

test("'Atrás' en la primera no hace nada y no rompe", () => {
  const s = iniciar("larga", tanda(1, 2))!;
  assert.equal(atras(s), s);
});

test("🔴 volver atrás NO achica el historial", () => {
  // Los títulos ya fueron mostrados: retroceder no puede desmarcarlos, y por eso
  // el componente tampoco saca ids de `yump:ruleta-mostrados`.
  let s = iniciar("larga", tanda(1, 2, 3))!;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;
  const antes = ids(s);
  s = atras(atras(s));
  assert.deepEqual(ids(s), antes, "el historial se conserva entero");
});

// ------------------------------- 3. Atrás → Otra recorre lo visto, sin red

test("🔴 después de retroceder, 'Otra' RE-AVANZA por el historial sin tocar la cola", () => {
  let s = iniciar("larga", tanda(1, 2, 3, 4))!;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;      // 2
  s = (otra(s) as { sesion: SesionRuleta }).sesion;      // 3
  const colaAntes = s.cola.map((p) => p.id);
  s = atras(atras(s));                                    // vuelve a 1

  const r1 = otra(s);
  assert.equal(r1.tipo, "historial", "consumió de la cola en vez de re-avanzar");
  if (r1.tipo !== "historial") return;
  assert.equal(actual(r1.sesion)!.id, 2);
  assert.deepEqual(r1.sesion.cola.map((p) => p.id), colaAntes, "la cola no se tocó");

  const r2 = otra(r1.sesion);
  assert.equal(r2.tipo, "historial");
  if (r2.tipo !== "historial") return;
  assert.equal(actual(r2.sesion)!.id, 3);

  // Recién ACÁ, ya en el final de lo conocido, se consume de la cola.
  const r3 = otra(r2.sesion);
  assert.equal(r3.tipo, "cola", "al llegar al final tiene que seguir por la cola");
  if (r3.tipo !== "cola") return;
  assert.equal(r3.nuevo.id, 4);
});

// ------------------------------------------- 4. agotar la cola pide UNA tanda

test("la cola agotada avisa, no inventa", () => {
  let s = iniciar("larga", tanda(1, 2))!;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;   // 2, cola vacía
  assert.equal(otra(s).tipo, "agotada");
});

test("🔴 una tanda nueva se apila SIN perder el historial", () => {
  let s = iniciar("larga", tanda(1, 2))!;
  s = (otra(s) as { sesion: SesionRuleta }).sesion;
  const r = sumarTanda(s, tanda(3, 4));
  assert.equal(r.tipo, "cola");
  if (r.tipo !== "cola") return;
  assert.deepEqual(ids(r.sesion), [1, 2, 3], "el historial viejo sigue ahí");
  assert.equal(actual(r.sesion)!.id, 3);
  assert.deepEqual(r.sesion.cola.map((p) => p.id), [4]);
  // Y desde ahí se puede volver hasta el principio.
  assert.equal(actual(atras(atras(r.sesion)))!.id, 1);
});

test("🔴 no hay duplicados entre historial, posición actual y cola", () => {
  let s = iniciar("larga", tanda(1, 2, 1, 3, 2))!;   // la tanda ya viene sucia
  assert.deepEqual([...ids(s), ...s.cola.map((p) => p.id)], [1, 2, 3]);
  s = (otra(s) as { sesion: SesionRuleta }).sesion;
  // Y una tanda nueva que repite lo ya visto tampoco entra.
  const r = sumarTanda(s, tanda(1, 2, 3, 5));
  assert.equal(r.tipo, "cola");
  if (r.tipo !== "cola") return;
  const todos = [...ids(r.sesion), ...r.sesion.cola.map((p) => p.id)];
  assert.deepEqual(todos, [...new Set(todos)], "hay repetidos");
  assert.equal(r.nuevo.id, 5, "sólo el que de verdad era nuevo");
});

test("una tanda que ya se conocía entera se trata como agotada", () => {
  const s = iniciar("larga", tanda(1, 2))!;
  assert.equal(sumarTanda(s, tanda(1, 2)).tipo, "agotada");
});

// ------------------------------------------------- 5. qué se puede guardar

test("sin sesión no hay nada que guardar", () => {
  assert.equal(valeGuardar({ abierto: true, sesion: null }), false);
  assert.equal(valeGuardar({ abierto: false, sesion: iniciar("larga", tanda(1)) }), false);
  assert.equal(valeGuardar({ abierto: true, sesion: iniciar("larga", tanda(1)) }), true);
});

test("un snapshot corrupto no se restaura", () => {
  const bueno = { abierto: true, sesion: iniciar("larga", tanda(1, 2)) };
  assert.equal(esEstadoValido(bueno), true);
  assert.equal(esEstadoValido(null), false);
  assert.equal(esEstadoValido({ abierto: "sí", sesion: bueno.sesion }), false);
  assert.equal(esEstadoValido({ abierto: true, sesion: { ...bueno.sesion!, historial: [] } }), false);
  assert.equal(esEstadoValido({ abierto: true, sesion: { ...bueno.sesion!, pos: 9 } }), false,
    "una posición fuera del historial dejaría la tarjeta vacía");
  assert.equal(esEstadoValido({ abierto: true, sesion: { ...bueno.sesion!, cola: null } }), false);
});

test("el escenario viaja DENTRO del estado, no en la firma", () => {
  // Si estuviera en la firma, montar el Home con la ruleta cerrada daría una
  // firma distinta de la guardada y el almacén borraría el snapshot antes de que
  // nadie pudiera leerlo. Es la misma regla que documenta lista-paginada-store.
  const s = iniciar("chicos", tanda(1))!;
  assert.equal(s.escenario, "chicos");
  assert.equal(esEstadoValido({ abierto: true, sesion: s }), true);
});
