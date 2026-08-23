// Reparación de idioma: predicado compartido, fusión, mecanismo de lote,
// señal de fallo, claves de lote mixto y métricas por request.
//
// Los casos NO son inventados: salen de las mediciones de
// docs/medidas/2026-08-23-idioma-*.json, corridas contra TMDB real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_ACTIVO, HUELLA_EN_CLAVES, HUELLA_IDIOMA, IDIOMA_BASE, IDIOMA_FALLBACK,
  calcularHuella, claveMixta, clavePorId, fusionarPorCampo, metricasIdiomaActuales,
  necesitaReparacion, queReparar, repararLote, repararUno, withMetricasIdioma,
} from "./idioma.ts";

const crudo = (o: Record<string, unknown> = {}) => ({
  id: 1, title: "Un título", overview: "Una sinopsis.",
  original_title: "A Title", original_language: "en", ...o,
});

// Con la config del proceso en es-ES la guarda sale antes: los tests del camino
// real fuerzan `activo` para que el código que dicen probar se ejecute.
const ACTIVO = true;
const porId = { clave: clavePorId, activo: ACTIVO };

// ============================================================================
// Configuración
// ============================================================================

test("el idioma base por default es es-ES: la tanda 1 no cambia el idioma", () => {
  assert.equal(IDIOMA_BASE, "es-ES");
});

test("con el idioma base en es-ES el fallback está INERTE", () => {
  assert.equal(IDIOMA_FALLBACK, "es-ES");
  assert.equal(FALLBACK_ACTIVO, false);
});

test("modo compatible: las claves no llevan huella en la tanda 1", () => {
  assert.equal(HUELLA_EN_CLAVES, "");
});

// ============================================================================
// LA HUELLA — la función REAL, no una réplica
// ============================================================================

test("calcularHuella: las cuatro configuraciones", () => {
  assert.equal(calcularHuella("es-MX", true), "es-MX+f.r1");
  assert.equal(calcularHuella("es-MX", false), "es-MX.r1");
  assert.equal(calcularHuella("es-ES", true), "es-ES.r1");
  // Con base es-ES el fallback es INERTE: apagarlo NO puede abrir un espacio de
  // claves nuevo, o tocar el switch provocaría un arranque frío completo sin
  // cambiar una sola respuesta.
  assert.equal(calcularHuella("es-ES", false), "es-ES.r1");
});

test("HUELLA_IDIOMA sale de calcularHuella, no de una fórmula aparte", () => {
  assert.equal(HUELLA_IDIOMA, calcularHuella(IDIOMA_BASE, process.env.FALLBACK_IDIOMA !== "0"));
});

test("subir la versión del resolver cambia el espacio de claves", () => {
  assert.notEqual(calcularHuella("es-MX", true, "r1"), calcularHuella("es-MX", true, "r2"));
});

// ============================================================================
// EL PREDICADO
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
  const r = queReparar(crudo({
    title: "Nihon no eiga", original_title: "Nihon no eiga",
    original_language: "ja", overview: "Tiene sinopsis.",
  }));
  assert.equal(r.titulo, true);
  assert.equal(r.sinopsis, false);
});

test("EL PASAJE AL INGLÉS NO SE REPARA — verificado con 12 casos", () => {
  for (const [ref, titulo] of [
    ["tv:1399", "Game of Thrones"], ["movie:1084242", "Zootopia 2"],
    ["movie:585", "Monsters, Inc."], ["tv:85271", "WandaVision"],
    ["movie:497698", "Black Widow"], ["tv:4607", "Lost"],
    ["movie:917496", "Beetlejuice Beetlejuice"],
  ]) {
    assert.equal(
      necesitaReparacion(crudo({ title: titulo, original_title: titulo, original_language: "en" })),
      false, `${ref} «${titulo}»`,
    );
  }
});

// ============================================================================
// LA FUSIÓN
// ============================================================================

test("SEÑAL 3: título latino que cayó al original TOMA el título es-ES", () => {
  const base = crudo({
    title: "Nihon no eiga", original_title: "Nihon no eiga",
    original_language: "ja", overview: "La sinopsis ya existe.",
  });
  const out = fusionarPorCampo(base, crudo({ title: "La película japonesa", overview: "Otra." }));
  assert.equal(out.title, "La película japonesa");
  assert.equal(out.overview, "La sinopsis ya existe.", "la sinopsis NO se pisa");
});

test("si solo falta la sinopsis, el título es-MX SE CONSERVA", () => {
  const out = fusionarPorCampo(
    crudo({ title: "Duro de matar", overview: "" }),
    crudo({ title: "Jungla de cristal", overview: "Un policía…" }),
  );
  assert.equal(out.title, "Duro de matar");
  assert.equal(out.overview, "Un policía…");
});

test("DEVUELVE LA MISMA REFERENCIA si nada mejoró", () => {
  // Es lo que permite contar como reparado solo lo que de verdad cambió.
  const sano = crudo();
  assert.equal(fusionarPorCampo(sano, crudo({ title: "Otro" })), sano, "nada que reparar");

  const respaldoInutil = crudo({ title: "런닝맨", original_language: "ko", overview: "Hay." });
  assert.equal(
    fusionarPorCampo(respaldoInutil, crudo({ title: "런닝맨", overview: "" })),
    respaldoInutil, "el respaldo no mejora nada",
  );

  const mismoTitulo = crudo({ title: "X", original_title: "X", original_language: "ja", overview: "Hay." });
  assert.equal(
    fusionarPorCampo(mismoTitulo, crudo({ title: "X", overview: "" })),
    mismoTitulo, "el respaldo trae el mismo título",
  );
});

test("sin respaldo (undefined o null) devuelve la base, y no la muta", () => {
  const base = crudo({ title: "런닝맨", original_language: "ko", overview: "" });
  assert.equal(fusionarPorCampo(base, undefined), base);
  assert.equal(fusionarPorCampo(base, null), base);
  fusionarPorCampo(base, crudo({ title: "Running Man", overview: "x" }));
  assert.equal(base.title, "런닝맨");
});

// ============================================================================
// EL MECANISMO DE LOTE
// ============================================================================

test("INERCIA POR CONFIGURACIÓN: con es-ES, cero llamadas y salida idéntica", async () => {
  // Con un lote que SÍ tiene rotos, para que no pueda pasar por casualidad.
  const rotos = [
    crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" }),
    crudo({ id: 2, overview: "" }),
    crudo({ id: 3, title: "X", original_title: "X", original_language: "ja" }),
  ];
  assert.ok(rotos.every(necesitaReparacion));

  let pedidos = 0;
  const { res, metricas } = await withMetricasIdioma(() =>
    repararLote(rotos, async () => { pedidos++; return []; }, "test", { clave: clavePorId }));

  assert.equal(pedidos, 0);
  assert.equal(metricas.llamadas, 0, "cero llamadas de fallback");
  assert.equal(res.items, rotos, "misma referencia");
  assert.equal(res.fallo, false);
});

test("con el fallback activo: UNA llamada para todo el lote, y repara", async () => {
  const base = [
    crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" }),
    crudo({ id: 2, title: "Bien", overview: "Bien." }),
    crudo({ id: 3, title: "X", original_title: "X", original_language: "ja", overview: "Hay." }),
  ];
  let pedidos = 0;
  const { res, metricas } = await withMetricasIdioma(() => repararLote(base, async () => {
    pedidos++;
    return [
      crudo({ id: 1, title: "Running Man", overview: "Un programa." }),
      crudo({ id: 3, title: "La película", overview: "Otra." }),
    ];
  }, "test", porId));

  assert.equal(pedidos, 1, "UNA llamada, no una por título");
  assert.equal(res.items[0].title, "Running Man");
  assert.equal(res.items[1].title, "Bien", "el sano no se toca");
  assert.equal(res.items[2].title, "La película", "señal 3 reparada");
  assert.equal(res.items[2].overview, "Hay.", "la sinopsis existente no se pisa");
  assert.equal(res.fallo, false);
  assert.equal(metricas.llamadas, 1);
  assert.equal(metricas.lotesConRotos, 1);
  assert.equal(metricas.titulosReparados, 2, "solo los que CAMBIARON");
});

test("un lote SANO no pide respaldo ni con el fallback activo", async () => {
  const sanos = [crudo({ id: 1 }), crudo({ id: 2 })];
  let pedidos = 0;
  const r = await repararLote(sanos, async () => { pedidos++; return []; }, "test", porId);
  assert.equal(pedidos, 0);
  assert.equal(r.items, sanos);
});

// ============================================================================
// FALLO DEL RESPALDO → señal `fallo`, que impide cachear
// ============================================================================

test("rechazo, timeout, null, undefined y lista vacía: base intacta y fallo=true", async () => {
  const base = [crudo({ id: 1, overview: "" })];
  const casos: [string, () => Promise<never[] | null | undefined>][] = [
    ["rechazo", () => Promise.reject(new Error("TMDB 500"))],
    ["timeout", () => Promise.reject(new DOMException("aborted", "TimeoutError"))],
    ["null", async () => null],
    ["undefined", async () => undefined],
    ["vacío", async () => []],
  ];
  for (const [nombre, respaldo] of casos) {
    const { res, metricas } = await withMetricasIdioma(() =>
      repararLote(base, respaldo, `test-${nombre}`, porId));
    assert.deepEqual(res.items, base, `base intacta con ${nombre}`);
    assert.equal(res.fallo, true, `${nombre} tiene que marcar fallo`);
    assert.equal(metricas.fallos, 1, `${nombre} se contabiliza`);
    assert.equal(metricas.titulosReparados, 0);
  }
});

test("REINTENTO: el primer respaldo falla, el segundo repara", async () => {
  // Lo que garantiza el contrato: como el llamador NO cachea cuando `fallo` es
  // true, el próximo request vuelve a entrar al fetcher y vuelve a intentar.
  const base = [crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" })];
  let intento = 0;
  const respaldo = async () => {
    intento++;
    if (intento === 1) throw new Error("TMDB 500");
    return [crudo({ id: 1, title: "Running Man", overview: "Un programa." })];
  };

  const primero = await repararLote(base, respaldo, "test", porId);
  assert.equal(primero.fallo, true, "el primero falla");
  assert.equal(primero.items[0].title, "런닝맨", "sin reparar");

  const segundo = await repararLote(base, respaldo, "test", porId);
  assert.equal(intento, 2, "volvió a llamar");
  assert.equal(segundo.fallo, false);
  assert.equal(segundo.items[0].title, "Running Man", "reparado en el reintento");
});

test("FICHA: rechazo y null devuelven la base con fallo=true", async () => {
  const base = crudo({ overview: "" });
  const r1 = await repararUno(base, () => Promise.reject(new Error("boom")), "t", ACTIVO);
  assert.equal(r1.item, base);
  assert.equal(r1.fallo, true);
  const r2 = await repararUno(base, async () => null, "t", ACTIVO);
  assert.equal(r2.item, base);
  assert.equal(r2.fallo, true);
});

test("repararUno NO cuenta como reparado si la fusión no cambió nada", async () => {
  const base = crudo({ title: "X", original_title: "X", original_language: "ja", overview: "Hay." });
  const { res, metricas } = await withMetricasIdioma(() =>
    repararUno(base, async () => crudo({ title: "X", overview: "" }), "t", ACTIVO));
  assert.equal(res.item, base);
  assert.equal(res.fallo, false);
  assert.equal(metricas.llamadas, 1, "la llamada sí se hizo");
  assert.equal(metricas.titulosReparados, 0, "pero nada cambió");
});

// ============================================================================
// LOTES MIXTOS: película y serie con el MISMO id
// ============================================================================

test("una película y una serie con el mismo ID no se mezclan", async () => {
  // TMDB reutiliza los números entre tipos: la película 1399 y la serie 1399
  // existen las dos. Con `clavePorId` una recibiría el título de la otra.
  const base = [
    { id: 1399, media_type: "movie", title: "런닝맨", original_language: "ko", overview: "" },
    { id: 1399, media_type: "tv", title: "마녀", original_language: "ko", overview: "" },
  ];
  const respaldo = [
    { id: 1399, media_type: "movie", title: "La película", overview: "Cine." },
    { id: 1399, media_type: "tv", title: "La serie", overview: "Tele." },
  ];
  const r = await repararLote(base, async () => respaldo, "mixto", {
    clave: claveMixta, claveRespaldo: claveMixta, activo: ACTIVO,
  });
  assert.equal(r.items[0].title, "La película", "la película recibe lo suyo");
  assert.equal(r.items[0].overview, "Cine.");
  assert.equal(r.items[1].title, "La serie", "la serie recibe lo suyo");
  assert.equal(r.items[1].overview, "Tele.");
});

test("claveMixta distingue tipos; clavePorId no", () => {
  const peli = { id: 1399, media_type: "movie" };
  const serie = { id: 1399, media_type: "tv" };
  assert.notEqual(claveMixta(peli), claveMixta(serie));
  assert.equal(clavePorId(peli), clavePorId(serie), "por eso no sirve en lotes mixtos");
});

// ============================================================================
// MÉTRICAS POR REQUEST
// ============================================================================

test("dos reparaciones CONCURRENTES no se mezclan las métricas", async () => {
  // Con un contador de módulo, el segundo Home reiniciaba los números del
  // primero a mitad de camino. Con AsyncLocalStorage cada scope es suyo.
  const lote = (n: number) => Array.from({ length: n }, (_, i) =>
    crudo({ id: i + 1, title: "런닝맨", original_language: "ko", overview: "" }));
  const resp = (n: number) => async () => Array.from({ length: n }, (_, i) =>
    crudo({ id: i + 1, title: `Arreglado ${i}`, overview: "ok" }));

  const correr = (n: number, ms: number) => withMetricasIdioma(async () => {
    await new Promise((r) => setTimeout(r, ms));
    return repararLote(lote(n), resp(n), `concurrente-${n}`, porId);
  });

  const [a, b] = await Promise.all([correr(3, 10), correr(7, 1)]);
  assert.equal(a.metricas.titulosReparados, 3, "el scope A cuenta solo lo suyo");
  assert.equal(b.metricas.titulosReparados, 7, "el scope B cuenta solo lo suyo");
  assert.equal(a.metricas.llamadas, 1);
  assert.equal(b.metricas.llamadas, 1);
});

test("fuera de un scope, las métricas no rompen nada", async () => {
  assert.equal(metricasIdiomaActuales(), null);
  const r = await repararLote([crudo({ overview: "" })], async () => [crudo()], "t", porId);
  assert.equal(r.fallo, false);
});
