// E5b: "Más útiles". Wilson y desempates contra valores calculados aparte (Python,
// `math`, misma definición: límite inferior del intervalo de Wilson con z = 1,96),
// el núcleo de la lista con el orden congelado (vencimiento, un solo reinicio,
// respuestas de otro orden) y barridos de la migración. Las funciones reales
// (un solo orden con 20 lectores, 50 posiciones, cambios entre páginas) están
// en scripts/comunidad/pruebas-utiles.mjs, contra `supabase start`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compararUtiles, wilson } from "./wilson.ts";
import {
  alLlegarMas, alLlegarReinicio, claveLista, conPrimeraPagina, listaVacia, pedirMas, pedirReinicio, puedeReiniciar,
  tandaValida, trasVoto, type ItemLista, type Tanda,
} from "./lista-nucleo.ts";

// [positivos, total, esperado] — calculados con Python 3 (`math.sqrt`), fuera de este código.
const ESPERADOS: [number, number, number][] = [
  [0, 0, 0.0], [0, 1, 0.0], [1, 1, 0.20654329147389294], [1, 2, 0.09452865480086611], [2, 2, 0.3423719528896193],
  [3, 4, 0.30063605244263664], [5, 10, 0.2365895936154873], [9, 10, 0.5958436145024278], [10, 10, 0.7224598312333834],
  [50, 100, 0.40382982859014716], [90, 100, 0.8256326956323347], [285, 481, 0.548038148888899], [1, 3, 0.061490315276160515],
  [2, 6, 0.09676933255921684], [100, 100, 0.963005192523998], [0, 50, 0.0],
];

test("Wilson (z = 1,96): coincide con los valores calculados aparte; sin votos, 0", () => {
  for (const [p, n, e] of ESPERADOS) assert.ok(Math.abs(wilson(p, n) - e) < 1e-12, `${p}/${n}: ${wilson(p, n)} ≠ ${e}`);
  // Con 0 positivos, exactamente 0 (no un resto de coma flotante que desordene los empates en 0).
  for (let n = 0; n <= 100; n++) assert.equal(wilson(0, n), 0);
  // No es el porcentaje: 1/1 (100 %) queda por DEBAJO de 9/10 (90 %) y de 285/481 (59 %).
  assert.ok(wilson(1, 1) < wilson(9, 10) && wilson(1, 1) < wilson(285, 481));
  // Más votos con la misma proporción, más arriba.
  assert.ok(wilson(1, 2) < wilson(5, 10) && wilson(5, 10) < wilson(50, 100));
});

test("desempates documentados: Wilson desc → primera publicación desc → id desc", () => {
  const r = (id: number, positivos: number, total: number, publicada: number) => ({ id, positivos, total, publicada });
  const lista = [r(1, 1, 2, 100), r(2, 9, 10, 50), r(3, 1, 2, 300), r(4, 0, 0, 999), r(5, 1, 2, 300), r(6, 2, 4, 300), r(7, 0, 3, 1)];
  // 9/10 primero; 1/2 y 2/4 tienen la misma proporción pero 2/4 tiene más votos (Wilson mayor);
  // entre los 1/2: fecha desc (300, 300, 100) y, con la misma fecha, id desc (5 antes que 3);
  // sin votos y 0/3 empatan en 0: fecha desc (999 antes que 1).
  assert.deepEqual([...lista].sort(compararUtiles).map((x) => x.id), [2, 6, 5, 3, 1, 4, 7]);
});

// ---------------------------------------------------------------------------
// Núcleo de la lista con el orden congelado.
// ---------------------------------------------------------------------------
const it = (id: number, extra: Partial<ItemLista> = {}): ItemLista => ({
  resena_id: id, version_id: id * 10, texto: `t${id}`, publicada_en: "2026-10-26T00:00:00+00:00",
  editada: false, utiles: 0, total: 0, mi_voto: null, denunciada: false, ...extra,
});
const T = (ids: number[], cursor: string | null, extra: Partial<Tanda> = {}): Tanda =>
  ({ items: ids.map((i) => it(i)), cursor, hayMas: cursor !== null, orden: "utiles", vencido: false, ...extra });
const K = claveLista("u1", "movie", 603, "utiles");

test("tanda válida en «Más útiles»: puede traer menos de cinco o ninguna con más por delante; `orden_actualizado` es vacía y sin más", () => {
  assert.ok(tandaValida({ activo: true, orden: "utiles", items: [], hay_mas: true, cursor: "c" }, "utiles"));
  assert.equal(tandaValida({ activo: true, orden: "utiles", items: [it(1)], hay_mas: true, cursor: "c" }, "utiles")?.items.length, 1);
  const v = tandaValida({ activo: true, orden: "utiles", orden_actualizado: true, items: [], hay_mas: false, cursor: null }, "utiles");
  assert.deepEqual([v?.vencido, v?.items.length, v?.hayMas], [true, 0, false]);
  assert.equal(tandaValida({ activo: true, orden: "utiles", orden_actualizado: true, items: [it(1)], hay_mas: false, cursor: null }, "utiles"), null);
  assert.equal(tandaValida({ activo: true, orden: "recientes", items: [], hay_mas: false, cursor: null }, "utiles"), null, "otro orden");
});

test("vencimiento: la lista queda, avisa y permite volver a empezar UNA vez; el reinicio agrega sin repetir; un segundo vencimiento ya no ofrece otro", () => {
  let e = conPrimeraPagina(listaVacia(K), T([1, 2, 3, 4, 5], "c1"));
  let p = pedirMas(e)!;
  e = alLlegarMas(p.estado, p.pedido.n, K, T([], null, { vencido: true, hayMas: false }));
  assert.deepEqual([e.items.length, e.vencido, e.hayMas, e.cursor, puedeReiniciar(e)], [5, true, false, null, true]);
  assert.equal(pedirMas(e), null, "vencido: no hay Cargar más");
  // Volver a empezar: primera página del orden NUEVO (que trae 3 y 1, ya vistas).
  const r = pedirReinicio(e)!;
  assert.equal(pedirReinicio(r.estado), null, "un segundo toque mientras carga no pide otro");
  e = alLlegarReinicio(r.estado, r.pedido.n, K, T([3, 9, 1, 8, 7], "n1"));
  assert.deepEqual([e.items.map((x) => x.resena_id), e.vencido, e.reiniciado, e.cursor], [[1, 2, 3, 4, 5, 9, 8, 7], false, true, "n1"]);
  // Sigue normal en el orden nuevo, deduplicando.
  p = pedirMas(e)!;
  e = alLlegarMas(p.estado, p.pedido.n, K, T([2, 6], null));
  assert.deepEqual(e.items.map((x) => x.resena_id), [1, 2, 3, 4, 5, 9, 8, 7, 6]);
  // Un segundo vencimiento (si el nuevo también vence): aviso, pero sin otro reinicio (sin ciclos).
  e = conPrimeraPagina(listaVacia(K), T([1], "c"));
  e = { ...e, reiniciado: true };
  p = pedirMas(e)!;
  e = alLlegarMas(p.estado, p.pedido.n, K, T([], null, { vencido: true, hayMas: false }));
  assert.deepEqual([e.vencido, puedeReiniciar(e), pedirReinicio(e)], [true, false, null]);
});

test("reinicio que falla: lo visible queda y el reinicio todavía se puede reintentar; una respuesta de otro pedido no cuenta", () => {
  let e = conPrimeraPagina(listaVacia(K), T([1, 2], "c1"));
  const p = pedirMas(e)!;
  e = alLlegarMas(p.estado, p.pedido.n, K, T([], null, { vencido: true, hayMas: false }));
  const r = pedirReinicio(e)!;
  const fallo = alLlegarReinicio(r.estado, r.pedido.n, K, null);
  assert.deepEqual([fallo.items.length, fallo.errorMas, fallo.vencido, fallo.reiniciado, puedeReiniciar(fallo)], [2, true, true, false, true]);
  assert.equal(alLlegarReinicio(r.estado, r.pedido.n + 1, K, T([9], null)), r.estado, "otro pedido");
  assert.equal(alLlegarReinicio(r.estado, r.pedido.n, claveLista("u1", "movie", 603, "recientes"), T([9], null)), r.estado, "otro orden");
});

test("respuestas tardías de otro orden, cuenta o título no se aplican", () => {
  const e = conPrimeraPagina(listaVacia(K), T([1, 2, 3, 4, 5], "c1"));
  const p = pedirMas(e)!;
  for (const otra of [claveLista("u1", "movie", 603, "recientes"), claveLista("u2", "movie", 603, "utiles"), claveLista("u1", "movie", 604, "utiles")]) {
    assert.equal(alLlegarMas(p.estado, p.pedido.n, otra, T([9], null)), p.estado, otra);
  }
});

test("dentro del orden congelado votar cambia el CONTEO, no el lugar", () => {
  const e = conPrimeraPagina(listaVacia(K), T([1, 2, 3], "c1"));
  const v = trasVoto(e, 30, "voto_registrado", "util");
  assert.deepEqual(v.items.map((x) => x.resena_id), [1, 2, 3]);
  assert.deepEqual([v.items[2].utiles, v.items[2].total, v.items[2].mi_voto], [1, 1, "util"]);
  assert.deepEqual([v.cursor, v.hayMas], ["c1", true]);
});

// ---------------------------------------------------------------------------
// Barridos de la migración 018.
// ---------------------------------------------------------------------------
const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("barrido 018: filas de 100 ids, lock por título con doble búsqueda, 10 min / 2 h, 50 posiciones, sin datos del lector", () => {
  const s = leer("supabase/migrations/018_comunidad_utilidad.sql");
  assert.match(s, /check \(cardinality\(ids\) between 1 and 100\)/);
  assert.match(s, /\(pos \/ 100\)::integer/);
  const gen = s.slice(s.indexOf("function comunidad.orden_utiles"), s.indexOf("function public.comunidad_resenas"));
  const busqueda = /creado_en > clock_timestamp\(\) - interval '10 minutes' and vence_en > clock_timestamp\(\)/g;
  assert.equal(gen.match(busqueda)?.length, 2, "busca antes y después del lock");
  assert.ok(gen.indexOf("pg_advisory_xact_lock(7311") > gen.search(busqueda), "el lock va después de la primera búsqueda");
  assert.match(gen, /interval '2 hours'/);
  assert.match(gen, /comunidad\.wilson\(u\.positivos, u\.total\) desc,\s+r\.primera_publicacion_en desc, r\.id desc/);
  assert.match(s, /v_desde \/ 100 and \(v_desde \+ 49\) \/ 100/);
  assert.match(s, /w\.pos between v_desde and v_desde \+ 49/);
  assert.match(s, /else v_desde \+ 50 end/);
  // Las tablas del orden no tienen columnas de lector ni de cuenta.
  const tablas = s.slice(s.indexOf("create table if not exists comunidad.ordenes_utiles ("), s.indexOf("alter table comunidad.ordenes_utiles"));
  assert.doesNotMatch(tablas, /participante|user_id|lector|uid/);
  assert.match(s, /grant execute on function public\.comunidad_resenas\(text, integer, text, jsonb, integer\) to authenticated;/);
  assert.doesNotMatch(s, /grant[^;]*(orden_utiles|wilson)/);
});
