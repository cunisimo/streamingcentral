// El descubrimiento de "Próximamente", con TMDB simulado.
//
// Vive en `lib/` para que lo levante `npm test`, pero prueba
// `supabase/functions/tmdb-sync/lib/descubrir.ts` — el módulo real que corre en
// la Edge Function. Se puede importar desde Node porque no usa una sola API de
// Deno, igual que `reconciliar.ts`.
//
// ============================================================================
// EL BUG QUE ESTOS TESTS FIJAN
// ============================================================================
// `collectSeries` descubría con `sort_by=popularity.desc` y `MAX_PAGES = 3`:
// miraba **60 de 1900** resultados de la ventana. Un título de popularidad baja
// no entraba nunca, aunque TMDB confirmara su proveedor argentino, y la pasada
// de refresco tampoco lo traía porque sólo refresca lo que ya está.
//
// La agenda no era "los estrenos de la ventana": era "lo que estaba en el top 60
// el día en que se escribió cada fila".
//
// 🔴 LO QUE **NO** CAMBIA, y conviene tenerlo a la vista: la exigencia de un
// proveedor `flatrate` confirmado para Argentina se conserva intacta. Esto
// corrige QUÉ SE MIRA, no qué califica. Un título que TMDB todavía no asocia a
// ninguna plataforma argentina sigue afuera, tenga la popularidad que tenga.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TOPE_PAGINAS_TMDB, arFlatrateDe, descubrirTodo, filtrarPorProveedorAR, ordenarPorFecha,
} from "../supabase/functions/tmdb-sync/lib/descubrir.ts";


/** Una fuente paginada de mentira, que además anota qué páginas le pidieron. */
function fuente(paginas: { id: number; fecha: string }[][], total = paginas.length) {
  const pedidas: number[] = [];
  return {
    pedidas,
    pedir: async (pagina: number) => {
      pedidas.push(pagina);
      return { results: paginas[pagina - 1] ?? [], total_pages: total };
    },
  };
}

const clave = (x: { id: number }) => `tv:${x.id}`;

// --- 1. el bug ---------------------------------------------------------------

test("un título de la página 4 entra: ya no hay corte en la 3", async () => {
  // Cinco páginas. El título buscado está en la CUARTA, que es exactamente
  // donde el código viejo dejaba de mirar.
  const f = fuente([
    [{ id: 1, fecha: "2026-09-01" }, { id: 2, fecha: "2026-09-02" }],
    [{ id: 3, fecha: "2026-09-03" }, { id: 4, fecha: "2026-09-04" }],
    [{ id: 5, fecha: "2026-09-05" }, { id: 6, fecha: "2026-09-06" }],
    [{ id: 7, fecha: "2026-09-07" }, { id: 8, fecha: "2026-09-08" }],
    [{ id: 9, fecha: "2026-09-09" }],
  ]);
  const r = await descubrirTodo({ pedir: f.pedir, clave });
  assert.ok(r.some((x) => x.id === 7), "el título de la página 4 no entró");
  assert.equal(r.length, 9);
});

test("la consulta continúa hasta total_pages", async () => {
  const f = fuente([
    [{ id: 1, fecha: "2026-09-01" }], [{ id: 2, fecha: "2026-09-02" }],
    [{ id: 3, fecha: "2026-09-03" }], [{ id: 4, fecha: "2026-09-04" }],
  ]);
  await descubrirTodo({ pedir: f.pedir, clave });
  assert.deepEqual(f.pedidas, [1, 2, 3, 4]);
});

// --- 2. lo que NO cambia -----------------------------------------------------

test("un título sin proveedor argentino sigue excluido", async () => {
  const items = [{ id: 1 }, { id: 2 }];
  const r = await filtrarPorProveedorAR(items, async (x) =>
    x.id === 1 ? [{ id: 8, name: "Netflix", logo_path: null, display_priority: 0 }] : []);
  assert.deepEqual(r.map((x) => x.item.id), [1]);
});

test('"Mis muertos tristes" NO entra mientras TMDB no le dé proveedor AR', async () => {
  // Datos reales de `tv:310290` como FIXTURE, no como excepción en el código:
  // TMDB no le informa `flatrate` en ninguna región. Su popularidad es 1.761,
  // muy por debajo del corte de la página 3 (69.99), así que el código viejo no
  // la miraba nunca. Ahora SÍ se la mira — y se la descarta por la razón
  // correcta, que es la que el dueño decidió conservar.
  //
  // El día que TMDB publique su proveedor argentino, este mismo camino la deja
  // entrar sin tocar una línea. Eso es lo que fija el test de abajo.
  const muertos = { id: 310290, nombre: "Mis muertos tristes", popularidad: 1.761 };
  const sinProveedor = await filtrarPorProveedorAR([muertos], async () => []);
  assert.equal(sinProveedor.length, 0, "entró sin proveedor argentino");

  const conProveedor = await filtrarPorProveedorAR([muertos], async () =>
    [{ id: 8, name: "Netflix", logo_path: null, display_priority: 0 }]);
  assert.equal(conProveedor.length, 1, "no entraría ni cuando TMDB lo confirme");
  assert.equal(conProveedor[0].item.popularidad, 1.761, "la popularidad no puede decidir");
});

// --- 3. integridad del recorrido --------------------------------------------

test("el mismo tipo:id en dos páginas produce un solo resultado", async () => {
  const f = fuente([
    [{ id: 7, fecha: "2026-09-01" }, { id: 8, fecha: "2026-09-02" }],
    [{ id: 7, fecha: "2026-09-01" }, { id: 9, fecha: "2026-09-03" }],
  ]);
  const r = await descubrirTodo({ pedir: f.pedir, clave });
  assert.deepEqual(r.map((x) => x.id).sort((a, b) => a - b), [7, 8, 9]);
});

test("el orden final es por fecha, con el id como desempate estable", async () => {
  const xs = [
    { id: 30, fecha: "2026-09-02" }, { id: 10, fecha: "2026-09-01" },
    { id: 20, fecha: "2026-09-01" }, { id: 5, fecha: null },
  ];
  const orden = (v: typeof xs) =>
    ordenarPorFecha(v, (x) => x.fecha, (x) => x.id).map((x) => x.id);
  // Fecha asc; a igual fecha, id asc. Sin fecha va al final.
  assert.deepEqual(orden(xs), [10, 20, 30, 5]);
  // Determinístico: otro orden de llegada, el mismo resultado. Es la propiedad
  // que importa — el orden en que TMDB devuelve las páginas no es estable.
  assert.deepEqual(orden([...xs].reverse()), [10, 20, 30, 5]);
});

test("un fallo intermedio NO devuelve un recorrido parcial", async () => {
  // El viejo `catch { break }` se quedaba con lo recolectado y seguía. Eso
  // escribe una agenda incompleta como si estuviera completa.
  const pedir = async (pagina: number) => {
    if (pagina === 3) throw new Error("TMDB 503");
    return { results: [{ id: pagina, fecha: "2026-09-01" }], total_pages: 5 };
  };
  await assert.rejects(() => descubrirTodo({ pedir, clave }), /TMDB 503/);
});

test("una fuente agotada no pide páginas inexistentes", async () => {
  // Dos cosas distintas: que `total_pages` mande, y que una página vacía corte
  // igual. Lo segundo protege de metadata inconsistente — `total_pages` alto con
  // resultados que se terminan antes — que si no sería un bucle pidiendo vacíos.
  const f = fuente([[{ id: 1, fecha: "2026-09-01" }], [{ id: 2, fecha: "2026-09-02" }]], 2);
  await descubrirTodo({ pedir: f.pedir, clave });
  assert.deepEqual(f.pedidas, [1, 2]);

  const g = fuente([[{ id: 1, fecha: "2026-09-01" }], [], [{ id: 3, fecha: "2026-09-03" }]], 99);
  const r = await descubrirTodo({ pedir: g.pedir, clave });
  assert.deepEqual(g.pedidas, [1, 2], "siguió pidiendo después de una página vacía");
  assert.equal(r.length, 1);
});

test("el tope de páginas es de TMDB, no una decisión nuestra", async () => {
  // TMDB rechaza `page` por encima de 500. No es un `MAX_PAGES` elegido: es el
  // límite de la fuente, y pedir la 501 sería un error, no menos cobertura.
  assert.equal(TOPE_PAGINAS_TMDB, 500);
  let ultima = 0;
  const pedir = async (pagina: number) => {
    ultima = pagina;
    return { results: [{ id: pagina, fecha: "2026-09-01" }], total_pages: 900 };
  };
  await descubrirTodo({ pedir, clave });
  assert.equal(ultima, 500, "pidió más allá del tope de la fuente");
});

test("una página que la reparación vacía NO corta la paginación", async () => {
  // 🔴 ESTE ES EL BUG QUE ESTA CORRECCIÓN PODÍA REINTRODUCIR. `repararLista`
  // DESCARTA los títulos ilegibles, así que una página puede llegar con 20
  // resultados y quedar en 0 después de reparar. Si el corte por página vacía
  // mirara los items reparados, una página así truncaría el recorrido en
  // silencio — el mismo truncamiento por otro camino.
  //
  // Por eso `pedir` informa `crudos`: cuántos resultados trajo TMDB, antes de
  // reparar. Lo que decide seguir es la fuente, no nuestro filtro.
  const pedidas: number[] = [];
  const pedir = async (pagina: number) => {
    pedidas.push(pagina);
    return pagina === 2
      ? { results: [], crudos: 20, total_pages: 3 }
      : { results: [{ id: pagina, fecha: "2026-09-01" }], crudos: 20, total_pages: 3 };
  };
  const r = await descubrirTodo({ pedir, clave });
  assert.deepEqual(pedidas, [1, 2, 3], "cortó en la página que la reparación vació");
  assert.deepEqual(r.map((x) => x.id), [1, 3]);
});

// ============================================================================
// Detalle y proveedores en UNA llamada
// ============================================================================
//
// El sync pedía DOS cosas por serie: `/tv/{id}` para el `next_episode_to_air` y
// `/tv/{id}/watch/providers` para el filtro argentino. TMDB permite traer las
// dos con `append_to_response=watch/providers`, y eso baja el costo de 530
// llamadas a 271 sin tocar la semántica.
//
// Medido sobre 20 series reales del propio discover del sync: **proveedores AR
// idénticos en 20 de 20** y los campos que el sync usa —`air_date`,
// `season_number`, `episode_number`, `name` del próximo episodio, y `status`—
// idénticos en 20 de 20. Los bytes son los mismos (35.085 B sumando las dos
// respuestas contra 35.094 B en una sola): se transfiere lo mismo en un pedido
// en vez de dos.
//
// ⚠️ Una serie parecía diferir y NO era `append_to_response`: `vote_average` y
// `vote_count` DEL PRÓXIMO EPISODIO cambiaron entre las dos llamadas, con
// segundos de diferencia. Es un dato vivo, y el sync no lo usa. Conviene
// saberlo antes de leer un diff contra una respuesta guardada.

test("los proveedores AR se extraen con UNA sola función, sea cual sea la forma", () => {
  // La respuesta separada y el bloque `watch/providers` de la combinada tienen
  // LA MISMA forma. El riesgo no es que difieran los datos —están medidos—, es
  // que alguien escriba dos extractores y con el tiempo se separen. Hay uno.
  const respuesta = {
    results: {
      AR: { link: "x", flatrate: [
        { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg", display_priority: 3 },
      ] },
      US: { link: "y", flatrate: [{ provider_id: 15, provider_name: "Hulu" }] },
    },
  };
  const filas = arFlatrateDe(respuesta);
  assert.deepEqual(filas, [
    { id: 8, name: "Netflix", logo_path: "/n.jpg", display_priority: 3 },
  ]);
  // Sin AR no hay filas: es el caso que descarta el título.
  assert.deepEqual(arFlatrateDe({ results: { US: { link: "y", flatrate: [] } } }), []);
  assert.deepEqual(arFlatrateDe({ results: {} }), []);
  assert.deepEqual(arFlatrateDe({}), []);
});

test("una serie ya resuelta NO vuelve a pedir sus proveedores", async () => {
  // El ahorro entero depende de esto: si el filtro final volviera a llamar por
  // cada serie, traer los proveedores en el detalle no habría servido de nada.
  const previos = new Map([["tv:1", [{ id: 8 }]]]);
  const pedidos: string[] = [];
  const leer = async (c: { media_type: string; tmdb_id: number }) => {
    const k = `${c.media_type}:${c.tmdb_id}`;
    const pre = previos.get(k);
    if (pre) return pre;
    pedidos.push(k);
    return [{ id: 337 }];
  };
  const r = await filtrarPorProveedorAR(
    [{ media_type: "tv", tmdb_id: 1 }, { media_type: "movie", tmdb_id: 2 }], leer,
  );
  assert.deepEqual(r.map((x) => x.item.tmdb_id), [1, 2]);
  assert.deepEqual(pedidos, ["movie:2"], "volvió a pedir los proveedores de la serie");
});

test("la Edge Function no usa APIs exclusivas de Node", () => {
  // No hay typechecker de Deno en el repo (ni `deno.json`, ni CI), así que esto
  // es lo que sí se puede verificar sin instalar nada: que el código de la
  // función no dependa de APIs que en Deno no existen. `descubrir.ts` además se
  // ejecuta de verdad en estos tests, que es la mejor prueba de que importa y
  // corre.
  const raiz = new URL("../supabase/functions/tmdb-sync/", import.meta.url);
  const archivos = [
    "lib/descubrir.ts", "lib/providers.ts", "lib/tmdb.ts", "jobs/sync-upcoming.ts",
  ];
  for (const rel of archivos) {
    const src = readFileSync(new URL(rel, raiz), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    for (const [pat, que] of [
      [/\brequire\(/, "require()"],
      [/from "node:/, "import de node:"],
      [/\bprocess\.env\b/, "process.env"],
      [/\b__dirname\b/, "__dirname"],
      [/\bBuffer\b/, "Buffer"],
    ] as [RegExp, string][]) {
      assert.doesNotMatch(src, pat, `${rel} usa ${que}, que en Deno no existe`);
    }
  }
});
