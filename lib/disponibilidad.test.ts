// La resolución centralizada de disponibilidad.
//
// Todo lo que muestra "está en X" pasa por acá: ficha, cards, búsqueda,
// relacionados, listas y Home. Antes cada superficie decidía por su cuenta y
// por eso el arreglo de Moria (top oficial de Netflix) quedó atado a la ficha:
// era correcto y no era general.
//
// 🔴 LA REGLA QUE ORDENA TODO: la evidencia adicional sólo puede AGREGAR
// disponibilidad cuando TMDB no sabe nada. Nunca contradice a TMDB, nunca la
// reemplaza, y si algo falla se devuelve lo que TMDB dijo. Una caída nuestra no
// puede producir una afirmación de disponibilidad.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type DatosTitulo, type ResumenRegional,
} from "./enlace-oficial.ts";
import {
  resolverDisponibilidad, vigente, type ExcepcionManual,
} from "./disponibilidad.ts";
import type { PlatformCode } from "./types";

const HOY = "2026-08-30";

/**
 * El resumen regional que guarda `pv3:`, armado desde un mapa por región.
 *
 * Las fixtures se escriben por región porque así se lee de dónde sale cada
 * dato, pero lo que se guarda son TRES CONTADORES: `pv2:` guardaba ids
 * deduplicados y con eso no se puede comprobar la dominancia por regiones,
 * porque la deduplicación se comió la frecuencia.
 */
const deRegiones = (m: Record<string, number[]>): ResumenRegional => {
  const GLOB: Record<string, number[]> = {
    n: [8, 1796], d: [337, 122], p: [119, 2100, 9],
    m: [1899, 1825, 384], pp: [531, 582, 1853], at: [350, 2243],
  };
  const rp: Record<string, number> = {}; let rt = 0, ru = 0;
  for (const [region, ids] of Object.entries(m)) {
    if (region === "AR" || !ids.length) continue;
    rt++; let alguna = false;
    for (const [code, g] of Object.entries(GLOB)) {
      if (ids.some((i) => g.includes(i))) { rp[code] = (rp[code] ?? 0) + 1; alguna = true; }
    }
    if (!alguna) ru++;
  }
  return { rt, rp: rp as ResumenRegional["rp"], ru };
};

const GUTIERREZ: DatosTitulo = {
  tipo: "tv",
  estreno: "2026-08-26",
  redes: [2739],
  homepage: "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  reg: deRegiones({ ID: [122], MY: [122], US: [337, 15] }),
};
const sinAR = (o: Partial<DatosTitulo> = {}): DatosTitulo => ({ ...GUTIERREZ, ...o });

// ⚠️ LA SECCIÓN DE LA REGLA SE MUDÓ. Las condiciones de la evidencia oficial
// —dominios, rutas, locales, redes, contradicción, series vs películas— ahora
// viven en `lib/evidencia-oficial.test.ts`, que cubre las SEIS plataformas con
// casos positivos y canarios negativos por cada una. Acá queda lo que es de
// este módulo: la PRIORIDAD del resolvedor y la procedencia.

// ============================================================================
// 2. El resolvedor central — prioridad y procedencia
// ============================================================================

const nadaTop = async () => new Set<string>();
const nadaSerie = async () => null;

test("TMDB AR con proveedores: prevalece y NO consulta ningún respaldo", async () => {
  let consultas = 0;
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: ["d"] as PlatformCode[], hoy: HOY,
    leerTopOficial: async () => { consultas++; return new Set<string>(); },
    leerDatosTitulo: async () => { consultas++; return GUTIERREZ; },
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "tmdb-ar");
  assert.equal(consultas, 0, "consultó un respaldo teniendo dato de TMDB");
});

test("TMDB tiene flatrate AR que Yump no mapea: NO se consulta ningún respaldo", async () => {
  // 🔴 EL CASO QUE SE ESCAPABA. `providersOf` descarta los provider_id de AR que
  // no tienen código en `providers-ar.ts`, así que `codes` queda vacío — igual
  // que si TMDB no supiera nada. No es lo mismo: TMDB SÍ sabe, y dice que está
  // en otra plataforma. Inferir Disney+ ahí sería contradecir a TMDB, que es
  // exactamente lo que los respaldos no pueden hacer.
  let consultas = 0;
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hayFlatrateAR: true, hoy: HOY,
    leerTopOficial: async () => { consultas++; return new Set(["tv:275224"]); },
    leerDatosTitulo: async () => { consultas++; return GUTIERREZ; },
    excepciones: [EXC({ clave: "tv:275224" })],
  });
  assert.deepEqual(r.plataformas, [], "infirió una plataforma pisando el dato de TMDB");
  assert.equal(r.procedencia, "tmdb-ar", "la procedencia tiene que decir que mandó TMDB");
  assert.equal(consultas, 0, "consultó un respaldo teniendo flatrate AR");
});

test("sin flatrate AR sí se consultan los respaldos", async () => {
  // El control del test de arriba: la misma llamada con la señal en false.
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hayFlatrateAR: false, hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
});

test("la señal por defecto es `false`: no cambia lo que ya andaba", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
});

test("NO muta el array cacheado de TMDB", async () => {
  const cacheado: PlatformCode[] = ["m"];
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 1, deTmdb: cacheado, hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
  });
  assert.equal(r.plataformas, cacheado, "debería devolver el MISMO array");
  assert.deepEqual(cacheado, ["m"], "el array cacheado cambió");
});

test("caso testigo end-to-end: TMDB vacío -> enlace oficial -> d", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop,
    leerDatosTitulo: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "oficial-probable");
});

test("Moria conserva Netflix por el top oficial, y ANTES que el enlace", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 322428, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => new Set(["tv:322428"]),
    leerDatosTitulo: async () => GUTIERREZ, // aunque hubiera enlace, gana el top
  });
  assert.deepEqual(r.plataformas, ["n"]);
  assert.equal(r.procedencia, "top-oficial");
});

test("un título que NO está en el top no hereda nada", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 999999, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => new Set(["tv:322428"]),
    leerDatosTitulo: nadaSerie,
  });
  assert.deepEqual(r.plataformas, []);
  assert.equal(r.procedencia, null);
});

test("un fallo de la evidencia NO se convierte en ausencia definitiva", async () => {
  // Supabase caído y TMDB caído: se devuelve lo de TMDB tal cual, sin inventar
  // ni cachear un "no está en ningún lado".
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => { throw new Error("supabase caído"); },
    leerDatosTitulo: async () => { throw new Error("tmdb caído"); },
  });
  assert.deepEqual(r.plataformas, []);
  assert.equal(r.procedencia, null);
  assert.equal(r.fallo, true, "el fallo tiene que viajar para no cachearse");
});

test("sin fallo, `fallo` es false", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 1, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
  });
  assert.equal(r.fallo, false);
});

test("un fallo del top no impide probar el enlace oficial", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => { throw new Error("caído"); },
    leerDatosTitulo: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "oficial-probable");
  assert.equal(r.fallo, true);
});

// ============================================================================
// 3. Registro manual versionado
// ============================================================================

const EXC = (o: Partial<ExcepcionManual> = {}): ExcepcionManual => ({
  clave: "tv:111", plataforma: "d", region: "AR",
  fuente: "https://www.disneyplus.com/browse/entity-0000",
  verificado: "2026-08-01", vence: "2026-12-01", ...o,
});

test("excepción manual VIGENTE se aplica", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 111, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
    excepciones: [EXC()],
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "manual");
});

test("excepción manual VENCIDA no se aplica", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 111, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
    excepciones: [EXC({ vence: "2026-08-29" })],
  });
  assert.deepEqual(r.plataformas, []);
  assert.equal(r.procedencia, null);
});

test("vence HOY todavía vale; el día siguiente no", () => {
  assert.equal(vigente(EXC({ vence: HOY }), HOY), true);
  assert.equal(vigente(EXC({ vence: "2026-08-29" }), HOY), false);
});

test("una excepción de otra región no se aplica en AR", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 111, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
    excepciones: [EXC({ region: "US" })],
  });
  assert.deepEqual(r.plataformas, []);
});

test("la excepción manual es la ÚLTIMA prioridad, no la primera", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop,
    leerDatosTitulo: async () => GUTIERREZ,
    excepciones: [EXC({ clave: "tv:275224", plataforma: "m" })],
  });
  assert.deepEqual(r.plataformas, ["d"], "ganó la excepción manual sobre el enlace oficial");
  assert.equal(r.procedencia, "oficial-probable");
});

test("el registro versionado del repo no hardcodea el caso testigo", async () => {
  const { EXCEPCIONES } = await import("./excepciones-disponibilidad.ts");
  for (const e of EXCEPCIONES) {
    assert.notEqual(e.clave, "tv:275224", "Gutiérrez está hardcodeado como excepción");
  }
});

test("toda excepción del repo está bien formada", async () => {
  const { EXCEPCIONES } = await import("./excepciones-disponibilidad.ts");
  for (const e of EXCEPCIONES) {
    assert.match(e.clave, /^(movie|tv):\d+$/, `clave inválida: ${e.clave}`);
    assert.match(e.verificado, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(e.vence, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.fuente.startsWith("https://"), "la fuente tiene que ser una URL https");
    assert.ok(e.vence > e.verificado, "vence antes de haberse verificado");
  }
});

// ============================================================================
// Procedencia `top-manual`: el Top semanal cargado a mano
// ============================================================================
//
// El dueño arma los doce bloques de `/top` eligiendo cada título y confirmando
// en qué plataforma está. Esa confirmación es un dato verificado a mano, y es la
// respuesta al agujero del issue #16: TMDB tarda en publicar el proveedor
// argentino de un estreno, y mientras tanto el título se ve en gris.
//
// 🔴 ENTRA POR EL RESOLVEDOR CENTRAL, NO POR UN CAMINO PROPIO DE `/top`. Si
// viviera sólo en `/top`, la misma película saldría en color ahí y en gris en la
// ficha, la búsqueda y el Home — que es exactamente el bug que el resolvedor
// central existe para impedir (ver el encabezado de este archivo).
//
// Las reglas de siempre valen igual: sólo habla cuando TMDB no sabe nada, nunca
// contradice, y un fallo de lectura es "no sé" y no se cachea.

const SIN_MANUAL = async () => new Map<string, PlatformCode[]>();

test("el Top manual resuelve un título que TMDB no ubica", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 322428, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
    leerTopManual: async () => new Map([["tv:322428", ["n"] as PlatformCode[]]]),
  });
  assert.deepEqual(r.plataformas, ["n"]);
  assert.equal(r.procedencia, "top-manual");
});

test("🔴 el Top manual NO se consulta si TMDB sabe algo", async () => {
  // Ni siquiera se pide: es la misma optimización que el resto de los respaldos,
  // y a la vez la garantía de que no puede contradecir a TMDB.
  for (const caso of [
    { deTmdb: ["d"] as PlatformCode[], hayFlatrateAR: false },
    { deTmdb: [] as PlatformCode[], hayFlatrateAR: true },
  ]) {
    let consultas = 0;
    const r = await resolverDisponibilidad({
      tipo: "tv", id: 322428, ...caso, hoy: HOY,
      leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
      leerTopManual: async () => { consultas++; return new Map([["tv:322428", ["n"] as PlatformCode[]]]); },
    });
    assert.equal(consultas, 0, "consultó el Top manual teniendo dato de TMDB");
    assert.equal(r.procedencia, "tmdb-ar");
    assert.deepEqual(r.plataformas, caso.deTmdb);
  }
});

test("un fallo del Top manual es «no sé»: no niega, y no se cachea", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 322428, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
    leerTopManual: async () => { throw new Error("Supabase caído"); },
  });
  assert.deepEqual(r.plataformas, [], "una caída nuestra produjo una afirmación");
  assert.equal(r.fallo, true, "no marcó el fallo: esto se iba a cachear");
});

test("sin lector de Top manual, todo sigue como antes", async () => {
  // El parámetro es opcional a propósito: los tests y llamadores viejos no
  // cambian de comportamiento por existir esta procedencia.
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 1, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosTitulo: nadaSerie,
  });
  assert.equal(r.procedencia, null);
  assert.equal(r.fallo, false);
});

test("el Top manual va DESPUÉS del top oficial y ANTES del enlace probable", async () => {
  // Los dos primeros son hechos publicados; el tercero es una regla que infiere.
  // El orden sólo importa cuando dos discrepan, que es raro, pero cuando pasa
  // gana el dato sobre la inferencia.
  const conTodo = {
    tipo: "tv" as const, id: 275224, deTmdb: [] as PlatformCode[], hoy: HOY,
    leerTopManual: async () => new Map([["tv:275224", ["n"] as PlatformCode[]]]),
    leerDatosTitulo: async () => GUTIERREZ,
  };
  const gana = await resolverDisponibilidad({ ...conTodo, leerTopOficial: nadaTop });
  assert.equal(gana.procedencia, "top-manual", "el enlace probable le ganó al dato manual");

  const oficial = await resolverDisponibilidad({
    ...conTodo, leerTopOficial: async () => new Set(["tv:275224"]),
  });
  assert.equal(oficial.procedencia, "top-oficial");
});
