import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { crearTicket, esParaMi, invalidar } from "./ticket-vuelta.ts";
import {
  consumirVuelta, decidirRestauracionVista, guardarVista, leerVista, marcarVuelta, olvidarLista,
} from "./lista-paginada-store.ts";
import {
  estaAsentada, nuevaGeneracion, registrarListo,
} from "./categoria-generaciones.ts";

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  get bytes() { return [...this.m.values()].reduce((a, v) => a + v.length, 0); }
}
let fake: FakeStorage;
beforeEach(() => {
  fake = new FakeStorage();
  (globalThis as unknown as { sessionStorage: FakeStorage }).sessionStorage = fake;
});

// ============================================================================
// EL TICKET DE VUELTA — los seis casos que hay que sostener
// ============================================================================

test("1. padre e hijo leen la MISMA vuelta", () => {
  // El padre consume una sola vez. El hijo no toca el storage: recibe el ticket.
  marcarVuelta("/buscar", 1000);
  assert.equal(consumirVuelta("/buscar", 1000), true, "el padre la consume");
  const t = crearTicket(1, "movie");
  assert.equal(esParaMi(t, "movie"), true, "y el hijo del modo restaurado la recibe");

  // Y el storage ya no la tiene: nadie más puede tomarla por su cuenta.
  assert.equal(consumirVuelta("/buscar", 1000), false);
});

test("2. una entrada normal posterior NO reutiliza un true viejo", () => {
  marcarVuelta("/buscar", 1000);
  consumirVuelta("/buscar", 1000);
  // El usuario entra de nuevo a /buscar por un link, dentro de la ventana.
  assert.equal(consumirVuelta("/buscar", 1500), false, "no queda nada que consumir");
});

test("3. volver dos veces a la misma ruta son DOS vueltas independientes", () => {
  marcarVuelta("/buscar", 1000);
  assert.equal(consumirVuelta("/buscar", 1000), true);
  marcarVuelta("/buscar", 5000);
  assert.equal(consumirVuelta("/buscar", 5000), true, "la segunda vuelta vale por sí sola");
});

test("4. una marca de OTRA ruta no habilita restauración ni se pierde", () => {
  marcarVuelta("/top", 1000);
  assert.equal(consumirVuelta("/buscar", 1000), false, "no es mía");
  assert.equal(consumirVuelta("/top", 1000), true, "y sigue ahí para quien sí la generó");
});

test("5. cambiar de modo dentro de /buscar no resucita la vuelta", () => {
  // El padre consumió y emitió el ticket para "movie". El usuario toca "Actores":
  // monta OTRO hijo, que no puede reclamar un ticket que no es suyo.
  marcarVuelta("/buscar", 1000);
  consumirVuelta("/buscar", 1000);
  const t = crearTicket(1, "movie");
  assert.equal(esParaMi(t, "actores"), false, "el hijo del modo nuevo no lo toma");
  // Y aunque el hijo correcto ya lo hubiera cerrado, no hay nada que reclamar.
  assert.equal(esParaMi(invalidar(t, 1), "movie"), false);
});

test("5b. el ticket lo apaga el HIJO, no el tiempo ni un render", () => {
  let t: ReturnType<typeof crearTicket> | null = crearTicket(7, "movie");
  // Pasan renders del padre: el ticket sigue vivo porque el hijo no montó todavía.
  t = invalidar(t, 999);
  assert.deepEqual(t, { id: 7, modo: "movie" }, "una confirmación ajena no lo apaga");
  t = invalidar(t, 7);
  assert.equal(t, null, "lo apaga la confirmación del hijo correcto");
});

test("6. atrás y luego adelante no mezclan: cada uno con su marca", () => {
  marcarVuelta("/buscar", 1000);      // atrás
  assert.equal(consumirVuelta("/buscar", 1000), true);
  marcarVuelta("/titulo/movie/1", 2000);  // adelante, a otra ruta
  assert.equal(consumirVuelta("/buscar", 2000), false, "la de adelante no es de /buscar");
});

test("una confirmación tardía no apaga el ticket de la vuelta EN CURSO", () => {
  const viejo = crearTicket(1, "movie");
  const nuevo = crearTicket(2, "movie");
  assert.deepEqual(invalidar(nuevo, viejo.id), nuevo, "el id viejo no se lo lleva puesto");
});

test("sin ticket, ningún hijo restaura", () => {
  assert.equal(esParaMi(null, "movie"), false);
  assert.equal(esParaMi(undefined, "movie"), false);
});

// ============================================================================
// GENERACIONES DE /categoria — cuándo se asentó la página
// ============================================================================

test("no está asentada hasta que TERMINAN TODOS los rieles", () => {
  // El criterio explícito: con el primero listo la página sigue creciendo.
  let g = nuevaGeneracion(0, 4);
  assert.equal(estaAsentada(g), false, "recién montada");
  g = registrarListo(g, 0);
  assert.equal(estaAsentada(g), false, "un riel listo no alcanza");
  g = registrarListo(g, 0);
  g = registrarListo(g, 0);
  assert.equal(estaAsentada(g), false, "faltando uno, tampoco");
  g = registrarListo(g, 0);
  assert.equal(estaAsentada(g), true);
});

test("un riel vacío o fallido también cuenta como terminado", () => {
  // `registrarListo` no sabe ni le importa si el riel trajo algo: lo que decide
  // es que ya no va a cambiar el alto de la página.
  let g = nuevaGeneracion(0, 2);
  g = registrarListo(g, 0);   // vino vacío
  g = registrarListo(g, 0);   // falló
  assert.equal(estaAsentada(g), true);
});

test("una respuesta TARDÍA del tipo anterior no asienta la generación nueva", () => {
  // El caso que obliga a numerar: se toca Series, arranca la generación 1, y los
  // fetch de Películas siguen en vuelo. Sin el número, sus avisos completarían el
  // contador y el scroll se restauraría con los rieles nuevos todavía cargando.
  let g = nuevaGeneracion(1, 2);
  g = registrarListo(g, 0);
  g = registrarListo(g, 0);
  assert.equal(estaAsentada(g), false, "los avisos viejos se descartan");
  assert.equal(g.recibidos, 0);
  g = registrarListo(g, 1);
  g = registrarListo(g, 1);
  assert.equal(estaAsentada(g), true);
});

test("un riel que avisa dos veces no adelanta el contador", () => {
  let g = nuevaGeneracion(0, 3);
  for (let i = 0; i < 9; i++) g = registrarListo(g, 0);
  assert.equal(g.recibidos, 3, "el tope es el total de rieles");
});

test("una generación sin rieles no se da por asentada", () => {
  // Si no hay nada que esperar, tampoco hay altura que esperar: restaurar acá
  // sería restaurar sobre una página vacía.
  assert.equal(estaAsentada(nuevaGeneracion(0, 0)), false);
});

// ============================================================================
// ESTADO SIMPLE — vistas que no paginan
// ============================================================================

const FIRMA = "n,d,m";

test("restaura solo si se volvió atrás", () => {
  guardarVista("proximamente", { firma: FIRMA, datos: [1, 2, 3], scrollY: 900, extra: { filtro: "tv" } });
  assert.equal(decidirRestauracionVista({ clave: "proximamente", firma: FIRMA, volvio: false }), null);
  assert.equal(leerVista("proximamente", FIRMA), null, "y además lo olvida: entrar limpio es no heredar");
});

test("con vuelta, devuelve datos, scroll y filtro", () => {
  guardarVista("proximamente", { firma: FIRMA, datos: [1, 2, 3], scrollY: 900, extra: { filtro: "tv" } });
  const e = decidirRestauracionVista<number[], { filtro: string }>({ clave: "proximamente", firma: FIRMA, volvio: true });
  assert.deepEqual(e?.datos, [1, 2, 3]);
  assert.equal(e?.scrollY, 900);
  assert.equal(e?.extra?.filtro, "tv");
});

test("otras plataformas invalidan el snapshot", () => {
  guardarVista("proximamente", { firma: "n", datos: [1], scrollY: 100 });
  assert.equal(decidirRestauracionVista({ clave: "proximamente", firma: "n,d,m", volvio: true }), null);
  assert.equal(leerVista("proximamente", "n"), null, "el inválido no queda esperando");
});

test("guarda un OBJETO, no solo arrays: es lo que necesita /top", () => {
  const payload = { bloques: [{ code: "n", items: [1, 2] }] };
  guardarVista("top", { firma: FIRMA, datos: payload, scrollY: 500 });
  assert.deepEqual(leerVista<typeof payload>("top", FIRMA)?.datos, payload);
});

test("cada vista tiene su entrada y no se pisan", () => {
  guardarVista("proximamente", { firma: FIRMA, datos: [1], scrollY: 10 });
  guardarVista("directores", { firma: FIRMA, datos: [2], scrollY: 20 });
  assert.deepEqual(leerVista<number[]>("proximamente", FIRMA)?.datos, [1]);
  assert.deepEqual(leerVista<number[]>("directores", FIRMA)?.datos, [2]);
});

test("un storage corrupto no rompe: se empieza limpio", () => {
  sessionStorage.setItem("yump:lista-paginada", "{ roto");
  assert.equal(leerVista("proximamente", FIRMA), null);
});

test("olvidar una vista no toca a las demás", () => {
  guardarVista("proximamente", { firma: FIRMA, datos: [1], scrollY: 10 });
  guardarVista("top", { firma: FIRMA, datos: [2], scrollY: 20 });
  olvidarLista("proximamente");
  assert.equal(leerVista("proximamente", FIRMA), null);
  assert.deepEqual(leerVista<number[]>("top", FIRMA)?.datos, [2]);
});

test("UNA entrada por ruta: cambiar de modo pisa el snapshot", () => {
  // La decisión del 22/08: nada de historiales paralelos por pestaña. Volver a
  // /buscar restaura la ÚLTIMA vista, no una por modo.
  guardarVista("buscar", { firma: FIRMA, datos: [1], scrollY: 10, extra: { modo: "movie" } });
  guardarVista("buscar", { firma: FIRMA, datos: [9], scrollY: 0, extra: { modo: "actores" } });
  const e = leerVista<number[], { modo: string }>("buscar", FIRMA);
  assert.equal(e?.extra?.modo, "actores");
  assert.deepEqual(e?.datos, [9], "no quedó nada del modo anterior");
});
