// La reparación de idioma DEL SYNC, con TMDB simulado.
//
// Vive en `lib/` para que la levante `npm test`, pero prueba
// `supabase/functions/tmdb-sync/lib/reparar.ts` — el módulo real que corre en la
// Edge Function. Se puede importar desde Node porque no usa una sola API de
// Deno: solo el núcleo compartido y `console`.
//
// LO QUE ESTOS TESTS PROTEGEN. En la app, un respaldo caído se resuelve sirviendo
// la base sin reparar y no cacheándola. En el sync no: lo que se escribe queda en
// la base hasta que otro sync alcance ese título, y el descubrimiento mira 3
// páginas por popularidad, así que puede no llegar nunca. Por eso acá "no se
// pudo reparar" tiene que significar "esta fila no se toca", no "se escribe como
// venga".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  nombreDeEpisodioRoto, nuevasMetricas, repararLista, repararNombreEpisodio,
  sumarEpisodio, sumarLote,
} from "../supabase/functions/tmdb-sync/lib/reparar.ts";

const ACTIVO = true;

// ============================================================================
// EL NOMBRE DEL EPISODIO — los cuatro casos
// ============================================================================
// El bug que corrigen: la condición de descarte exigía que el nombre base
// tuviera texto, así que "base vacía + respaldo caído" NO descartaba y terminaba
// escribiendo `episode_name: null` sobre una fila que tenía un nombre bueno.

test("base VACÍA + respaldo CAÍDO: se descarta la serie, no se escribe null", async () => {
  const r = await repararNombreEpisodio(
    "", async () => { throw new Error("TMDB 500"); }, "tv:1 T1E1", ACTIVO,
  );
  assert.equal(r.descartar, true, "tiene que descartarse");
  assert.equal(r.nombre, null);
  assert.equal(r.llamadas, 1);
  assert.equal(r.reparado, false);
});

// CORREGIDO DESPUES DE LA PRIMERA CORRIDA REAL. Antes esto descartaba, y estaba
// mal: si el episodio no tiene nombre en NINGUN idioma, el cambio de idioma no
// rompio nada — el sync viejo escribia null igual. Descartar la serie por eso
// tiraba cobertura sin proteger nada. Se protege contra NO PODER MIRAR, no
// contra "mire y no habia nada mejor".
test("base VACÍA + respaldo VACÍO: NO se descarta, se conserva la base", async () => {
  const r = await repararNombreEpisodio("", async () => "", "tv:2 T1E1", ACTIVO);
  assert.equal(r.descartar, false, "el respaldo respondió: no hay nada de qué protegerse");
  assert.equal(r.nombre, null, "la base era vacía y sigue vacía, como antes del cambio");
  assert.equal(r.reparado, false);
});

test("base VACÍA + respaldo con espacios: tampoco descarta", async () => {
  const r = await repararNombreEpisodio("", async () => "   ", "tv:2b T1E1", ACTIVO);
  assert.equal(r.descartar, false);
  assert.equal(r.nombre, null);
});

test("base NO LATINA + respaldo CAÍDO: se descarta (la llamada falló)", async () => {
  const r = await repararNombreEpisodio(
    "런닝맨", async () => { throw new Error("timeout"); }, "tv:3 T1E1", ACTIVO,
  );
  assert.equal(r.descartar, true);
  assert.equal(r.nombre, null, "no devuelve el valor roto para que alguien lo escriba");
});

test("base SANA: no se descarta y NO se pide respaldo", async () => {
  let pedidos = 0;
  const r = await repararNombreEpisodio(
    "Se acerca el invierno",
    async () => { pedidos++; return "otro"; },
    "tv:4 T1E1", ACTIVO,
  );
  assert.equal(r.descartar, false);
  assert.equal(r.nombre, "Se acerca el invierno");
  assert.equal(pedidos, 0, "un episodio sano no cuesta una llamada");
  assert.equal(r.llamadas, 0);
});

test("base ROTA + respaldo BUENO: se repara y se cuenta como reparado", async () => {
  const r = await repararNombreEpisodio("", async () => "El nombre bueno", "tv:5 T1E1", ACTIVO);
  assert.equal(r.descartar, false);
  assert.equal(r.nombre, "El nombre bueno");
  assert.equal(r.reparado, true);
  assert.equal(r.llamadas, 1);
});

test("con el fallback APAGADO no se descarta nada: el estado es el de siempre", async () => {
  let pedidos = 0;
  const r = await repararNombreEpisodio("", async () => { pedidos++; return "x"; }, "tv:6", false);
  assert.equal(r.descartar, false, "apagado, un vacío no puede tumbar una serie");
  assert.equal(r.nombre, null);
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
// EL LOTE — títulos y sinopsis de una página de discover
// ============================================================================

test("página sin rotos: no se pide respaldo y no se descarta nada", async () => {
  let pedidos = 0;
  const base = [
    { id: 1, title: "Uno", overview: "a" },
    { id: 2, title: "Dos", overview: "b" },
  ];
  const r = await repararLista(base, async () => { pedidos++; return []; }, "p1", ACTIVO);
  assert.equal(pedidos, 0);
  assert.equal(r.llamadas, 0);
  assert.deepEqual(r.items, base);
});

test("UNA llamada repara toda la página, no una por título", async () => {
  let pedidos = 0;
  const base = [
    { id: 1, title: "런닝맨", overview: "a", original_name: "런닝맨", original_language: "ko" },
    { id: 2, title: "破产姐妹", overview: "b", original_name: "破产姐妹", original_language: "zh" },
    { id: 3, title: "Sano", overview: "c" },
  ];
  const r = await repararLista(base, async () => {
    pedidos++;
    return [{ id: 1, title: "Running Man" }, { id: 2, title: "Dos chicas sin blanca" }];
  }, "p1", ACTIVO);
  assert.equal(pedidos, 1, "dos rotos, una sola llamada");
  assert.equal(r.llamadas, 1);
  assert.equal(r.reparados, 2);
  assert.equal(r.items.length, 3);
  assert.equal(r.items.find((t) => t.id === 1)?.title, "Running Man");
});

test("respaldo caído: los sanos siguen, los rotos se caen de la corrida", async () => {
  const base = [
    { id: 1, title: "런닝맨", overview: "a", original_name: "런닝맨", original_language: "ko" },
    { id: 2, title: "Sano", overview: "b" },
  ];
  const r = await repararLista(base, async () => { throw new Error("TMDB 502"); }, "p1", ACTIVO);
  assert.equal(r.fallo, true);
  assert.equal(r.descartados, 1);
  assert.deepEqual(r.items.map((t) => t.id), [2], "el sano no se pierde por culpa del roto");
});

// EL TEST QUE HABRIA EVITADO LA REGRESION. En la primera corrida real, 79
// titulos de 120 se cayeron por esta rama: eran titulos SIN SINOPSIS EN NINGUN
// IDIOMA, que el sync viejo escribia sin problema. El descubrimiento paso de
// ~120 candidatos a 40.
test("el respaldo responde pero no mejora: se ESCRIBE la base, no se descarta", async () => {
  const base = [
    { id: 1, title: "Sin sinopsis", overview: "", original_name: "Sin sinopsis", original_language: "en" },
  ];
  const r = await repararLista(base, async () => [{ id: 1, title: "Sin sinopsis", overview: "" }], "p1", ACTIVO);
  assert.equal(r.fallo, false, "una respuesta válida no es una caída");
  assert.equal(r.descartados, 0, "descartar acá tiraba cobertura sin proteger nada");
  assert.equal(r.sinReparar, 1);
  assert.deepEqual(r.items, base, "se escribe tal cual, igual que antes del cambio de idioma");
});

test("respaldo que no trae al título: tampoco se descarta", async () => {
  const base = [
    { id: 1, title: "Sin sinopsis", overview: "", original_name: "Sin sinopsis", original_language: "en" },
  ];
  const r = await repararLista(base, async () => [], "p1", ACTIVO);
  assert.equal(r.descartados, 0);
  assert.equal(r.sinReparar, 1);
  assert.deepEqual(r.items, base);
});

test("con el fallback apagado el lote pasa intacto y sin llamadas", async () => {
  let pedidos = 0;
  const base = [{ id: 1, title: "런닝맨", overview: "", original_name: "런닝맨", original_language: "ko" }];
  const r = await repararLista(base, async () => { pedidos++; return []; }, "p1", false);
  assert.equal(pedidos, 0);
  assert.deepEqual(r.items, base);
  assert.equal(r.descartados, 0);
});

// ============================================================================
// MÉTRICAS: una por invocación, no estado de módulo
// ============================================================================
// El acumulador vivía en un `const` de módulo. Con eso, dos corridas de
// `syncUpcoming` solapadas —dos POST al endpoint, o un reintento del cron encima
// de la corrida anterior— habrían compartido el contador: los números de una se
// habrían sumado a los de la otra, y el reset del arranque habría borrado los de
// la que ya estaba corriendo.

const demora = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("dos corridas CONCURRENTES no se contaminan las métricas", async () => {
  // Cada "corrida" hace su propia reparación con su propio acumulador, y las dos
  // se intercalan de verdad: la lenta cede el control en medio de su trabajo.
  async function corrida(rotos: number, demoraMs: number) {
    const metricas = nuevasMetricas();
    const base = Array.from({ length: rotos }, (_, i) => ({
      id: i + 1, title: "런닝맨", overview: "x",
      original_name: "런닝맨", original_language: "ko",
    }));
    const r = await repararLista(base, async () => {
      await demora(demoraMs);                       // acá se intercalan
      return base.map((t) => ({ id: t.id, title: `Reparado ${t.id}` }));
    }, "concurrente", true);
    sumarLote(metricas, r);
    await demora(demoraMs);                          // y otra vez, después de sumar
    const ep = await repararNombreEpisodio("", async () => "Nombre bueno", "ep", true);
    sumarEpisodio(metricas, ep);
    return metricas;
  }

  const [a, b] = await Promise.all([corrida(3, 20), corrida(7, 5)]);

  // Si el acumulador fuera de módulo, las dos verían 10 reparados + 2 episodios.
  assert.deepEqual(a, { llamadas: 2, reparados: 4, descartados: 0, sinReparar: 0, fallos: 0 },
    "la corrida A tiene que ver SOLO sus 3 títulos + 1 episodio");
  assert.deepEqual(b, { llamadas: 2, reparados: 8, descartados: 0, sinReparar: 0, fallos: 0 },
    "la corrida B tiene que ver SOLO sus 7 títulos + 1 episodio");
});

test("una corrida que arranca no le borra las métricas a la que ya corría", async () => {
  const vieja = nuevasMetricas();
  sumarLote(vieja, { items: [], descartados: 2, sinReparar: 0, llamadas: 1, reparados: 5, fallo: true });
  // Arranca otra: con estado de módulo, este `nuevasMetricas()` era un reset
  // global y la de arriba se quedaba en cero a mitad de camino.
  const nueva = nuevasMetricas();
  assert.deepEqual(nueva, { llamadas: 0, reparados: 0, descartados: 0, sinReparar: 0, fallos: 0 });
  assert.deepEqual(vieja, { llamadas: 1, reparados: 5, descartados: 2, sinReparar: 0, fallos: 1 });
});

test("sumarEpisodio: solo el respaldo CAÍDO descarta y cuenta como fallo", async () => {
  const caido = nuevasMetricas();
  sumarEpisodio(caido, await repararNombreEpisodio("", async () => { throw new Error("x"); }, "e", true));
  assert.deepEqual(caido, { llamadas: 1, reparados: 0, descartados: 1, sinReparar: 0, fallos: 1 });

  const inutil = nuevasMetricas();
  sumarEpisodio(inutil, await repararNombreEpisodio("", async () => "", "e", true));
  assert.deepEqual(inutil, { llamadas: 1, reparados: 0, descartados: 0, sinReparar: 0, fallos: 0 },
    "el respaldo respondió: ni se descarta ni es una caída");
});

// --- El barrido que impide la regresión -------------------------------------
// Los tests de arriba prueban que el DISEÑO parametrizado aísla. Este prueba que
// el sync de verdad lo usa: sin él, alguien podría volver a poner un acumulador
// de módulo y los tests seguirían en verde porque prueban los helpers.

test("BARRIDO: sync-upcoming.ts no tiene estado mutable de métricas en el módulo", () => {
  const src = readFileSync(join("supabase", "functions", "tmdb-sync", "jobs", "sync-upcoming.ts"), "utf8");
  // Un `const metricas` / `let metricas` en el nivel superior (sin sangría) es
  // exactamente la forma que tenía el bug.
  const enModulo = src.split("\n").filter((l) => /^(const|let|var)\s+metricas\b/.test(l));
  assert.deepEqual(enModulo, [],
    `las métricas volvieron a ser estado de módulo:\n${enModulo.join("\n")}`);
  // Y la forma correcta tiene que estar presente.
  assert.match(src, /const metricas = nuevasMetricas\(\);/,
    "syncUpcoming tiene que crear su propio acumulador");
  assert.match(src, /metricas: MetricasIdioma/,
    "las funciones de recolección tienen que recibirlo por parámetro");
});
