// El adaptador entre React y el controlador de la búsqueda, con las DOS fases
// de React modeladas explícitamente: el EVENTO (`onChange`, sincrónico) y el
// EFECTO (`useEffect`, diferido a después del render). Auditoría de Codex
// sobre 708bce0, hallazgo 1.
//
// 🔴 LA CARRERA QUE QUEDABA. En 708bce0 el controlador invalidaba bien, pero
// `SearchView` lo llamaba recién desde el `useEffect`; el `onChange` sólo hacía
// `setQ`. Entre el evento y el efecto —un render de React— la generación
// seguía siendo la de A, así que una respuesta de A que llegara en ESE
// intervalo se aceptaba y pintaba resultados (o el aviso de TMDB) para el
// texto B. La invalidación tiene que ocurrir en el evento que acepta el texto;
// el debounce sólo decide cuándo sale B; y el efecto posterior no puede volver
// a invalidar ni programar B dos veces.
//
// El arnés no es React: `evento(texto)` es exactamente lo que hace el
// `onChange` real (`setQ` + `escribir`) y `render()` es exactamente lo que hace
// el `useEffect` real (`efecto` con el estado actual). Entre uno y otro el test
// hace llegar respuestas, que es donde vivía el hueco. El `pedir` inyectado
// IGNORA la señal de cancelación a propósito: la generación tiene que descartar
// la respuesta aunque el fetch no honre el abort.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAdaptadorBusqueda } from "./busqueda-adaptador.ts";
import { crearControladorBusqueda } from "./busqueda-controlador.ts";
import type { EstadoBusqueda } from "./busqueda-estado.ts";

function arnes(o: { listo?: boolean } = {}) {
  const timers: { fn: () => void; cancelado: boolean }[] = [];
  const pedidos: { term: string; plataformas: string[]; senal: AbortSignal; resolver: (r: { ok: boolean; body: unknown }) => void; rechazar: (e: unknown) => void }[] = [];
  const estados: EstadoBusqueda[] = [];
  const ad = crearAdaptadorBusqueda({
    debounceMs: 250,
    programar: (fn) => { const t = { fn, cancelado: false }; timers.push(t); return () => { t.cancelado = true; }; },
    // Ignora `senal` a propósito (ver arriba).
    pedir: (term, plataformas, senal) => new Promise((resolver, rechazar) => { pedidos.push({ term, plataformas, senal, resolver, rechazar }); }),
    emitir: (e) => { estados.push(e); },
  });
  // El "estado de React": lo que el efecto ve cuando corre.
  const react = { q: "", plataformas: ["n"], listo: o.listo ?? true };
  return {
    ad, timers, pedidos, estados, react,
    /** El `onChange` real: `setQ(texto)` + `escribir(texto, …)` en el mismo handler. */
    evento(texto: string) { react.q = texto; ad.escribir(texto, { plataformas: react.plataformas, listo: react.listo }); },
    /** El `useEffect([q, ready, platforms, fase])` real. */
    render() { ad.efecto({ q: react.q, plataformas: react.plataformas, listo: react.listo }); },
    vivos: () => timers.filter((t) => !t.cancelado).length,
    disparar() { const t = timers.filter((x) => !x.cancelado).pop(); if (!t) throw new Error("no hay timer pendiente"); t.cancelado = true; t.fn(); },
    ultimo: () => estados[estados.length - 1],
    tick: () => new Promise<void>((r) => setTimeout(r, 0)),
  };
}
const resultado = (n: number) => ({ ok: true, body: { titles: Array.from({ length: n }, (_, i) => ({ id: i + 1, type: "movie" })), people: [] } });
const err503 = () => ({ ok: false, body: { error: "tmdb-no-disponible", reintentarEnMs: 5000, titles: [], people: [] } });

// Deja A en vuelo: evento + render + debounce vencido.
function conAEnVuelo(a: ReturnType<typeof arnes>) {
  a.evento("matrix"); a.render(); a.disparar();
  assert.equal(a.pedidos.length, 1);
  assert.equal(a.pedidos[0].term, "matrix");
}

test("🔴 A en vuelo; el usuario escribe B; A responde ENTRE el onChange y el efecto: A no emite nada, y el efecto no programa B dos veces", async () => {
  const a = arnes();
  conAEnVuelo(a);
  a.evento("matrix re");                            // onChange(B): React todavía no corrió el efecto
  assert.equal(a.pedidos[0].senal.aborted, true, "A se aborta en el evento");
  const antes = a.estados.length;
  a.pedidos[0].resolver(err503());                  // A responde en el intervalo evento→efecto (y el fetch ignoró el abort)
  await a.tick();
  assert.equal(a.estados.length, antes, "A no emitió NINGÚN estado");
  assert.equal(a.ultimo().fuenteCaida, false, "el aviso de A no aparece sobre el texto B");
  assert.equal(a.ultimo().cargando, true, "B sigue cargando");
  a.render();                                       // ahora sí corre el efecto de React
  assert.equal(a.vivos(), 1, "B tiene UN debounce, no dos");
  a.disparar();
  assert.equal(a.pedidos.length, 2, "B salió una sola vez");
  assert.equal(a.pedidos[1].term, "matrix re");
  a.pedidos[1].resolver(resultado(3));
  await a.tick();
  assert.equal(a.ultimo().cargando, false);
  assert.equal(a.ultimo().res.titles.length, 3, "B completó normal");
});

test("la misma carrera con A devolviendo resultados: tampoco se pintan sobre B", async () => {
  const a = arnes();
  conAEnVuelo(a);
  a.evento("matrix re");
  a.pedidos[0].resolver(resultado(7));
  await a.tick();
  assert.deepEqual(a.ultimo().res.titles, []);
  assert.equal(a.ultimo().cargando, true);
});

test("B se ejecuta UNA sola vez aunque el efecto corra varias veces con el mismo q y plataformas", () => {
  const a = arnes();
  a.evento("matrix"); a.render(); a.render(); a.render();
  assert.equal(a.vivos(), 1);
  a.disparar();
  assert.equal(a.pedidos.length, 1);
  a.render();
  assert.equal(a.vivos(), 0, "un render posterior no vuelve a programar el mismo pedido");
  assert.equal(a.pedidos.length, 1);
});

test("A→B→C con renders desfasados: un solo timer vivo, y sale sólo C, una vez", () => {
  const a = arnes();
  a.evento("ma"); a.evento("mat"); a.render(); a.evento("matr"); a.render(); a.render();
  assert.equal(a.vivos(), 1);
  a.disparar();
  assert.equal(a.pedidos.length, 1);
  assert.equal(a.pedidos[0].term, "matr");
});

test("término corto en el evento: invalida A en el acto, limpia y apaga la carga; el efecto no reprograma nada", async () => {
  const a = arnes();
  conAEnVuelo(a);
  a.evento("m");
  assert.equal(a.ultimo().cargando, false);
  assert.deepEqual(a.ultimo().res.titles, []);
  a.pedidos[0].resolver(resultado(2));
  await a.tick();
  assert.deepEqual(a.ultimo().res.titles, [], "la respuesta tardía de A no pinta nada");
  a.render();
  assert.equal(a.vivos(), 0);
  assert.equal(a.pedidos.length, 1);
});

test("cambio de plataformas con el mismo texto (llega por el efecto, no por el evento): nueva generación y un solo pedido nuevo", async () => {
  const a = arnes();
  conAEnVuelo(a);
  a.react.plataformas = ["n", "d"];
  a.render();
  a.pedidos[0].resolver(resultado(5));
  await a.tick();
  assert.deepEqual(a.ultimo().res.titles, [], "la respuesta con las plataformas viejas se descarta");
  assert.equal(a.vivos(), 1);
  a.render();
  assert.equal(a.vivos(), 1, "el efecto repetido no duplica");
  a.disparar();
  assert.deepEqual(a.pedidos[1].plataformas, ["n", "d"]);
  a.pedidos[1].resolver(resultado(1));
  await a.tick();
  assert.equal(a.ultimo().res.titles.length, 1);
});

test("restauración (volver de una ficha): invalida A, deja lo restaurado, y el efecto con el q restaurado NO pide", async () => {
  const a = arnes();
  conAEnVuelo(a);
  // Lo que hace el efecto de restauración de SearchView: restaurar + setQ.
  a.ad.restaurar("padrino", { titles: [{ id: 9 } as never], people: [] });
  a.render();                                        // corre una vez con el q VIEJO ("matrix"): no toca nada
  a.react.q = "padrino";
  a.render();                                        // y con el q restaurado: nada que pedir
  assert.equal(a.vivos(), 0);
  assert.equal(a.pedidos.length, 1);
  assert.equal(a.ultimo().res.titles.length, 1);
  a.pedidos[0].resolver(resultado(4));
  await a.tick();
  assert.equal(a.ultimo().res.titles.length, 1, "la respuesta tardía de A no pisa lo restaurado");
  a.render();
  assert.equal(a.pedidos.length, 1, "renders posteriores tampoco piden");
  // Después de restaurar, escribir sigue funcionando: un texto nuevo pide.
  a.evento("padrino 2"); a.render(); a.disparar();
  assert.equal(a.pedidos.length, 2);
  assert.equal(a.pedidos[1].term, "padrino 2");
});

test("desmontaje: cancela el debounce, aborta y ninguna respuesta tardía emite", async () => {
  const a = arnes();
  conAEnVuelo(a);
  a.evento("matrix re");
  a.ad.desmontar();
  assert.equal(a.vivos(), 0);
  assert.equal(a.pedidos[0].senal.aborted, true);
  const antes = a.estados.length;
  a.pedidos[0].resolver(resultado(2));
  await a.tick();
  assert.equal(a.estados.length, antes);
});

test("antes de estar listo (plataformas o restauración sin decidir): el evento no pide; el efecto pide UNA vez cuando se decide", () => {
  const a = arnes({ listo: false });
  a.evento("matrix"); a.render();
  assert.equal(a.vivos(), 0);
  a.react.listo = true;
  a.render(); a.render();
  assert.equal(a.vivos(), 1);
  a.disparar();
  assert.equal(a.pedidos.length, 1);
});

test("el fallo de red de A que llega entre el evento y el efecto tampoco apaga la carga de B", async () => {
  const a = arnes();
  conAEnVuelo(a);
  a.evento("matrix re");
  a.pedidos[0].rechazar(new TypeError("fetch failed"));
  await a.tick();
  assert.equal(a.ultimo().cargando, true);
});

test("CONTROL (cableado de 708bce0): con el onChange limitado a setQ y el controlador llamado sólo desde el efecto, A se pinta sobre B", async () => {
  // El controlador REAL, cableado como en 708bce0: el evento no lo toca.
  const timers: (() => void)[] = [];
  const pedidos: ((r: { ok: boolean; body: unknown }) => void)[] = [];
  const estados: EstadoBusqueda[] = [];
  const ctl = crearControladorBusqueda({
    programar: (fn) => { timers.push(fn); return () => {}; },
    pedir: () => new Promise((resolver) => { pedidos.push(resolver); }),
    emitir: (e) => { estados.push(e); },
  });
  let q = "";
  const onChangeViejo = (texto: string) => { q = texto; };                 // sólo setQ
  const efectoViejo = () => ctl.cambiarTermino(q, ["n"]);                  // el useEffect
  onChangeViejo("matrix"); efectoViejo(); timers.shift()!();               // sale A
  onChangeViejo("matrix re");                                              // el usuario escribió B; el efecto todavía no corrió
  pedidos[0](resultado(7));                                                // responde A en ese intervalo
  await new Promise((r) => setTimeout(r, 0));
  const ultimo = estados[estados.length - 1];
  assert.equal(ultimo.res.titles.length, 7, "el cableado viejo pinta A aunque el usuario ya escribió B");
  assert.equal(ultimo.cargando, false);
});
