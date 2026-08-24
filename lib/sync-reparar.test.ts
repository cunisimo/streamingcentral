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
import {
  nombreDeEpisodioRoto, repararLista, repararNombreEpisodio,
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

test("base VACÍA + respaldo VACÍO: se descarta igual", async () => {
  const r = await repararNombreEpisodio("", async () => "", "tv:2 T1E1", ACTIVO);
  assert.equal(r.descartar, true);
  assert.equal(r.nombre, null);
});

test("base VACÍA + respaldo con espacios: se descarta (no es un nombre)", async () => {
  const r = await repararNombreEpisodio("", async () => "   ", "tv:2b T1E1", ACTIVO);
  assert.equal(r.descartar, true);
});

test("base NO LATINA + respaldo CAÍDO: se descarta, y no se escribe el coreano", async () => {
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

test("el respaldo no trae al roto: ese título se descarta, no se escribe roto", async () => {
  const base = [
    { id: 1, title: "런닝맨", overview: "a", original_name: "런닝맨", original_language: "ko" },
  ];
  const r = await repararLista(base, async () => [], "p1", ACTIVO);
  assert.equal(r.fallo, false, "una lista vacía válida no es una caída");
  assert.equal(r.descartados, 1);
  assert.deepEqual(r.items, []);
});

test("con el fallback apagado el lote pasa intacto y sin llamadas", async () => {
  let pedidos = 0;
  const base = [{ id: 1, title: "런닝맨", overview: "", original_name: "런닝맨", original_language: "ko" }];
  const r = await repararLista(base, async () => { pedidos++; return []; }, "p1", false);
  assert.equal(pedidos, 0);
  assert.deepEqual(r.items, base);
  assert.equal(r.descartados, 0);
});
