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
  evidenciaEnlaceOficial, PLATAFORMAS_OFICIALES, type DatosSerie,
} from "./enlace-oficial.ts";
import {
  resolverDisponibilidad, vigente, type ExcepcionManual,
} from "./disponibilidad.ts";
import type { PlatformCode } from "./types";

const HOY = "2026-08-30";

/**
 * Aplana un mapa por región al conjunto plano que consume la regla.
 *
 * Las fixtures se escriben por región porque así se lee de dónde sale cada
 * dato, pero lo que se guarda en `pv2:` son los ids únicos: el mapa completo
 * costaba 1273 B por título contra 296 B, medido, y la regla sólo deriva dos
 * booleanos. AR se excluye acá igual que en `providersOf`.
 */
const deRegiones = (m: Record<string, number[]>): number[] =>
  [...new Set(Object.entries(m).filter(([r]) => r !== "AR").flatMap(([, v]) => v))];

// El caso testigo, con los datos REALES medidos el 2026-08-30 contra TMDB.
// Ver docs/medidas/2026-08-30-disponibilidad-disney.json.
const GUTIERREZ: DatosSerie = {
  estreno: "2026-08-26",
  redes: [2739],
  homepage: "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  // ID, MY y US: las tres con Disney+ (122 en Asia, 337 en US). Corrobora.
  idsOtrasRegiones: deRegiones({ ID: [122], MY: [122], US: [337, 15] }),
};

const sinAR = (o: Partial<DatosSerie> = {}): DatosSerie => ({ ...GUTIERREZ, ...o });

// ============================================================================
// 1. Evidencia oficial estricta — las seis condiciones, y cada forma de fallar
// ============================================================================

test("caso testigo: red Disney+ + enlace específico + estrenada -> d", () => {
  assert.equal(evidenciaEnlaceOficial({ tipo: "tv", datos: GUTIERREZ, hoy: HOY }), "d");
});

test("red SIN enlace: no se infiere", () => {
  // `networks` solo NUNCA alcanza. Es el error que la documentación vieja
  // prohibía en absoluto y que ahora se permite sólo acompañado.
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ homepage: "" }), hoy: HOY }),
    null,
  );
});

test("enlace SIN red: no se infiere", () => {
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ redes: [] }), hoy: HOY }),
    null,
  );
});

test("red y enlace de plataformas DISTINTAS: no se infiere", () => {
  // Red Netflix (213) con homepage de Disney+. Cada dato solo podría parecer
  // suficiente; juntos se contradicen.
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ redes: [213] }), hoy: HOY }),
    null,
  );
});

// El registro real tiene UNA sola plataforma, así que la ambigüedad no se puede
// ejercitar con él. Se inyecta un registro de dos para probar LA REGLA, que es
// lo que tiene que seguir valiendo el día que se sume la segunda plataforma.
const DOS_PLATAFORMAS = [
  PLATAFORMAS_OFICIALES[0],
  { ...PLATAFORMAS_OFICIALES[0], code: "n" as PlatformCode, redes: [213],
    hosts: ["www.netflix.com"], idsGlobales: [8] },
];

test("dos redes de plataformas soportadas DISTINTAS: ambiguo, no se infiere", () => {
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", datos: sinAR({ redes: [2739, 213] }), hoy: HOY,
      registro: DOS_PLATAFORMAS,
    }),
    null,
  );
});

test("con el registro de dos, una sola red soportada sigue resolviendo", () => {
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", datos: sinAR({ redes: [2739] }), hoy: HOY,
      registro: DOS_PLATAFORMAS,
    }),
    "d",
  );
});

test("una red soportada + redes que no lo son: sigue valiendo", () => {
  // Caso real de la muestra: YouTube(247) + Disney+(2739). YouTube no es una
  // plataforma soportada, así que no crea ambigüedad.
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ redes: [247, 2739] }), hoy: HOY }),
    "d",
  );
});

// --- dominios: lo que un `includes("disneyplus.com")` dejaría pasar ---

for (const [etiqueta, url] of Object.entries({
  "subdominio malicioso": "https://disneyplus.com.evil.ru/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  "dominio parecido": "https://disneyplus-ar.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  "marca en el path": "https://evil.example/disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  "marca en la query": "https://evil.example/x?u=https://www.disneyplus.com/browse/entity-bafb5cb7",
  "subdominio propio no aprobado": "https://press.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  "http en vez de https": "http://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
  "otro dominio del mismo grupo": "https://www.marvel.com/watch/digital-series/countdown",
  "plataforma no soportada en AR": "https://www.hulu.com/series/2020-britains-most-notorious",
})) {
  test(`dominio rechazado — ${etiqueta}`, () => {
    assert.equal(
      evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ homepage: url }), hoy: HOY }),
      null,
      `${etiqueta} NO debería servir como evidencia`,
    );
  });
}

// --- rutas: el enlace tiene que apuntar a UN título ---

for (const [etiqueta, url] of Object.entries({
  portada: "https://www.disneyplus.com/",
  "portada con /home": "https://www.disneyplus.com/home",
  "página de suscripción": "https://www.disneyplus.com/sign-up",
  "listado corporativo": "https://www.disneyplus.com/brand/marvel",
  "browse sin entidad": "https://www.disneyplus.com/browse",
  // El cuantificador era `{0,12}` y aceptaba cero caracteres finales: una ruta
  // terminada en guion pasaba como si fuera un UUID.
  "entidad terminada en guion": "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-",
  "identificador incompleto": "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5",
  "entidad sin el ultimo grupo": "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb",
  "entidad vacía": "https://www.disneyplus.com/browse/entity-",
})) {
  test(`ruta rechazada — ${etiqueta}`, () => {
    assert.equal(
      evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ homepage: url }), hoy: HOY }),
      null,
      `${etiqueta} no es un enlace a un título`,
    );
  });
}

test("URL explícita de OTRA región: no vale como evidencia argentina", () => {
  // Caso real de la muestra: tv:325313 "Olivia", con /es-es/ (España).
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", hoy: HOY,
      datos: sinAR({
        homepage: "https://www.disneyplus.com/es-es/browse/entity-3c055b32-28f7-4c27-8a0b-7a8cd91",
        idsOtrasRegiones: deRegiones({ ES: [337] }),
      }),
    }),
    null,
  );
});

test("URL de la propia región argentina: sí vale", () => {
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", hoy: HOY,
      datos: sinAR({
        homepage: "https://www.disneyplus.com/es-ar/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
      }),
    }),
    "d",
  );
});

// --- fecha ---

test("serie FUTURA: no se infiere", () => {
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ estreno: "2026-09-15" }), hoy: HOY }),
    null,
  );
});

test("estrena HOY (hora argentina): sí se infiere", () => {
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ estreno: HOY }), hoy: HOY }),
    "d",
  );
});

test("sin fecha de estreno: no se infiere", () => {
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "tv", datos: sinAR({ estreno: null }), hoy: HOY }),
    null,
  );
});

// --- películas ---

test("PELÍCULA con datos parecidos: la regla de redes no aplica", () => {
  // `networks` es un campo de series. Una película nunca lo tiene, y si algo lo
  // simulara tampoco habría que usarlo.
  assert.equal(
    evidenciaEnlaceOficial({ tipo: "movie", datos: GUTIERREZ, hoy: HOY }),
    null,
  );
});

// --- datos regionales contradictorios ---

test("otras regiones lo ubican en OTRA plataforma: no se infiere", () => {
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", hoy: HOY,
      datos: sinAR({ idsOtrasRegiones: deRegiones({ US: [8], GB: [8] }) }), // Netflix
    }),
    null,
  );
});

test("ninguna región con datos: no hay contradicción, se infiere", () => {
  // Caso real: tv:328337 "Bluey Compilados", 0 regiones con flatrate.
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", datos: sinAR({ idsOtrasRegiones: deRegiones({}) }), hoy: HOY,
    }),
    "d",
  );
});

test("alguna región con la MISMA plataforma corrobora, aunque otras difieran", () => {
  // Caso real: tv:330160, con Disney+ en 15 regiones y JioHotstar en IN.
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", hoy: HOY,
      datos: sinAR({ idsOtrasRegiones: deRegiones({ IN: [2336], US: [337] }) }),
    }),
    "d",
  );
});

test("los datos de AR no llegan siquiera a esta regla", () => {
  // Doble protección, y las dos importan:
  //  1. `resolverDisponibilidad` corta antes si AR tiene flatrate (`hayFlatrateAR`).
  //  2. `providersOf` excluye AR al armar `idsOtrasRegiones`, así que aunque se
  //     llamara a esta función con un título que TMDB ubica en AR, el chequeo de
  //     contradicción no lo vería. La regla mira el mundo, no Argentina.
  assert.equal(
    evidenciaEnlaceOficial({
      tipo: "tv", hoy: HOY,
      datos: sinAR({ idsOtrasRegiones: deRegiones({ AR: [337] }) }),
    }),
    "d",
  );
});

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
    leerDatosSerie: async () => { consultas++; return GUTIERREZ; },
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
    leerDatosSerie: async () => { consultas++; return GUTIERREZ; },
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
    leerTopOficial: nadaTop, leerDatosSerie: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
});

test("la señal por defecto es `false`: no cambia lo que ya andaba", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosSerie: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
});

test("NO muta el array cacheado de TMDB", async () => {
  const cacheado: PlatformCode[] = ["m"];
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 1, deTmdb: cacheado, hoy: HOY,
    leerTopOficial: nadaTop, leerDatosSerie: nadaSerie,
  });
  assert.equal(r.plataformas, cacheado, "debería devolver el MISMO array");
  assert.deepEqual(cacheado, ["m"], "el array cacheado cambió");
});

test("caso testigo end-to-end: TMDB vacío -> enlace oficial -> d", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop,
    leerDatosSerie: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "enlace-oficial");
});

test("Moria conserva Netflix por el top oficial, y ANTES que el enlace", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 322428, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => new Set(["tv:322428"]),
    leerDatosSerie: async () => GUTIERREZ, // aunque hubiera enlace, gana el top
  });
  assert.deepEqual(r.plataformas, ["n"]);
  assert.equal(r.procedencia, "top-oficial");
});

test("un título que NO está en el top no hereda nada", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 999999, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => new Set(["tv:322428"]),
    leerDatosSerie: nadaSerie,
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
    leerDatosSerie: async () => { throw new Error("tmdb caído"); },
  });
  assert.deepEqual(r.plataformas, []);
  assert.equal(r.procedencia, null);
  assert.equal(r.fallo, true, "el fallo tiene que viajar para no cachearse");
});

test("sin fallo, `fallo` es false", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 1, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosSerie: nadaSerie,
  });
  assert.equal(r.fallo, false);
});

test("un fallo del top no impide probar el enlace oficial", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: async () => { throw new Error("caído"); },
    leerDatosSerie: async () => GUTIERREZ,
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "enlace-oficial");
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
    leerTopOficial: nadaTop, leerDatosSerie: nadaSerie,
    excepciones: [EXC()],
  });
  assert.deepEqual(r.plataformas, ["d"]);
  assert.equal(r.procedencia, "manual");
});

test("excepción manual VENCIDA no se aplica", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 111, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop, leerDatosSerie: nadaSerie,
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
    leerTopOficial: nadaTop, leerDatosSerie: nadaSerie,
    excepciones: [EXC({ region: "US" })],
  });
  assert.deepEqual(r.plataformas, []);
});

test("la excepción manual es la ÚLTIMA prioridad, no la primera", async () => {
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 275224, deTmdb: [], hoy: HOY,
    leerTopOficial: nadaTop,
    leerDatosSerie: async () => GUTIERREZ,
    excepciones: [EXC({ clave: "tv:275224", plataforma: "m" })],
  });
  assert.deepEqual(r.plataformas, ["d"], "ganó la excepción manual sobre el enlace oficial");
  assert.equal(r.procedencia, "enlace-oficial");
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
