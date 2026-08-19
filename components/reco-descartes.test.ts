import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clave, encolar, paginar, resolverAviso, seMuestra, visibles, _limpiarCola } from "./reco-descartes.ts";

beforeEach(() => _limpiarCola());

const card = (type: "movie" | "tv", id: number) => ({ type, id });
const RIEL = [
  card("movie", 1), card("tv", 2), card("movie", 3), card("tv", 4), card("movie", 5),
  card("tv", 6), card("movie", 7), card("tv", 8), card("movie", 9), card("tv", 10),
  card("movie", 11),
];

// --- filtrar y deshacer ------------------------------------------------------

test("descartar saca esa tarjeta y ninguna otra", () => {
  const vis = visibles(RIEL, new Set([clave("movie", 3)]));
  assert.equal(vis.length, 10);
  assert.ok(!vis.some((t) => t.id === 3 && t.type === "movie"));
});

test("la clave distingue película de serie con el mismo id", () => {
  // TMDB numera películas y series por separado: el id 1 existe en las dos.
  // Descartar la película 1 no puede llevarse la serie 1.
  const vis = visibles([card("movie", 1), card("tv", 1)], new Set([clave("movie", 1)]));
  assert.deepEqual(vis, [card("tv", 1)]);
});

test("deshacer devuelve la tarjeta a su posición original", () => {
  // El criterio de aceptación. No hay índices guardados: la posición sale del
  // orden del payload, así que restaurar es sacar la clave del Set.
  const antes = visibles(RIEL, new Set());
  const conDescarte = new Set([clave("movie", 5)]);
  assert.equal(visibles(RIEL, conDescarte).findIndex((t) => t.id === 7), 5);

  const deshecho = new Set(conDescarte);
  deshecho.delete(clave("movie", 5));
  assert.deepEqual(visibles(RIEL, deshecho), antes);
  assert.equal(visibles(RIEL, deshecho).findIndex((t) => t.id === 5), 4);
});

test("descartar de a varias saca exactamente esas", () => {
  const vis = visibles(RIEL, new Set([clave("movie", 1), clave("tv", 8), clave("movie", 11)]));
  assert.deepEqual(vis.map((t) => t.id), [2, 3, 4, 5, 6, 7, 9, 10]);
});

// --- los dos pisos, que son distintos ---------------------------------------

test("el riel no aparece si el servidor trajo menos de 10", () => {
  assert.equal(seMuestra(9, 9), false);
});

test("descartar NO esconde el riel aunque quede bajo 10", () => {
  // El borde que importa: 11 traídas, se descartan 3, quedan 8. El riel sigue.
  // Aplicar el piso de 10 acá lo haría desaparecer entero por haber descartado
  // una sola tarjeta de más, que es lo contrario de lo que la persona pidió.
  assert.equal(seMuestra(11, 8), true);
  assert.equal(seMuestra(10, 1), true);
});

test("el riel se esconde solo cuando no queda ninguna", () => {
  assert.equal(seMuestra(11, 0), false);
});

// --- el orden de las escrituras ---------------------------------------------

test("deshacer espera al descarte del mismo título", async () => {
  // La carrera silenciosa: descartar es un INSERT y deshacer un DELETE. Si el
  // DELETE corre primero, el INSERT aterriza después y el título queda
  // descartado para siempre con la tarjeta visible. Nada avisa.
  const orden: string[] = [];
  const k = clave("movie", 42);

  const insert = encolar(k, async () => {
    await new Promise((r) => setTimeout(r, 30));   // el INSERT tarda
    orden.push("insert");
  });
  const del = encolar(k, async () => { orden.push("delete"); });

  await Promise.all([insert, del]);
  assert.deepEqual(orden, ["insert", "delete"]);
});

test("títulos distintos no se bloquean entre sí", async () => {
  const orden: string[] = [];
  const lento = encolar(clave("movie", 1), async () => {
    await new Promise((r) => setTimeout(r, 30));
    orden.push("lento");
  });
  const rapido = encolar(clave("movie", 2), async () => { orden.push("rapido"); });
  await Promise.all([lento, rapido]);
  assert.deepEqual(orden, ["rapido", "lento"], "el segundo título no espera al primero");
});

test("un fallo no traba la cola de ese título", async () => {
  // Si el INSERT falla, el DELETE de deshacer tiene que correr igual.
  const k = clave("tv", 7);
  const roto = encolar(k, async () => { throw new Error("sin red"); });
  await assert.rejects(roto);

  let corrio = false;
  await encolar(k, async () => { corrio = true; });
  assert.equal(corrio, true);
});

test("dos descartes seguidos del mismo título se serializan", async () => {
  const orden: string[] = [];
  const k = clave("movie", 99);
  const a = encolar(k, async () => { await new Promise((r) => setTimeout(r, 20)); orden.push("a"); });
  const b = encolar(k, async () => { await new Promise((r) => setTimeout(r, 1)); orden.push("b"); });
  await Promise.all([a, b]);
  assert.deepEqual(orden, ["a", "b"]);
});

// --- leer los descartes: completo o nada ------------------------------------

const fila = (n: number) => ({ tmdb_id: n, tipo: "movie" as const });
const ok = <T,>(data: T[]) => Promise.resolve({ data, error: null });

test("una sola página: una llamada y listo", async () => {
  const pedidos: [number, number][] = [];
  const r = await paginar((d, h) => { pedidos.push([d, h]); return ok([fila(1), fila(2)]); }, 500);
  assert.equal(r.length, 2);
  assert.deepEqual(pedidos, [[0, 499]], "no pide una segunda página si la primera vino incompleta");
});

test("pagina de verdad cuando alguien pasa el tamaño de página", async () => {
  // El caso excepcional: el costo extra existe SOLO para quien supera el límite.
  const llena = Array.from({ length: 3 }, (_, i) => fila(i));
  let n = 0;
  const r = await paginar(() => (++n <= 2 ? ok(llena) : ok([fila(99)])), 3);
  assert.equal(r.length, 7, "3 + 3 + 1");
  assert.equal(n, 3);
});

test("NO devuelve descartes parciales si falla la primera página", async () => {
  // Devolver [] acá haría reaparecer TODOS los descartes en silencio.
  await assert.rejects(
    () => paginar(() => Promise.resolve({ data: null, error: "500 boom" }), 3),
    /No se pudieron leer los descartes/,
  );
});

test("NO devuelve descartes parciales si falla una página POSTERIOR", async () => {
  // El caso traicionero: la primera anduvo, así que hay datos en la mano y la
  // tentación es devolver eso. Sería una lista incompleta, y los que faltan
  // vuelven a aparecer sin ningún error que lo explique.
  const llena = [fila(1), fila(2), fila(3)];
  let n = 0;
  await assert.rejects(
    () => paginar(() => (++n === 1 ? ok(llena) : Promise.resolve({ data: null, error: "timeout" })), 3),
    /No se pudieron leer los descartes/,
  );
  assert.equal(n, 2, "falló en la segunda, no antes");
});

// --- respuestas que llegan tarde --------------------------------------------

const AV = (id: number) => ({ id, k: `movie:${id}`, titulo: `T${id}` });

test("el fallo tardío de A no pisa el aviso de B", async () => {
  // Descartás A, después B —el aviso ya es de B— y recién ahí falla el guardado
  // de A. Sin la comprobación, A borra el "Deshacer" de B y muestra un error de
  // una tarjeta que ya no está en pantalla.
  const r = resolverAviso(AV(2), 1, true);
  assert.deepEqual(r.aviso, AV(2), "el aviso de B sigue ahí");
  assert.equal(r.mostrarError, false, "y no aparece el error de A");
});

test("el fallo de la acción vigente sí se muestra", () => {
  const r = resolverAviso(AV(1), 1, true);
  assert.equal(r.aviso, null);
  assert.equal(r.mostrarError, true);
});

test("después de deshacer, un fallo tardío no muestra ningún error", () => {
  // Deshacer deja el aviso en null. Si el INSERT falla después, no hay nada que
  // reportar: la persona ya revirtió esa acción.
  const r = resolverAviso(null, 1, true);
  assert.equal(r.aviso, null);
  assert.equal(r.mostrarError, false);
});

test("que el guardado salga bien no toca el aviso: Deshacer sigue disponible", () => {
  const r = resolverAviso(AV(1), 1, false);
  assert.deepEqual(r.aviso, AV(1));
  assert.equal(r.mostrarError, false);
});
