// Reparación de idioma: el predicado compartido, la fusión, el mecanismo de
// lote y la huella de configuración.
//
// Los casos NO son inventados: salen de las mediciones de
// docs/medidas/2026-08-23-idioma-*.json, corridas contra TMDB real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_ACTIVO, HUELLA_EN_CLAVES, HUELLA_IDIOMA, IDIOMA_BASE, IDIOMA_FALLBACK,
  calcularHuella, fusionarPorCampo, metricasFallback, necesitaReparacion,
  queReparar, reiniciarMetricasFallback, repararLote, repararUno,
} from "./idioma.ts";

const crudo = (o: Record<string, unknown> = {}) => ({
  id: 1, title: "Un título", overview: "Una sinopsis.",
  original_title: "A Title", original_language: "en", ...o,
});

// ============================================================================
// Configuración por default
// ============================================================================

test("el idioma base por default es es-ES: la tanda 1 no cambia el idioma", () => {
  assert.equal(IDIOMA_BASE, "es-ES");
});

test("con el idioma base en es-ES el fallback está INERTE", () => {
  assert.equal(IDIOMA_FALLBACK, "es-ES");
  assert.equal(FALLBACK_ACTIVO, false, "base === fallback ⇒ no puede cambiar nada");
});

test("modo compatible: las claves no llevan huella en la tanda 1", () => {
  assert.equal(HUELLA_EN_CLAVES, "");
});

// ============================================================================
// LA HUELLA — se prueba la función REAL, no una réplica
// ============================================================================
// `calcularHuella` es la que usa `HUELLA_IDIOMA`. Una réplica de la fórmula en
// el test puede quedar verde mientras la implementación cambia; esto no.

test("calcularHuella: las cuatro configuraciones", () => {
  assert.equal(calcularHuella("es-MX", true), "es-MX+f.r1");
  assert.equal(calcularHuella("es-MX", false), "es-MX.r1");
  assert.equal(calcularHuella("es-ES", true), "es-ES.r1");
  // El caso que importa: con base es-ES el fallback es INERTE, así que apagarlo
  // NO puede abrir un espacio de claves nuevo. Si diera "es-ES+f.r1", tocar el
  // switch provocaría un arranque frío completo sin cambiar una sola respuesta.
  assert.equal(calcularHuella("es-ES", false), "es-ES.r1");
  assert.equal(calcularHuella("es-ES", true), calcularHuella("es-ES", false));
});

test("HUELLA_IDIOMA sale de calcularHuella, no de una fórmula aparte", () => {
  assert.equal(HUELLA_IDIOMA, calcularHuella(IDIOMA_BASE, process.env.FALLBACK_IDIOMA !== "0"));
});

test("subir la versión del resolver cambia el espacio de claves", () => {
  assert.notEqual(calcularHuella("es-MX", true, "r1"), calcularHuella("es-MX", true, "r2"));
});

// ============================================================================
// EL PREDICADO — uno solo, compartido por detección y fusión
// ============================================================================

test("señal 1: alfabeto no latino", () => {
  assert.equal(queReparar(crudo({ title: "런닝맨", original_language: "ko" })).titulo, true);
  assert.equal(queReparar(crudo({ title: "마녀 2", original_language: "ko" })).titulo, true);
});

test("acentos y eñes NO son alfabeto no latino", () => {
  for (const t of ["Máxima ansiedad", "El código enigma", "Los años ñandú", "Malèna"]) {
    assert.equal(necesitaReparacion(crudo({ title: t })), false, t);
  }
});

test("señal 2: sin sinopsis — el caso más frecuente (54 de 57)", () => {
  assert.equal(queReparar(crudo({ overview: "" })).sinopsis, true);
  assert.equal(queReparar(crudo({ overview: "   " })).sinopsis, true);
  assert.equal(queReparar(crudo({ overview: undefined })).sinopsis, true);
});

test("señal 3: título LATINO igual al original, idioma ni español ni inglés", () => {
  // El caso que la primera versión detectaba y NO reparaba: `necesitaReparacion`
  // decía que sí, pero la fusión solo tocaba títulos en alfabeto no latino.
  const t = crudo({
    title: "Nihon no eiga", original_title: "Nihon no eiga",
    original_language: "ja", overview: "Tiene sinopsis.",
  });
  const r = queReparar(t);
  assert.equal(r.titulo, true, "el título hay que reemplazarlo");
  assert.equal(r.sinopsis, false, "la sinopsis está bien");
});

test("EL PASAJE AL INGLÉS NO SE REPARA — verificado con 12 casos", () => {
  // En Argentina estos SON los nombres publicados. Medido en Disney+: con
  // "Zootopia 2" la película aparece y con "Zootrópolis 2" NO.
  for (const [ref, titulo] of [
    ["tv:1399", "Game of Thrones"], ["movie:1084242", "Zootopia 2"],
    ["movie:585", "Monsters, Inc."], ["tv:85271", "WandaVision"],
    ["movie:497698", "Black Widow"], ["tv:4607", "Lost"],
    ["movie:917496", "Beetlejuice Beetlejuice"],
  ]) {
    assert.equal(
      necesitaReparacion(crudo({ title: titulo, original_title: titulo, original_language: "en" })),
      false, `${ref} «${titulo}» NO se repara`,
    );
  }
});

test("un título en español igual al original tampoco se repara", () => {
  assert.equal(necesitaReparacion(crudo({
    title: "El Capo", original_title: "El Capo", original_language: "es",
  })), false);
});

// ============================================================================
// LA FUSIÓN — usa el MISMO predicado
// ============================================================================

test("SEÑAL 3: título latino que cayó al original TOMA el título es-ES", () => {
  // Este es el test que el hallazgo pedía. Antes fallaba: se detectaba, se
  // pagaba la llamada, y la fusión devolvía el título sin tocar.
  const base = crudo({
    title: "Nihon no eiga",
    original_title: "Nihon no eiga",
    original_language: "ja",
    overview: "La sinopsis ya existe.",
  });
  const respaldo = crudo({ title: "La película japonesa", overview: "Otra sinopsis." });
  const out = fusionarPorCampo(base, respaldo);
  assert.equal(out.title, "La película japonesa", "el título se reemplaza");
  assert.equal(out.overview, "La sinopsis ya existe.", "la sinopsis NO se pisa");
});

test("si solo falta la sinopsis, el título es-MX SE CONSERVA", () => {
  const out = fusionarPorCampo(
    crudo({ title: "Duro de matar", overview: "" }),
    crudo({ title: "Jungla de cristal", overview: "Un policía…" }),
  );
  assert.equal(out.title, "Duro de matar", "el título mexicano no se pisa");
  assert.equal(out.overview, "Un policía…");
});

test("título no latino: se toma el del respaldo", () => {
  const out = fusionarPorCampo(
    crudo({ title: "런닝맨", original_language: "ko", overview: "" }),
    crudo({ title: "Running Man", overview: "Un programa…" }),
  );
  assert.equal(out.title, "Running Man");
  assert.equal(out.overview, "Un programa…");
});

test("si el respaldo TAMBIÉN viene roto, no se pisa nada", () => {
  // Una película coreana sin traducción ni al es-ES. Mejor el original que un
  // vacío o el mismo galimatías.
  const base = crudo({ title: "런닝맨", original_language: "ko", overview: "Hay sinopsis." });
  const out = fusionarPorCampo(base, crudo({ title: "런닝맨", overview: "" }));
  assert.equal(out.title, "런닝맨");
  assert.equal(out.overview, "Hay sinopsis.");
});

test("sin respaldo devuelve la base tal cual, y no la muta", () => {
  const base = crudo({ title: "런닝맨", original_language: "ko", overview: "" });
  assert.deepEqual(fusionarPorCampo(base, undefined), base);
  fusionarPorCampo(base, crudo({ title: "Running Man", overview: "x" }));
  assert.equal(base.title, "런닝맨");
  assert.equal(base.overview, "");
});

// ============================================================================
// EL MECANISMO DE LOTE
// ============================================================================

test("INERCIA POR CONFIGURACIÓN: con es-ES, cero llamadas y salida idéntica", async () => {
  // Se corre con un lote que SÍ tiene títulos rotos, para que no pueda pasar
  // por casualidad: lo que apaga el fallback es la config, no los datos.
  reiniciarMetricasFallback();
  const rotos = [
    crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" }),
    crudo({ id: 2, overview: "" }),
    crudo({ id: 3, title: "X", original_title: "X", original_language: "ja" }),
  ];
  assert.ok(rotos.every(necesitaReparacion), "el lote de prueba tiene que estar roto");

  let pedidos = 0;
  const out = await repararLote(rotos, async () => { pedidos++; return []; }, "test");

  assert.equal(pedidos, 0, "no se pidió respaldo");
  assert.equal(metricasFallback().llamadas, 0, "cero llamadas de fallback");
  assert.equal(out, rotos, "devuelve exactamente la misma referencia");
});

// De acá para abajo el fallback se fuerza ACTIVO con el último argumento. Sin
// eso la guarda de inercia sale antes y estos tests pasarían sin ejecutar una
// sola línea del camino que dicen probar.
const ACTIVO = true;

test("con el fallback activo: UNA llamada para todo el lote, y repara", async () => {
  reiniciarMetricasFallback();
  const base = [
    crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" }),
    crudo({ id: 2, title: "Bien", overview: "Bien." }),
    crudo({ id: 3, title: "X", original_title: "X", original_language: "ja", overview: "Hay." }),
  ];
  let pedidos = 0;
  const out = await repararLote(base, async () => {
    pedidos++;
    return [
      crudo({ id: 1, title: "Running Man", overview: "Un programa." }),
      crudo({ id: 3, title: "La película", overview: "Otra." }),
    ];
  }, "test", ACTIVO);

  assert.equal(pedidos, 1, "UNA llamada, no una por título");
  assert.equal(out[0].title, "Running Man");
  assert.equal(out[0].overview, "Un programa.");
  assert.equal(out[1].title, "Bien", "el sano no se toca");
  assert.equal(out[2].title, "La película", "señal 3: título latino reemplazado");
  assert.equal(out[2].overview, "Hay.", "la sinopsis que ya existía no se pisa");
  assert.equal(metricasFallback().llamadas, 1);
});

test("un lote SANO no pide respaldo ni con el fallback activo", async () => {
  const sanos = [crudo({ id: 1 }), crudo({ id: 2 })];
  let pedidos = 0;
  const out = await repararLote(sanos, async () => { pedidos++; return []; }, "test", ACTIVO);
  assert.equal(pedidos, 0);
  assert.equal(out, sanos);
});

test("POOL: si el respaldo falla, se devuelve la base intacta", async () => {
  // El fallback es una mejora opcional: nunca puede tirar una página válida de
  // es-MX. Rechazo y timeout, que son las dos formas reales de fallar.
  const base = [crudo({ id: 1, overview: "" }), crudo({ id: 2, title: "ok", overview: "ok" })];
  for (const [nombre, fallar] of [
    ["rechazo", () => Promise.reject(new Error("TMDB 500"))],
    ["timeout", () => Promise.reject(new DOMException("aborted", "TimeoutError"))],
  ] as [string, () => Promise<never>][]) {
    reiniciarMetricasFallback();
    const out = await repararLote(base, fallar, `test-${nombre}`, ACTIVO);
    assert.deepEqual(out, base, `la base sobrevive al ${nombre}`);
    assert.equal(metricasFallback().fallos, 1, "el fallo se contabiliza");
  }
});

test("CONSULTA PAGINADA: el fallo del respaldo no rompe la página", async () => {
  // `candidatosCombinados` arma { candidatos, totalPaginas, total }: el
  // envoltorio se calcula DESPUÉS de reparar, así que un fallo del respaldo no
  // puede perder la paginación.
  const crudos = [crudo({ id: 1, overview: "" })];
  const candidatos = await repararLote(
    crudos, () => Promise.reject(new Error("boom")), "test-paginada", ACTIVO,
  );
  const pagina = { candidatos, totalPaginas: 32, total: 627 };
  assert.deepEqual(pagina.candidatos, crudos);
  assert.equal(pagina.totalPaginas, 32, "la paginación sobrevive");
  assert.equal(pagina.total, 627);
});

test("FICHA: si el respaldo falla, se devuelve la base", async () => {
  const base = crudo({ overview: "" });
  const out = await repararUno(base, () => Promise.reject(new Error("boom")), "test", ACTIVO);
  assert.deepEqual(out, base);
});

test("FICHA: respaldo nulo devuelve la base", async () => {
  const base = crudo({ overview: "" });
  assert.deepEqual(await repararUno(base, async () => null, "test", ACTIVO), base);
});
