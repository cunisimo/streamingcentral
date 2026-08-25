import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAVE_EVIDENCIA, VENTANA_RECIENTE_MS, conPlataformaDeLaFuente, desdeSemana,
  evidenciaCacheada, evidenciaOficial, plataformasDeFicha, type FilaOficial,
} from "./top-plataformas.ts";
import type { BackendCache } from "./reparar-y-cachear.ts";
import type { MediaType, PlatformCode, UITitle } from "./types.ts";

const card = (platforms: PlatformCode[], type: MediaType = "tv"): UITitle => ({
  id: 322428, type, title: "Moria", year: 2026, runtime: null, poster: null,
  country: "AR", genres: [], platforms, tmdb: 7.5, hasEditorial: false,
});

test("sin proveedores en TMDB, la fuente pone la plataforma", () => {
  // El caso real: `tv/322428` ("Moria") entró #1 del top oficial de Netflix AR
  // de la semana 2026-08-16 y TMDB no tiene `watch/providers` en NINGUNA región
  // —estrenó el 14/08, dos días antes del cierre de esa semana—. La card la
  // pintaba en gris con "No está en tus plataformas" adentro del bloque de
  // Netflix, que es justamente donde no puede pasar.
  const r = conPlataformaDeLaFuente(card([]), "n");
  assert.deepEqual(r.platforms, ["n"]);
});

test("no muta el objeto de entrada: `platforms` es el array CACHEADO", () => {
  // `cardsByIds` devuelve `{ ...c }`, pero el array `platforms` sigue siendo la
  // MISMA referencia que guardó el cache (Redis en producción, memoria en un
  // cold start sin credenciales). Un `push` acá le agrega Netflix a la ficha
  // que ve el resto de la app.
  const original = card([]);
  const antes = original.platforms;
  const r = conPlataformaDeLaFuente(original, "n");
  assert.deepEqual(antes, [], "el array de entrada quedó tocado");
  assert.notEqual(r.platforms, antes, "devolvió el mismo array, no una copia");
});

test("si TMDB ya la trae, se devuelve el MISMO objeto", () => {
  // Sin copia inútil: 9 de cada 10 slots pasan por acá.
  const original = card(["n"]);
  assert.equal(conPlataformaDeLaFuente(original, "n"), original);
});

test("si TMDB dice que está en OTRA plataforma, no se toca", () => {
  // Éste es el límite de la regla y el motivo de que no sea un simple "agregá
  // la plataforma si falta". Que TMDB conozca el título y lo ubique en Prime
  // NO es un lag: es la señal de que la resolución del TSV agarró el título
  // equivocado (un homónimo). Netflix no puede haber reportado como visto en
  // Netflix algo que no está en Netflix, así que acá el dato en conflicto es
  // NUESTRO. Pintarla en gris es lo correcto: es la única pista visible de que
  // ese slot hay que revisarlo.
  const original = card(["p", "m"]);
  assert.equal(conPlataformaDeLaFuente(original, "n"), original);
  assert.deepEqual(original.platforms, ["p", "m"]);
});

// ============================================================================
// La misma evidencia, ahora para la FICHA
// ============================================================================

// Un instante fijo: martes 25/08/2026, 18:00 UTC. Las semanas del TSV son los
// domingos de cierre, así que respecto de este momento:
//
//   2026-08-23 ->  2,75 días  DENTRO de la ventana (la más nueva)
//   2026-08-16 ->  9,75 días  DENTRO
//   2026-08-09 -> 16,75 días  FUERA
const AHORA = Date.parse("2026-08-25T18:00:00Z");
const ULTIMA = "2026-08-23";
const ANTERIOR = "2026-08-16";
const VIEJA = "2026-08-09";

const MORIA = 322428;      // tv, resuelta, needs_review = false
const OPERATION = 284753;  // tv, resuelta por la consulta reducida -> needs_review = true

const fila = (
  week: string, category: MediaType, tmdb_id: number | null, needs_review = false,
): FilaOficial => ({ week, category, tmdb_id, needs_review });

// --- La ventana --------------------------------------------------------------

test("el corte del SQL es MÁS PERMISIVO que la regla, nunca al revés", () => {
  // La consulta compara cadenas y la regla milisegundos, y los bordes no caen
  // en el mismo instante (`week` se parsea como medianoche UTC y el día de la
  // app es el argentino). Con la holgura, una fila que la regla aceptaría no
  // puede quedar afuera del `where`.
  const corte = desdeSemana(AHORA);
  const limiteExacto = new Date(AHORA - VENTANA_RECIENTE_MS).toISOString().slice(0, 10);
  assert.ok(corte < limiteExacto, `${corte} tendría que ser anterior a ${limiteExacto}`);
});

test("Moria salió de la última semana pero sigue dentro de los 14 días", () => {
  // LA REGRESIÓN QUE ESTO EVITA. Mirando sólo la semana más nueva, el próximo
  // cron traía otras veinte filas, Moria dejaba de estar, y su ficha volvía
  // sola a "No está en streaming" sin que cambiara nada en TMDB ni acá.
  const filas = [
    fila(ULTIMA, "tv", 999001),
    fila(ULTIMA, "movie", 999002),
    fila(ANTERIOR, "tv", MORIA),
  ];
  assert.ok(evidenciaOficial(filas, AHORA).includes(`tv:${MORIA}`));
});

test("cuando la fila de Moria pasa los 14 días, deja de ser evidencia", () => {
  assert.deepEqual(evidenciaOficial([fila(VIEJA, "tv", MORIA)], AHORA), []);
});

test("la misma fila, un día antes de vencer, todavía cuenta", () => {
  // El borde, para que el test anterior no pase por el motivo equivocado.
  const casi = AHORA - VENTANA_RECIENTE_MS + 24 * 60 * 60 * 1000;
  const week = new Date(casi).toISOString().slice(0, 10);
  assert.deepEqual(evidenciaOficial([fila(week, "tv", MORIA)], AHORA), [`tv:${MORIA}`]);
});

// --- Qué filas valen ---------------------------------------------------------

test("una fila NUEVA dudosa no invalida una anterior confiable del mismo título", () => {
  // Esto ACUMULA en un conjunto, no resuelve por "la última gana". Que la
  // resolución de esta semana haya quedado dudosa no borra la evidencia de la
  // semana en que no lo estuvo.
  const filas = [
    fila(ANTERIOR, "tv", MORIA, false),
    fila(ULTIMA, "tv", MORIA, true),
  ];
  assert.deepEqual(evidenciaOficial(filas, AHORA), [`tv:${MORIA}`]);
});

test("needs_review = true: NO se infiere disponibilidad", () => {
  // `needs_review` marca las filas donde el título de TMDB no es el que publicó
  // Netflix. En el top se muestran igual (el peor caso es una card de más),
  // pero la ficha dice "Disponible en Netflix", y eso no se afirma sobre una
  // fila que nosotros mismos marcamos como dudosa.
  assert.deepEqual(evidenciaOficial([fila(ULTIMA, "tv", OPERATION, true)], AHORA), []);
});

test("sin tmdb_id no hay a qué ficha atribuirle nada", () => {
  assert.deepEqual(evidenciaOficial([fila(ULTIMA, "tv", null)], AHORA), []);
});

test("película y serie con el MISMO id siguen separadas", () => {
  // TMDB reutiliza los números entre tipos.
  const ids = evidenciaOficial([fila(ULTIMA, "movie", 1284041)], AHORA);
  assert.deepEqual(ids, ["movie:1284041"]);
  assert.ok(!ids.includes("tv:1284041"));
});

// --- La ficha ----------------------------------------------------------------

// Backend en memoria con la misma forma que el real, más un contador de
// consultas: varios de los tests de abajo son sobre la consulta que NO se hace.
function banco(filas: FilaOficial[] | "falla") {
  const almacen = new Map<string, unknown>();
  const estado = { consultas: 0, desde: [] as string[] };
  const backend: BackendCache = {
    async leer<T>(k: string) { return almacen.has(k) ? almacen.get(k) as T : null; },
    async escribir<T>(k: string, v: T) { almacen.set(k, v); },
  };
  const leerEvidencia = () => evidenciaCacheada({
    ahora: AHORA, backend,
    async consultar(desde) {
      estado.consultas++;
      estado.desde.push(desde);
      if (filas === "falla") return { filas: [], fallo: true };
      return { filas, fallo: false };
    },
  });
  return { leerEvidencia, estado, almacen };
}

const EN_TOP = [fila(ANTERIOR, "tv", MORIA), fila(ULTIMA, "tv", OPERATION, true)];

test("Moria: providers vacío + evidencia oficial confiable -> [n]", async () => {
  // El caso reportado. TMDB tiene la ficha de `tv/322428` pero
  // `/tv/322428/watch/providers` devuelve `results: {}` — ni AR ni ninguna otra
  // región—, así que la ficha decía "No está en streaming" para el #1 del top
  // oficial de Netflix.
  const b = banco(EN_TOP);
  assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia), ["n"]);
});

test("sin evidencia: sigue vacío", async () => {
  const b = banco([]);
  assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia), []);
});

test("un título que no está en el top no hereda nada", async () => {
  const b = banco(EN_TOP);
  assert.deepEqual(await plataformasDeFicha("tv", 999999, [], b.leerEvidencia), []);
});

test("Operation, que quedó con needs_review, no hereda por la ficha", async () => {
  const b = banco(EN_TOP);
  assert.deepEqual(await plataformasDeFicha("tv", OPERATION, [], b.leerEvidencia), []);
});

test("si Supabase se cae, NO se inventa disponibilidad", async () => {
  // Una caída de nuestra base no puede producir una afirmación sobre dónde ver
  // algo. Nunca al revés: la ficha se queda como estaba.
  const b = banco("falla");
  assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia), []);
});

test("un fallo NO se cachea: el pedido siguiente vuelve a consultar", async () => {
  // Congelar cinco minutos de "no sé" dejaría la ficha rota justo después de
  // arreglar la base.
  const b = banco("falla");
  await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia);
  await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia);
  assert.equal(b.estado.consultas, 2);
  assert.equal(b.almacen.size, 0, "guardó un resultado fallido");
});

test("Operation conserva Netflix desde TMDB, y no se consulta la evidencia", async () => {
  // `tv/284753` sí tiene proveedores en TMDB (Netflix AR). Como TMDB ya sabe,
  // la evidencia ni se lee: cero consultas en el camino normal, que es el de
  // casi todas las fichas.
  const b = banco(EN_TOP);
  const deTmdb: PlatformCode[] = ["n"];
  assert.equal(await plataformasDeFicha("tv", OPERATION, deTmdb, b.leerEvidencia), deTmdb);
  assert.equal(b.estado.consultas, 0, "consultó teniendo datos de TMDB");
});

test("con otra plataforma en TMDB tampoco se consulta ni se agrega Netflix", async () => {
  const b = banco(EN_TOP);
  const deTmdb: PlatformCode[] = ["p"];
  assert.equal(await plataformasDeFicha("tv", MORIA, deTmdb, b.leerEvidencia), deTmdb);
  assert.equal(b.estado.consultas, 0);
});

test("la primera ficha vacía consulta UNA vez; las siguientes son HIT", async () => {
  const b = banco(EN_TOP);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia), ["n"]);
  }
  // Y otra ficha vacía distinta comparte la MISMA entrada: la clave es fija, no
  // lleva el id del título.
  await plataformasDeFicha("tv", 999999, [], b.leerEvidencia);
  assert.equal(b.estado.consultas, 1, "consultó más de una vez con el cache caliente");
  assert.deepEqual([...b.almacen.keys()], [CLAVE_EVIDENCIA]);
});

test("la consulta se filtra por fecha, no por la última semana", async () => {
  // Una sola consulta por MISS, y con el corte calculado de la fecha: no hay
  // una consulta previa que pregunte cuál es la última semana.
  const b = banco(EN_TOP);
  await plataformasDeFicha("tv", MORIA, [], b.leerEvidencia);
  assert.deepEqual(b.estado.desde, [desdeSemana(AHORA)]);
});

test("no muta el array CACHEADO de providersOf", async () => {
  // `providersOf` cachea `{ codes, links, watchLink }` y `codes` es el array
  // guardado. Un `push` acá le mete Netflix a todas las superficies que
  // compartan esa entrada de cache.
  const cacheado: PlatformCode[] = [];
  const b = banco(EN_TOP);
  const r = await plataformasDeFicha("tv", MORIA, cacheado, b.leerEvidencia);
  assert.deepEqual(cacheado, [], "el array cacheado quedó tocado");
  assert.notEqual(r, cacheado, "devolvió el mismo array en vez de uno nuevo");
});
