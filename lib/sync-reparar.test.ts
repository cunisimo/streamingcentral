// La reparación de idioma DEL SYNC, con TMDB simulado.
//
// Vive en `lib/` para que la levante `npm test`, pero prueba
// `supabase/functions/tmdb-sync/lib/reparar.ts` — el módulo real que corre en la
// Edge Function. Se puede importar desde Node porque no usa una sola API de
// Deno: solo el núcleo compartido y `console`.
//
// ============================================================================
// LO QUE ESTOS TESTS FIJAN, Y POR QUÉ COSTÓ DOS INTENTOS LLEGAR ACÁ
// ============================================================================
// La política del sync no puede ser la de la app —allá un respaldo caído se
// resuelve sirviendo la base y no cacheándola; acá lo que se escribe se
// persiste— pero tampoco puede ser "descarto todo lo que no mejoró":
//
//   1. La primera versión descartaba cualquier cosa que el respaldo no mejorara.
//      En la primera corrida real tiró 79 títulos de 120, casi todos SIN
//      SINOPSIS EN NINGÚN IDIOMA. El descubrimiento bajó a un tercio.
//   2. La segunda escribía cualquier cosa que el respaldo no mejorara, y con eso
//      habría escrito un título coreano que es-ES tenía en español.
//
// Las dos preguntaban "¿la fusión cambió algo?". La pregunta correcta es "¿QUÉ
// SIGUE ROTO después de fusionar?", campo por campo. Estos tests fijan las dos
// ramas para que no se vuelvan a juntar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  nombreDeEpisodioRoto, nuevasMetricas, repararLista, repararNombreEpisodio,
  sumarEpisodio, sumarLote, tituloIlegible,
} from "../supabase/functions/tmdb-sync/lib/reparar.ts";
import { aBorrar } from "../supabase/functions/tmdb-sync/lib/reconciliar.ts";

const ACTIVO = true;
const coreano = (id: number) => ({
  id, title: "런닝맨", overview: "hay sinopsis",
  original_name: "런닝맨", original_language: "ko",
});
const sinSinopsis = (id: number) => ({
  id, title: "Un título normal", overview: "",
  original_name: "A Normal Title", original_language: "en",
});

// ============================================================================
// LOS SEIS CASOS DE LA POLÍTICA
// ============================================================================

test("1. sinopsis vacía en LOS DOS idiomas: SE ESCRIBE", async () => {
  const base = [sinSinopsis(1)];
  const r = await repararLista(base, async () => [{ id: 1, title: "Un título normal", overview: "" }], "p1", ACTIVO);
  assert.deepEqual(r.items, base, "el título entra a la corrida");
  assert.equal(r.sinopsisSinMejora, 1);
  assert.equal(r.titulosIlegiblesDescartados, 0);
  assert.equal(r.fallo, false);
});

test("2. título coreano en LOS DOS idiomas: se DESCARTA el candidato", async () => {
  const base = [coreano(1)];
  const r = await repararLista(base, async () => [{ id: 1, title: "런닝맨", overview: "hay sinopsis" }], "p1", ACTIVO);
  assert.deepEqual(r.items, [], "no se escribe: la fila anterior sobrevive");
  assert.equal(r.titulosIlegiblesDescartados, 1);
  assert.equal(r.sinopsisSinMejora, 0);
  assert.equal(r.fallo, false, "el respaldo respondió: no es una caída de transporte");
});

test("3. título roto REPARADO pero sinopsis todavía vacía: SE ESCRIBE", async () => {
  // El caso que obliga a evaluar el resultado y no la referencia: la fusión SÍ
  // cambió algo (el título), pero queda un campo roto. Lo que decide es cuál.
  const base = [{ id: 1, title: "런닝맨", overview: "", original_name: "런닝맨", original_language: "ko" }];
  const r = await repararLista(base, async () => [{ id: 1, title: "Running Man", overview: "" }], "p1", ACTIVO);
  assert.equal(r.items.length, 1, "se escribe: el título quedó legible");
  assert.equal(r.items[0].title, "Running Man");
  assert.equal(r.items[0].overview, "", "la sinopsis sigue vacía y está bien");
  assert.equal(r.reparados, 1);
  assert.equal(r.sinopsisSinMejora, 1);
  assert.equal(r.titulosIlegiblesDescartados, 0);
});

test("4. episodio vacío en LOS DOS idiomas: se CONSERVA vacío", async () => {
  const r = await repararNombreEpisodio("", async () => "", "tv:1 T1E1", ACTIVO);
  assert.equal(r.descartar, false, "un episodio sin nombre no es un dato corrupto");
  assert.equal(r.nombre, null);
  assert.equal(r.motivo, "sin-nombre");
});

test("5. episodio NO LATINO en los dos idiomas: se DESCARTA el candidato", async () => {
  const r = await repararNombreEpisodio("런닝맨", async () => "런닝맨", "tv:2 T1E1", ACTIVO);
  assert.equal(r.descartar, true, "persistir un nombre ilegible es peor que la fila anterior");
  assert.equal(r.nombre, null);
  assert.equal(r.motivo, "no-reparado");
});

test("6. respaldo CAÍDO se distingue de respaldo válido sin mejora", async () => {
  const caido = await repararNombreEpisodio("", async () => { throw new Error("TMDB 502"); }, "tv:3", ACTIVO);
  assert.equal(caido.motivo, "fallo");
  assert.equal(caido.descartar, true, "no se pudo mirar: no se escribe");

  const valido = await repararNombreEpisodio("", async () => "", "tv:4", ACTIVO);
  assert.equal(valido.motivo, "sin-nombre");
  assert.equal(valido.descartar, false);

  // Y en el lote, lo mismo: la caída saca a los rotos; la respuesta inútil no.
  const cae = await repararLista([sinSinopsis(1)], async () => { throw new Error("x"); }, "p", ACTIVO);
  assert.equal(cae.fallo, true);
  assert.deepEqual(cae.items, [], "con transporte caído no se escribe lo dudoso");

  const responde = await repararLista([sinSinopsis(1)], async () => [], "p", ACTIVO);
  assert.equal(responde.fallo, false);
  assert.equal(responde.items.length, 1, "respondió: la sinopsis vacía se escribe igual");
  assert.equal(responde.sinopsisSinMejora, 1);
});

// ============================================================================
// Lo que NO cambió: el ahorro de llamadas y el interruptor
// ============================================================================

test("página sin rotos: no se pide respaldo", async () => {
  let pedidos = 0;
  const base = [{ id: 1, title: "Uno", overview: "a" }, { id: 2, title: "Dos", overview: "b" }];
  const r = await repararLista(base, async () => { pedidos++; return []; }, "p1", ACTIVO);
  assert.equal(pedidos, 0);
  assert.equal(r.llamadas, 0);
  assert.deepEqual(r.items, base);
});

test("UNA llamada repara toda la página, no una por título", async () => {
  let pedidos = 0;
  const base = [coreano(1), coreano(2), { id: 3, title: "Sano", overview: "c" }];
  const r = await repararLista(base, async () => {
    pedidos++;
    return [{ id: 1, title: "Running Man" }, { id: 2, title: "Dos chicas sin blanca" }];
  }, "p1", ACTIVO);
  assert.equal(pedidos, 1, "dos rotos, una sola llamada");
  assert.equal(r.reparados, 2);
  assert.equal(r.items.length, 3);
});

test("un episodio SANO no cuesta una llamada", async () => {
  let pedidos = 0;
  const r = await repararNombreEpisodio("Se acerca el invierno", async () => { pedidos++; return "x"; }, "tv", ACTIVO);
  assert.equal(pedidos, 0);
  assert.equal(r.motivo, "ok");
  assert.equal(r.nombre, "Se acerca el invierno");
});

test("con el fallback APAGADO nada se descarta ni se pide", async () => {
  let pedidos = 0;
  const base = [coreano(1)];
  const r = await repararLista(base, async () => { pedidos++; return []; }, "p1", false);
  assert.equal(pedidos, 0);
  assert.deepEqual(r.items, base);
  assert.equal(r.titulosIlegiblesDescartados, 0);

  const ep = await repararNombreEpisodio("", async () => { pedidos++; return "x"; }, "tv", false);
  assert.equal(ep.descartar, false);
  assert.equal(pedidos, 0);
});

test("nombreDeEpisodioRoto: vacío y no latino, nada más", () => {
  assert.equal(nombreDeEpisodioRoto(""), true);
  assert.equal(nombreDeEpisodioRoto(null), true);
  assert.equal(nombreDeEpisodioRoto("  "), true);
  assert.equal(nombreDeEpisodioRoto("런닝맨"), true);
  assert.equal(nombreDeEpisodioRoto("Episodio 1"), false);
  assert.equal(nombreDeEpisodioRoto("Winter Is Coming"), false);
});

// ============================================================================
// MÉTRICAS: separadas por consecuencia, y una por invocación
// ============================================================================

test("las métricas separan lo que se escribe de lo que queda afuera", async () => {
  const m = nuevasMetricas();
  // Una página con: una sinopsis irreparable (se escribe) y un título coreano
  // irreparable (no se escribe).
  sumarLote(m, await repararLista(
    [sinSinopsis(1), coreano(2)],
    async () => [{ id: 1, title: "Un título normal", overview: "" }, { id: 2, title: "런닝맨" }],
    "p1", ACTIVO,
  ));
  sumarEpisodio(m, await repararNombreEpisodio("", async () => "", "ep1", ACTIVO));
  sumarEpisodio(m, await repararNombreEpisodio("런닝맨", async () => "런닝맨", "ep2", ACTIVO));
  sumarEpisodio(m, await repararNombreEpisodio("", async () => { throw new Error("x"); }, "ep3", ACTIVO));

  assert.deepEqual(m, {
    llamadas: 4,
    reparados: 0,
    sinopsisSinMejora: 1,               // se escribió
    titulosOriginalesLegibles: 0,
    titulosIlegiblesDescartados: 1,     // quedó afuera
    episodioSinNombre: 1,               // se conservó vacío
    episodioNoReparado: 1,              // quedó afuera
    fallos: 1,                          // transporte
  });
});

const demora = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("dos corridas CONCURRENTES no se contaminan las métricas", async () => {
  async function corrida(rotos: number, ms: number) {
    const metricas = nuevasMetricas();
    const base = Array.from({ length: rotos }, (_, i) => coreano(i + 1));
    sumarLote(metricas, await repararLista(base, async () => {
      await demora(ms);                                  // acá se intercalan
      return base.map((t) => ({ id: t.id, title: `Reparado ${t.id}` }));
    }, "concurrente", ACTIVO));
    await demora(ms);
    sumarEpisodio(metricas, await repararNombreEpisodio("", async () => "Nombre bueno", "ep", ACTIVO));
    return metricas;
  }

  const [a, b] = await Promise.all([corrida(3, 20), corrida(7, 5)]);
  // Con un acumulador de módulo las dos habrían visto 10 reparados + 2 episodios.
  assert.equal(a.reparados, 4, "la corrida A ve SOLO sus 3 títulos + 1 episodio");
  assert.equal(b.reparados, 8, "la corrida B ve SOLO sus 7 títulos + 1 episodio");
  assert.equal(a.fallos, 0);
  assert.equal(b.fallos, 0);
});

test("una corrida que arranca no le borra las métricas a la que ya corría", () => {
  const vieja = nuevasMetricas();
  sumarLote(vieja, {
    items: [], titulosOriginalesLegibles: 1, titulosIlegiblesDescartados: 2,
    sinopsisSinMejora: 3, reparados: 5, llamadas: 1, fallo: true,
  });
  const nueva = nuevasMetricas();
  assert.equal(nueva.reparados, 0);
  assert.equal(vieja.reparados, 5);
  assert.equal(vieja.titulosIlegiblesDescartados, 2);
  assert.equal(vieja.fallos, 1);
});

// --- El barrido que impide la regresión -------------------------------------
// Los tests de arriba prueban que el DISEÑO parametrizado aísla. Este prueba que
// el sync de verdad lo usa: sin él, alguien podría volver a poner un acumulador
// de módulo y todo seguiría en verde, porque prueban los helpers y no el sync.

test("BARRIDO: sync-upcoming.ts no tiene estado mutable de métricas en el módulo", () => {
  const src = readFileSync(join("supabase", "functions", "tmdb-sync", "jobs", "sync-upcoming.ts"), "utf8");
  const enModulo = src.split("\n").filter((l) => /^(const|let|var)\s+metricas\b/.test(l));
  assert.deepEqual(enModulo, [], `las métricas volvieron a ser estado de módulo:\n${enModulo.join("\n")}`);
  assert.match(src, /const metricas = nuevasMetricas\(\);/);
  assert.match(src, /metricas: MetricasIdioma/);
});

test("BARRIDO: el resultado del sync informa los cuatro motivos por separado", () => {
  const src = readFileSync(join("supabase", "functions", "tmdb-sync", "jobs", "sync-upcoming.ts"), "utf8");
  for (const campo of ["sinopsis_sin_mejora", "titulos_originales_legibles",
    "episodio_sin_nombre", "titulos_ilegibles_descartados", "episodio_no_reparado", "fallos"]) {
    assert.match(src, new RegExp(campo), `falta ${campo} en el resultado del job`);
  }
});

// ============================================================================
// EL CORTE DEFINITIVO: legible se conserva, ilegible se descarta
// ============================================================================
// La versión anterior descartaba todo lo que "seguía roto" según el predicado, y
// ahí caían 37 títulos de 120 — 30 de ellos con nombres perfectamente legibles
// ("Le bruit des souvenirs", "Yandakiler", "The Povera"), que son el nombre real
// de esas obras porque TMDB no las tradujo a ningún español.
//
// Y había un problema de fondo: esa rama NO PODÍA proteger de una regresión de
// idioma. Si es-ES tuviera un título mejor, `fusionarPorCampo` ya lo habría
// usado y el título saldría reparado. O sea que solo se disparaba cuando el dato
// ya estaba igual de mal antes del cambio.
//
// Lo que queda es un PISO DE CALIDAD sobre el resultado final: vacío o no
// latino, afuera. Todo lo demás entra.

const francés = (id: number) => ({
  id, title: "Le bruit des souvenirs", overview: "Une histoire.",
  original_title: "Le bruit des souvenirs", original_language: "fr",
});

test("título francés en alfabeto latino, IGUAL en los dos idiomas: se CONSERVA", async () => {
  const base = [francés(1)];
  const r = await repararLista(base, async () => [
    { id: 1, title: "Le bruit des souvenirs", overview: "Une histoire." },
  ], "p1", ACTIVO);
  assert.deepEqual(r.items, base, "es el nombre real de la obra");
  assert.equal(r.titulosOriginalesLegibles, 1);
  assert.equal(r.titulosIlegiblesDescartados, 0);
});

test("título turco en alfabeto latino, igual en los dos: se CONSERVA", async () => {
  const base = [{
    id: 2, title: "Yandakiler", overview: "Bir hikaye.",
    original_name: "Yandakiler", original_language: "tr",
  }];
  const r = await repararLista(base, async () => [{ id: 2, title: "Yandakiler", overview: "Bir hikaye." }], "p1", ACTIVO);
  assert.equal(r.items.length, 1);
  assert.equal(r.titulosOriginalesLegibles, 1);
});

test("título coreano IGUAL en los dos idiomas: se DESCARTA", async () => {
  const r = await repararLista([coreano(3)], async () => [{ id: 3, title: "런닝맨", overview: "hay sinopsis" }], "p1", ACTIVO);
  assert.deepEqual(r.items, []);
  assert.equal(r.titulosIlegiblesDescartados, 1);
  assert.equal(r.titulosOriginalesLegibles, 0);
});

test("título coreano REPARADO por es-ES: se conserva reparado", async () => {
  const r = await repararLista([coreano(4)], async () => [{ id: 4, title: "Running Man", overview: "hay sinopsis" }], "p1", ACTIVO);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].title, "Running Man");
  assert.equal(r.reparados, 1);
  assert.equal(r.titulosIlegiblesDescartados, 0);
  assert.equal(r.titulosOriginalesLegibles, 0, "quedó traducido: no es un original sin traducción");
});

test("título INGLÉS original: se conserva y ni siquiera cuenta como original sin traducción", async () => {
  // `en` está excluido del predicado a propósito: en Argentina "Game of Thrones"
  // ES el nombre publicado. Entra por la rama de la sinopsis vacía.
  const base = [{
    id: 5, title: "Sakamoto Days", overview: "",
    original_name: "Sakamoto Days", original_language: "en",
  }];
  const r = await repararLista(base, async () => [{ id: 5, title: "Sakamoto Days", overview: "" }], "p1", ACTIVO);
  assert.deepEqual(r.items, base);
  assert.equal(r.titulosOriginalesLegibles, 0);
  assert.equal(r.sinopsisSinMejora, 1);
});

test("título VACÍO en los dos idiomas: se DESCARTA", async () => {
  const base = [{ id: 6, title: "", overview: "hay sinopsis", original_title: "", original_language: "fr" }];
  const r = await repararLista(base, async () => [{ id: 6, title: "", overview: "hay sinopsis" }], "p1", ACTIVO);
  assert.deepEqual(r.items, [], "una fila sin título viola el NOT NULL de la tabla");
  assert.equal(r.titulosIlegiblesDescartados, 1);
});

test("tituloIlegible: solo vacío y no latino, nunca por coincidir con el original", () => {
  assert.equal(tituloIlegible({ title: "" }), true);
  assert.equal(tituloIlegible({ title: "   " }), true);
  assert.equal(tituloIlegible({ title: "런닝맨" }), true);
  assert.equal(tituloIlegible({ title: "破产姐妹" }), true);
  assert.equal(tituloIlegible({ title: "Le bruit des souvenirs" }), false);
  assert.equal(tituloIlegible({ title: "Yandakiler" }), false);
  assert.equal(tituloIlegible({ name: "Hibernacija" }), false);
  assert.equal(tituloIlegible({ title: "Sueño de fuga" }), false);
});

// ============================================================================
// UN DESCARTE NO PUEDE BORRAR LA FILA ANTERIOR
// ============================================================================
// Es la propiedad que hace que descartar sea seguro. Si un candidato descartado
// terminara en la lista de borrado, "no escribir" sería PEOR que escribir mal:
// se perdería el dato viejo, que estaba bien.

test("un candidato DESCARTADO no entra a la lista de borrado", () => {
  // `evaluados` son los que sobrevivieron a la reparación. El descartado no está
  // ahí —repararLista lo sacó antes—, así que no puede aparecer en `aBorrar`.
  const evaluados = [
    { tmdb_id: 100, media_type: "tv" as const },   // se evaluó y se conservó
    { tmdb_id: 200, media_type: "tv" as const },   // se evaluó y perdió providers
  ];
  const conservados = [{ tmdb_id: 100, media_type: "tv" as const }];
  const borrar = aBorrar(evaluados, conservados, "tv");
  assert.deepEqual(borrar, [200], "solo el que se evaluó y perdió providers");
  assert.ok(!borrar.includes(300), "el descartado (300) ni figura: nunca fue evaluado");
});

test("aBorrar separa por tipo y no mezcla ids entre movie y tv", () => {
  const evaluados = [
    { tmdb_id: 1399, media_type: "tv" as const },
    { tmdb_id: 1399, media_type: "movie" as const },
  ];
  const conservados = [{ tmdb_id: 1399, media_type: "tv" as const }];
  assert.deepEqual(aBorrar(evaluados, conservados, "tv"), []);
  assert.deepEqual(aBorrar(evaluados, conservados, "movie"), [1399],
    "el id se repite entre tipos: la clave es el par, no el número");
});
