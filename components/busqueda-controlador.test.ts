// El controlador de la búsqueda con texto: generación, debounce y respuesta,
// con el reloj y el fetch INYECTADOS (auditoría de Codex sobre 09b9dbe,
// hallazgo 1).
//
// 🔴 LA CARRERA. En 09b9dbe, `pedidoVigente` se incrementaba recién DENTRO del
// temporizador de 250 ms. Secuencia: empieza el pedido A; el usuario cambia a
// un término válido B; antes de que venza el debounce de B llega la respuesta
// de A → A todavía era "vigente" y pintaba resultados (o el aviso de TMDB) del
// término viejo, y apagaba el "Buscando…" de B. La invalidación tiene que
// ocurrir en el instante en que cambia el término, no al iniciar el fetch
// diferido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearControladorBusqueda } from "./busqueda-controlador.ts";
import type { EstadoBusqueda } from "./busqueda-estado.ts";

// Reloj manual: `programar` guarda la función; `disparar()` ejecuta la
// pendiente. Fetch manual: `pedir` devuelve una promesa que el test resuelve.
function arnes() {
  const timers: { fn: () => void; ms: number; cancelado: boolean }[] = [];
  const pedidos: { term: string; plataformas: string[]; senal: AbortSignal; resolver: (r: { ok: boolean; body: unknown }) => void; rechazar: (e: unknown) => void }[] = [];
  const estados: EstadoBusqueda[] = [];
  const ctl = crearControladorBusqueda({
    debounceMs: 250,
    programar: (fn, ms) => { const t = { fn, ms, cancelado: false }; timers.push(t); return () => { t.cancelado = true; }; },
    pedir: (term, plataformas, senal) => new Promise((resolver, rechazar) => { pedidos.push({ term, plataformas, senal, resolver, rechazar }); }),
    emitir: (e) => { estados.push(e); },
  });
  const disparar = () => { const t = timers.filter((x) => !x.cancelado).pop(); if (!t) throw new Error("no hay timer pendiente"); t.cancelado = true; t.fn(); };
  const ultimo = () => estados[estados.length - 1];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return { ctl, timers, pedidos, estados, disparar, ultimo, tick };
}
const resultado = (n: number) => ({ ok: true, body: { titles: Array.from({ length: n }, (_, i) => ({ id: i + 1, type: "movie" })), people: [] } });
const err503 = () => ({ ok: false, body: { error: "tmdb-no-disponible", reintentarEnMs: 5000, titles: [], people: [] } });

test("🔴 A en vuelo, cambio a B, responde A antes del debounce de B: A no toca resultados, aviso ni carga; B completa normal", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]);
  a.disparar();                                   // vence el debounce de A: sale el pedido A
  assert.equal(a.pedidos.length, 1);
  a.ctl.cambiarTermino("matrix re", ["n"]);       // el usuario sigue escribiendo: B, todavía sin debounce
  assert.equal(a.ultimo().cargando, true);
  assert.equal(a.pedidos.length, 1, "B no salió todavía (debounce)");
  const antes = a.estados.length;
  a.pedidos[0].resolver(err503());                // responde A, tarde
  await a.tick();
  assert.equal(a.estados.length, antes, "A no emitió NINGÚN estado");
  assert.equal(a.ultimo().fuenteCaida, false, "el aviso de A no aparece");
  assert.equal(a.ultimo().cargando, true, "B sigue cargando");
  assert.deepEqual(a.ultimo().res.titles, [], "los resultados de A no se pintan");
  a.disparar();                                   // vence el debounce de B
  assert.equal(a.pedidos.length, 2);
  assert.equal(a.pedidos[1].term, "matrix re");
  a.pedidos[1].resolver(resultado(3));
  await a.tick();
  assert.equal(a.ultimo().cargando, false);
  assert.equal(a.ultimo().res.titles.length, 3, "B completó normalmente");
});

test("la misma carrera con A devolviendo resultados: tampoco se pintan", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]); a.disparar();
  a.ctl.cambiarTermino("matrix re", ["n"]);
  a.pedidos[0].resolver(resultado(7));
  await a.tick();
  assert.deepEqual(a.ultimo().res.titles, []);
  assert.equal(a.ultimo().cargando, true);
});

test("cambios consecutivos A→B→C antes de cualquier debounce: sólo C sale, una vez", () => {
  const a = arnes();
  a.ctl.cambiarTermino("ma", ["n"]);
  a.ctl.cambiarTermino("mat", ["n"]);
  a.ctl.cambiarTermino("matr", ["n"]);
  assert.equal(a.timers.filter((t) => !t.cancelado).length, 1, "un solo timer vivo");
  a.disparar();
  assert.equal(a.pedidos.length, 1);
  assert.equal(a.pedidos[0].term, "matr");
});

test("término corto después de un pedido en vuelo: se invalida el pedido, se limpian resultados y no queda 'cargando'", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]); a.disparar();
  a.ctl.cambiarTermino("m", ["n"]);
  assert.equal(a.ultimo().cargando, false);
  assert.deepEqual(a.ultimo().res.titles, []);
  assert.equal(a.pedidos[0].senal.aborted, true, "el fetch en vuelo se aborta");
  a.pedidos[0].resolver(resultado(2));
  await a.tick();
  assert.deepEqual(a.ultimo().res.titles, [], "la respuesta tardía no pinta nada");
});

test("desmontaje: cancela el debounce pendiente, aborta el fetch y una respuesta tardía no emite nada", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]); a.disparar();
  a.ctl.cambiarTermino("matrix re", ["n"]);
  a.ctl.desmontar();
  assert.equal(a.timers.every((t) => t.cancelado), true);
  assert.equal(a.pedidos[0].senal.aborted, true);
  const antes = a.estados.length;
  a.pedidos[0].resolver(resultado(2));
  await a.tick();
  assert.equal(a.estados.length, antes);
});

test("cambio de plataformas con el mismo término: nueva generación; la respuesta del pedido viejo se descarta", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]); a.disparar();
  a.ctl.cambiarTermino("matrix", ["n", "d"]);
  a.pedidos[0].resolver(resultado(5));
  await a.tick();
  assert.deepEqual(a.ultimo().res.titles, []);
  a.disparar();
  assert.deepEqual(a.pedidos[1].plataformas, ["n", "d"]);
  a.pedidos[1].resolver(resultado(1));
  await a.tick();
  assert.equal(a.ultimo().res.titles.length, 1);
});

test("un fallo de red del pedido vigente apaga la carga sin aviso de TMDB; uno de un pedido superado no hace nada", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]); a.disparar();
  a.pedidos[0].rechazar(new TypeError("fetch failed"));
  await a.tick();
  assert.equal(a.ultimo().cargando, false);
  assert.equal(a.ultimo().fuenteCaida, false);
  a.ctl.cambiarTermino("matrix re", ["n"]); a.disparar();
  a.ctl.cambiarTermino("matrix rel", ["n"]);
  const antes = a.estados.length;
  a.pedidos[1].rechazar(new TypeError("fetch failed"));
  await a.tick();
  assert.equal(a.estados.length, antes);
});

test("restaurar (volver de una ficha) invalida lo pendiente y deja los resultados restaurados", async () => {
  const a = arnes();
  a.ctl.cambiarTermino("matrix", ["n"]); a.disparar();
  a.ctl.restaurar({ titles: [{ id: 9 } as never], people: [] });
  assert.equal(a.ultimo().res.titles.length, 1);
  assert.equal(a.ultimo().cargando, false);
  a.pedidos[0].resolver(resultado(4));
  await a.tick();
  assert.equal(a.ultimo().res.titles.length, 1, "la respuesta tardía no pisa lo restaurado");
});

test("CONTROL (comportamiento de 09b9dbe): si la generación sube recién en el timer, A se acepta como vigente", async () => {
  // Modelo del código viejo, con las mismas piezas: el número de pedido se
  // toma DENTRO del timer; entre el cambio de término y el timer de B, la
  // respuesta de A todavía coincide con el número vigente.
  let vigente = 0;
  const estados: string[] = [];
  const pendientes: (() => void)[] = [];
  const programarViejo = (fn: () => void) => { pendientes.push(fn); };
  const pedirViejo = (term: string) => ({ then: (cb: (t: string) => void) => { setTimeout(() => cb(term), 0); } });
  const cambiar = (term: string) => programarViejo(() => { const mio = ++vigente; pedirViejo(term).then((t) => { if (mio === vigente) estados.push(`pinta ${t}`); }); });
  cambiar("A"); pendientes.shift()!();            // sale A
  cambiar("B");                                   // B espera su debounce; `vigente` NO cambió
  await new Promise((r) => setTimeout(r, 5));    // responde A
  assert.deepEqual(estados, ["pinta A"], "el modelo viejo pinta A aunque el usuario ya escribió B");
});
