// Backfill de idioma de `upcoming_content`: la decisión, campo por campo, con
// respuestas de TMDB CONTROLADAS.
//
// Se prueba `planificarFila`, que es LA MISMA función que llama el script. No
// hay una réplica de la lógica acá adentro: eso fue lo que dejó pasar tres bugs
// en la tanda 1.
//
// Los seis casos que el dueño pidió cubrir de forma determinista: película,
// serie, episodio exacto, 404 de episodio, fallback, y vacío que no pisa.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  episodioRoto, filaDePayload, planificarFila, validarSnapshot, type FilaGuardada,
} from "./backfill-upcoming.ts";

const pelicula = (o: Partial<FilaGuardada> = {}): FilaGuardada => ({
  tmdb_id: 278, media_type: "movie",
  title: "Cadena perpetua", overview: "Sinopsis en es-ES.", episode_name: null,
  season_number: null, episode_number: null, ...o,
});

const serie = (o: Partial<FilaGuardada> = {}): FilaGuardada => ({
  tmdb_id: 1399, media_type: "tv",
  title: "Juego de tronos", overview: "Sinopsis en es-ES.", episode_name: "Se acerca el invierno",
  season_number: 1, episode_number: 1, ...o,
});

// ============================================================================
// 1. PELÍCULA — el camino que producción no puede ejercitar
// ============================================================================
// La tabla real tiene 43 filas y las 43 son series: sin este test, el camino de
// películas se estrenaría el día que aparezca una.

test("película: cambian title y overview, y episode_name no aplica", () => {
  const p = planificarFila({
    fila: pelicula(),
    mx: { title: "Sueño de fuga", overview: "Sinopsis en es-MX." },
    es: { title: "Cadena perpetua", overview: "Sinopsis en es-ES." },
  });
  assert.deepEqual(p.cambia, ["title", "overview"]);
  assert.equal(p.despues.title, "Sueño de fuga");
  assert.equal(p.despues.overview, "Sinopsis en es-MX.");
  // No se inventa un episodio ni se marca omisión: una película no tiene.
  assert.equal(p.despues.episode_name, null);
  assert.deepEqual(p.omitidos, {});
});

test("película: sin episodio, no se pide ni se omite nada por 404", () => {
  const p = planificarFila({
    fila: pelicula(),
    mx: { title: "Sueño de fuga", overview: "Sinopsis en es-MX." },
    es: { title: "Cadena perpetua", overview: "Sinopsis en es-ES." },
    epMx: null, epEs: null,
  });
  assert.equal(p.omitidos.episode_name, undefined);
});

// ============================================================================
// 2 y 3. SERIE, y el EPISODIO POR COORDENADAS EXACTAS
// ============================================================================

test("serie: los tres campos pasan a es-MX", () => {
  const p = planificarFila({
    fila: serie(),
    mx: { name: "Game of Thrones", overview: "Sinopsis MX." },
    es: { name: "Juego de tronos", overview: "Sinopsis en es-ES." },
    epMx: { name: "Se aproxima el invierno" },
    epEs: { name: "Se acerca el invierno" },
  });
  assert.deepEqual(p.cambia.sort(), ["episode_name", "overview", "title"]);
  assert.equal(p.despues.title, "Game of Thrones");
  assert.equal(p.despues.episode_name, "Se aproxima el invierno");
});

test("el episodio sale de las COORDENADAS, no de `next_episode_to_air`", () => {
  // Este es el caso que motivó la regla: el episodio que la fila referencia es
  // el 1, y hoy el "próximo" de la serie es otro. Si el planificador tomara el
  // próximo, escribiría el nombre de OTRO episodio con la misma fila.
  const p = planificarFila({
    fila: serie({ episode_name: "Se acerca el invierno" }),
    mx: { name: "Juego de tronos", overview: "s" },
    es: { name: "Juego de tronos", overview: "s" },
    epMx: { name: "Se aproxima el invierno" },   // T1E1 en es-MX
    epEs: { name: "Se acerca el invierno" },     // T1E1 en es-ES: coincide con lo guardado
  });
  assert.equal(p.despues.episode_name, "Se aproxima el invierno");
  // La función NUNCA recibe `next_episode_to_air`: su firma solo acepta el
  // episodio ya resuelto. Es una garantía de tipo, no de disciplina.
});

// ============================================================================
// 4. 404 DE EPISODIO — se conserva el nombre, pero NO se pierde la fila
// ============================================================================

test("404 de episodio: conserva episode_name y IGUAL actualiza title y overview", () => {
  const p = planificarFila({
    fila: serie({ episode_name: "Episodio 49" }),
    mx: { name: "Los diarios de la boticaria MX", overview: "Sinopsis MX." },
    es: { name: "Juego de tronos", overview: "Sinopsis en es-ES." },
    epMx: null, epEs: null,          // 404 en los dos idiomas
  });
  assert.equal(p.omitidos.episode_name, "episodio-404");
  assert.equal(p.despues.episode_name, "Episodio 49", "el nombre guardado se conserva");
  // Lo importante: la fila NO se descarta entera.
  assert.ok(p.cambia.includes("title"));
  assert.ok(p.cambia.includes("overview"));
});

test("serie sin coordenadas: se trata como 404, sin pedir nada", () => {
  const p = planificarFila({
    fila: serie({ season_number: null, episode_number: null }),
    mx: { name: "Game of Thrones", overview: "Sinopsis MX." },
    es: { name: "Juego de tronos", overview: "Sinopsis en es-ES." },
  });
  assert.equal(p.omitidos.episode_name, "episodio-404");
  assert.equal(p.despues.episode_name, "Se acerca el invierno");
});

// ============================================================================
// 5. FALLBACK — y su éxito INVISIBLE
// ============================================================================

test("fallback: un título no latino en es-MX se repara con es-ES", () => {
  const p = planificarFila({
    fila: serie({ tmdb_id: 33238, title: "Running Man", overview: "Sinopsis en es-ES." }),
    mx: { name: "런닝맨", overview: "Sinopsis en es-ES.", original_name: "런닝맨", original_language: "ko" },
    es: { name: "Running Man", overview: "Sinopsis en es-ES." },
    epMx: { name: "Ep" }, epEs: { name: "Ep" },
  });
  assert.equal(p.fallback.tituloOSinopsis, true, "el respaldo tiene que haber actuado");
  assert.equal(p.despues.title, "Running Man");
  // EL PUNTO DE ESTE TEST: el fallback funcionó y por eso NO hay cambio. Si el
  // dry-run contara el fallback por el diff, diría que nunca corrió.
  assert.deepEqual(p.cambia, [], "reparar bien significa que el valor NO cambia");
});

test("fallback: sinopsis vacía en es-MX se completa con la de es-ES", () => {
  const p = planificarFila({
    fila: pelicula({ overview: "Sinopsis en es-ES." }),
    mx: { title: "Sueño de fuga", overview: "" },
    es: { title: "Cadena perpetua", overview: "Sinopsis en es-ES." },
  });
  assert.equal(p.fallback.tituloOSinopsis, true);
  assert.equal(p.despues.title, "Sueño de fuga");
  assert.equal(p.despues.overview, "Sinopsis en es-ES.", "conserva la sinopsis, no la vacía");
  assert.deepEqual(p.cambia, ["title"]);
});

test("fallback del episodio: nombre vacío en es-MX toma el de es-ES", () => {
  const p = planificarFila({
    fila: serie({ episode_name: "Se acerca el invierno" }),
    mx: { name: "Juego de tronos", overview: "s" },
    es: { name: "Juego de tronos", overview: "s" },
    epMx: { name: "" },
    epEs: { name: "Se acerca el invierno" },
  });
  assert.equal(p.fallback.episodio, true);
  assert.equal(p.despues.episode_name, "Se acerca el invierno");
  assert.deepEqual(p.cambia, []);
});

test("el respaldo también roto: no se repara y no se rompe", () => {
  const p = planificarFila({
    fila: serie({ tmdb_id: 313117, title: "破产姐妹", overview: "algo" }),
    mx: { name: "破产姐妹", overview: "algo", original_name: "破产姐妹", original_language: "zh" },
    es: { name: "破产姐妹", overview: "algo" },   // el respaldo tampoco sirve
    epMx: { name: "Ep" }, epEs: { name: "Ep" },
  });
  assert.equal(p.fallback.tituloOSinopsis, false, "no mejoró: no cuenta como reparado");
  assert.equal(p.despues.title, "破产姐妹", "se conserva lo que había, no se vacía");
  assert.deepEqual(p.cambia, []);
});

// ============================================================================
// 6. NUNCA PISAR UN VALOR EXISTENTE CON VACÍO
// ============================================================================

test("es-MX sin sinopsis y respaldo sin sinopsis: se conserva la guardada", () => {
  const p = planificarFila({
    fila: pelicula({ overview: "La sinopsis que ya estaba." }),
    mx: { title: "Sueño de fuga", overview: "" },
    es: { title: "Cadena perpetua", overview: "" },
  });
  assert.equal(p.omitidos.overview, "vacio");
  assert.equal(p.despues.overview, "La sinopsis que ya estaba.");
  assert.deepEqual(p.cambia, ["title"], "el título sí cambia; la sinopsis se protege");
});

test("un episodio que vuelve vacío no borra el nombre guardado", () => {
  const p = planificarFila({
    fila: serie({ episode_name: "Se acerca el invierno" }),
    mx: { name: "Juego de tronos", overview: "s" },
    es: { name: "Juego de tronos", overview: "s" },
    epMx: { name: "" }, epEs: { name: "" },
  });
  assert.equal(p.omitidos.episode_name, "vacio");
  assert.equal(p.despues.episode_name, "Se acerca el invierno");
});

test("un campo guardado VACÍO sí se puede completar: no es pisar, es llenar", () => {
  const p = planificarFila({
    fila: pelicula({ overview: null }),
    // TMDB devuelve cadena vacía, no null, cuando no hay sinopsis. El null del
    // lado de la fila SÍ es real: la columna `overview` es nullable en la tabla.
    mx: { title: "Cadena perpetua", overview: "Sinopsis nueva." },
    es: { title: "Cadena perpetua", overview: "" },
  });
  assert.equal(p.despues.overview, "Sinopsis nueva.");
});

// ============================================================================
// FRESCURA — lo que cambió por otro motivo no se toca
// ============================================================================

test("si lo guardado ya no es el es-ES de hoy, el CAMPO se conserva y se reporta", () => {
  const p = planificarFila({
    fila: serie({ episode_name: "Episodio 5" }),
    mx: { name: "Futurama", overview: "Sinopsis en es-ES." },
    es: { name: "Futurama", overview: "Sinopsis en es-ES." },
    epMx: { name: "El ataque de los fanáticos" },
    epEs: { name: "El ataque de los fans" },      // TMDB completó el título después
  });
  assert.equal(p.omitidos.episode_name, "frescura");
  assert.equal(p.despues.episode_name, "Episodio 5", "se conserva EXACTAMENTE lo guardado");
});

test("la frescura de un campo NO arrastra a los otros dos", () => {
  const p = planificarFila({
    fila: serie({ episode_name: "Episodio 5", title: "Futurama", overview: "vieja" }),
    mx: { name: "Futurama MX", overview: "nueva MX" },
    es: { name: "Futurama", overview: "vieja" },
    epMx: { name: "A" }, epEs: { name: "B" },     // el episodio difiere de lo guardado
  });
  assert.equal(p.omitidos.episode_name, "frescura");
  assert.deepEqual(p.cambia.sort(), ["overview", "title"]);
});

// ============================================================================
// EL PAYLOAD: ida y vuelta con los MISMOS valores del snapshot
// ============================================================================

test("payload de ida: espera `antes` y escribe `después`", () => {
  const p = planificarFila({
    fila: pelicula(),
    mx: { title: "Sueño de fuga", overview: "MX." },
    es: { title: "Cadena perpetua", overview: "Sinopsis en es-ES." },
  });
  const f = filaDePayload(p, "aplicar");
  assert.equal(f.esperado_title, "Cadena perpetua");
  assert.equal(f.nuevo_title, "Sueño de fuga");
  assert.equal(f.tmdb_id, 278);
  assert.equal(f.media_type, "movie");
});

test("payload de vuelta: espera `después` y escribe `antes` — es el espejo exacto", () => {
  const p = planificarFila({
    fila: pelicula(),
    mx: { title: "Sueño de fuga", overview: "MX." },
    es: { title: "Cadena perpetua", overview: "Sinopsis en es-ES." },
  });
  const ida = filaDePayload(p, "aplicar");
  const vuelta = filaDePayload(p, "revertir");
  assert.equal(vuelta.esperado_title, ida.nuevo_title);
  assert.equal(vuelta.nuevo_title, ida.esperado_title);
  assert.equal(vuelta.esperado_overview, ida.nuevo_overview);
  assert.equal(vuelta.nuevo_overview, ida.esperado_overview);
});

test("el payload describe la fila COMPLETA: un campo que no cambia va igual en los dos", () => {
  const p = planificarFila({
    fila: serie({ episode_name: "Episodio 5" }),
    mx: { name: "Futurama MX", overview: "s" },
    es: { name: "Juego de tronos", overview: "s" },
    epMx: { name: "A" }, epEs: { name: "B" },
  });
  const f = filaDePayload(p, "aplicar");
  // `title` está omitido por frescura, así que nuevo === esperado: la RPC lo
  // sigue comparando —el bloqueo optimista mira las tres— pero no lo cambia.
  assert.equal(f.esperado_episode_name, f.nuevo_episode_name);
});

// ============================================================================
// El predicado del episodio
// ============================================================================

test("episodioRoto: vacío y alfabeto no latino, nada más", () => {
  assert.equal(episodioRoto(""), true);
  assert.equal(episodioRoto("   "), true);
  assert.equal(episodioRoto(null), true);
  assert.equal(episodioRoto("런닝맨"), true);
  assert.equal(episodioRoto("Episodio 1"), false);
  assert.equal(episodioRoto("Se acerca el invierno"), false);
  // Un nombre de episodio IGUAL al original no es señal de nada: los episodios
  // no tienen `original_name` con el cual comparar.
  assert.equal(episodioRoto("Winter Is Coming"), false);
});

// ============================================================================
// VALIDACIÓN DEL SNAPSHOT
// ============================================================================
// El snapshot es el contrato entre "esto es lo que revisé" y "esto es lo que se
// escribe". Entre esos dos momentos es un archivo en disco.

const DESTINO = { tabla: "public.upcoming_content", idioma: "es-MX" };

function snapshot(over: Record<string, unknown> = {}) {
  const entrada = {
    clave: "movie:278", tmdb_id: 278, media_type: "movie",
    antes: { title: "Cadena perpetua", overview: "a", episode_name: null },
    despues: { title: "Sueño de fuga", overview: "a", episode_name: null },
    omitidos: {}, cambia: ["title"],
  };
  return {
    tabla: "public.upcoming_content", idioma_destino: "es-MX",
    filas: 1, filas_que_cambian: 1, campos_que_cambian: 1,
    entradas: [entrada], ...over,
  };
}

test("snapshot válido: sin errores", () => {
  assert.deepEqual(validarSnapshot(snapshot(), DESTINO), []);
});

test("EL CHEQUEO QUE MÁS IMPORTA: un snapshot del espejo no se aplica a la tabla real", () => {
  const e = validarSnapshot(snapshot({ tabla: "ensayo.upcoming_content" }), DESTINO);
  assert.equal(e.length, 1);
  assert.match(e[0], /destino equivocado/);
});

test("y al revés: el snapshot real no se aplica al espejo", () => {
  const e = validarSnapshot(snapshot(), { tabla: "ensayo.upcoming_content", idioma: "es-MX" });
  assert.match(e[0], /destino equivocado/);
});

test("idioma distinto: se rechaza", () => {
  assert.match(validarSnapshot(snapshot({ idioma_destino: "es-ES" }), DESTINO)[0], /idioma equivocado/);
});

test("claves repetidas: se rechaza", () => {
  const s = snapshot();
  const dup = { ...s.entradas[0] };
  const e = validarSnapshot({ ...s, entradas: [s.entradas[0], dup], filas: 2, filas_que_cambian: 2, campos_que_cambian: 2 }, DESTINO);
  assert.ok(e.some((x) => /clave repetida/.test(x)));
});

test("falta una de las tres columnas en `antes`: se rechaza", () => {
  const s = snapshot();
  const rota = { ...s.entradas[0], antes: { title: "x", overview: "a" } };
  const e = validarSnapshot({ ...s, entradas: [rota] }, DESTINO);
  assert.ok(e.some((x) => /falta la columna `episode_name`/.test(x)));
});

test("conteos incoherentes: se rechaza", () => {
  assert.ok(validarSnapshot(snapshot({ filas: 9 }), DESTINO).some((x) => /`filas`/.test(x)));
  assert.ok(validarSnapshot(snapshot({ campos_que_cambian: 7 }), DESTINO).some((x) => /campos_que_cambian/.test(x)));
});

test("`cambia` que no describe la diferencia real: se rechaza", () => {
  // El caso peligroso: `cambia` vacío con antes != después. El conteo que se le
  // declara a la RPC saldría de `cambia`, así que mentiría sobre lo que escribe.
  const s = snapshot();
  const rota = { ...s.entradas[0], cambia: [] };
  const e = validarSnapshot({ ...s, entradas: [rota], filas_que_cambian: 0, campos_que_cambian: 0 }, DESTINO);
  assert.ok(e.some((x) => /`cambia` dice/.test(x)));
});

test("clave que no coincide con media_type:tmdb_id: se rechaza", () => {
  const s = snapshot();
  const rota = { ...s.entradas[0], clave: "tv:278" };
  assert.ok(validarSnapshot({ ...s, entradas: [rota] }, DESTINO).some((x) => /no coincide/.test(x)));
});

test("null y cadena vacía son distintos para `cambia`", () => {
  // La validación usa igualdad EXACTA, igual que la verificación: si tratara
  // null como "", un snapshot que dice "no cambia nada" pasaría teniendo un
  // cambio de null a "" adentro.
  const s = snapshot();
  const rota = {
    ...s.entradas[0],
    antes: { title: "x", overview: null, episode_name: null },
    despues: { title: "x", overview: "", episode_name: null },
    cambia: [],
  };
  const e = validarSnapshot({ ...s, entradas: [rota], filas_que_cambian: 0, campos_que_cambian: 0 }, DESTINO);
  assert.ok(e.some((x) => /`cambia` dice/.test(x)));
});
