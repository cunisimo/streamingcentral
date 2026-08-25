import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consultaReducida, normalizeTitle, resolverTitulo, type Candidato, type Puertos,
} from "./netflix-resolver.ts";

// El caso real de la semana 2026-08-16, con los datos exactos que devuelve TMDB.
const SAFED_TSV = "Operation Safed Sagar: The Highest Air Force Mission";
const SAFED_REDUCIDA = "Operation Safed Sagar";
const SAFED: Candidato = {
  id: 284753,
  // Ojo: el subtítulo de TMDB es OTRO ("The Untold Story of the Kargil War").
  // Por eso no hay coincidencia de título ni contra el completo ni contra la
  // reducida, y lo que lo resuelve es el proveedor.
  title: "Operation Safed Sagar: The Untold Story of the Kargil War",
};

// Puertos de mentira que ADEMÁS graban lo que se les pidió: varios de los tests
// de abajo son sobre las llamadas que se hacen y las que no.
function puertos(opts: {
  busquedas?: Record<string, Candidato[] | "falla">;
  netflix?: number[] | "falla";
}): Puertos & { consultas: string[]; proveedoresPedidos: number[] } {
  const consultas: string[] = [];
  const proveedoresPedidos: number[] = [];
  return {
    consultas, proveedoresPedidos,
    async buscar(q) {
      consultas.push(q);
      const r = opts.busquedas?.[q];
      if (r === "falla") throw new Error("TMDB 503");
      return r ?? [];
    },
    async enNetflixAR(id) {
      proveedoresPedidos.push(id);
      // `enNetflixAR` NUNCA lanza: el llamador real traga el error y devuelve
      // false. Eso es lo que hace que una caída no pueda aceptar nada.
      if (opts.netflix === "falla") return false;
      return (opts.netflix ?? []).includes(id);
    },
  };
}

// ============================================================================
// La consulta reducida: qué es y cuándo existe
// ============================================================================

test("la consulta reducida es exactamente la parte anterior a los dos puntos", () => {
  assert.equal(consultaReducida(SAFED_TSV), SAFED_REDUCIDA);
});

test("sin dos puntos no hay consulta reducida", () => {
  assert.equal(consultaReducida("Moria"), null);
});

test("los dos puntos SIN espacio no son un subtítulo (3:10 to Yuma)", () => {
  // El único caso en 209 títulos con ':' de la historia del TSV argentino. Es
  // una hora, no un separador, y reducir a "3" es la peor consulta posible:
  // devuelve cualquier cosa, y cualquier cosa puede estar en Netflix AR.
  assert.equal(consultaReducida("3:10 to Yuma"), null);
});

test("los dos puntos al final no dejan nada que buscar", () => {
  assert.equal(consultaReducida("Foo: "), null);
  assert.equal(consultaReducida(": Bar"), null);
});

// ============================================================================
// El caso que motivó todo
// ============================================================================

test("consulta completa sin resultados + reducida válida resuelve tv:284753", async () => {
  const p = puertos({
    busquedas: { [SAFED_TSV]: [], [SAFED_REDUCIDA]: [SAFED] },
    netflix: [284753],
  });
  const r = await resolverTitulo(SAFED_TSV, p);
  assert.equal(r.tmdbId, 284753);
  // El subtítulo de TMDB no es el del TSV, así que la fila queda marcada para
  // revisión. Tiene el id correcto, que es lo que importa.
  assert.equal(r.needsReview, true);
});

test("la segunda consulta es literalmente Operation Safed Sagar", async () => {
  const p = puertos({
    busquedas: { [SAFED_TSV]: [], [SAFED_REDUCIDA]: [SAFED] },
    netflix: [284753],
  });
  await resolverTitulo(SAFED_TSV, p);
  assert.deepEqual(p.consultas, [SAFED_TSV, SAFED_REDUCIDA]);
});

// ============================================================================
// Qué se acepta de la consulta reducida y qué no
// ============================================================================

test("candidato único con Netflix AR: se acepta", async () => {
  const p = puertos({
    busquedas: { "A: B": [], A: [{ id: 7, title: "Otro nombre" }] },
    netflix: [7],
  });
  assert.deepEqual(await resolverTitulo("A: B", p), { tmdbId: 7, needsReview: true });
});

test("candidato único con el título de la reducida: se acepta sin proveedores", async () => {
  // Es el caso "Moria" trasladado al resolvedor: un estreno que TMDB ficha pero
  // todavía no ubica en ninguna plataforma. Sin esto, el lag de proveedores nos
  // haría perder el id de un título que identificamos bien.
  const p = puertos({
    busquedas: { "Talamasca: X": [], Talamasca: [{ id: 9, title: "Talamasca" }] },
    netflix: [],
  });
  assert.deepEqual(await resolverTitulo("Talamasca: X", p), { tmdbId: 9, needsReview: true });
});

test("VARIOS candidatos en la reducida: no se acepta ninguno", async () => {
  // El corazón de la regla. La reducida tira información a la basura, así que
  // sólo vale si TMDB devuelve UN resultado: ahí el nombre es inequívoco para
  // TMDB, no para nosotros. "Monster: The Ed Gein Story" reduce a "Monster", y
  // entre varios "Monster" alguno va a estar en Netflix AR — aceptar el primero
  // sería inventar una asociación.
  const p = puertos({
    busquedas: {
      "Monster: The Ed Gein Story": [],
      Monster: [{ id: 1, title: "Monster" }, { id: 2, title: "Monster" }],
    },
    netflix: [1, 2],
  });
  assert.deepEqual(
    await resolverTitulo("Monster: The Ed Gein Story", p),
    { tmdbId: null, needsReview: true },
  );
});

test("candidato único, sin Netflix AR y con otro título: no se acepta", async () => {
  const p = puertos({ busquedas: { "A: B": [], A: [{ id: 5, title: "Cualquier otra" }] }, netflix: [] });
  assert.deepEqual(await resolverTitulo("A: B", p), { tmdbId: null, needsReview: true });
});

// ============================================================================
// Cuándo NO se hace la segunda consulta
// ============================================================================

test("si la completa resuelve por título exacto, no hay segunda consulta", async () => {
  const p = puertos({
    busquedas: { "Elize: Shadows of a Woman": [{ id: 3, title: "Elize: Shadows of a Woman" }] },
  });
  const r = await resolverTitulo("Elize: Shadows of a Woman", p);
  assert.deepEqual(r, { tmdbId: 3, needsReview: false });
  assert.deepEqual(p.consultas, ["Elize: Shadows of a Woman"]);
  // Ni siquiera se consultan proveedores: el título exacto ya alcanza.
  assert.deepEqual(p.proveedoresPedidos, []);
});

test("si la completa resuelve por Netflix AR, no hay segunda consulta", async () => {
  const p = puertos({ busquedas: { "A: B": [{ id: 4, title: "Otro" }] }, netflix: [4] });
  assert.deepEqual(await resolverTitulo("A: B", p), { tmdbId: 4, needsReview: true });
  assert.deepEqual(p.consultas, ["A: B"]);
});

test("un título sin dos puntos que no resuelve no dispara una segunda consulta", async () => {
  const p = puertos({ busquedas: { Moria: [] } });
  assert.deepEqual(await resolverTitulo("Moria", p), { tmdbId: null, needsReview: true });
  assert.deepEqual(p.consultas, ["Moria"]);
});

// ============================================================================
// Caídas de TMDB
// ============================================================================

test("si la búsqueda completa se cae, no se asocia nada NI se intenta la reducida", async () => {
  // Una caída no es "no encontré": es "no sé". Seguir con la reducida sería
  // decidir con menos información justo cuando la información falta.
  const p = puertos({
    busquedas: { [SAFED_TSV]: "falla", [SAFED_REDUCIDA]: [SAFED] },
    netflix: [284753],
  });
  assert.deepEqual(await resolverTitulo(SAFED_TSV, p), { tmdbId: null, needsReview: true });
  assert.deepEqual(p.consultas, [SAFED_TSV]);
});

test("si la búsqueda reducida se cae, no se asocia nada", async () => {
  const p = puertos({ busquedas: { "A: B": [], A: "falla" }, netflix: [1] });
  assert.deepEqual(await resolverTitulo("A: B", p), { tmdbId: null, needsReview: true });
});

test("si el chequeo de proveedores se cae, no se asocia por proveedor", async () => {
  // `enNetflixAR` devuelve false ante un error, así que una caída se ve igual
  // que "no está en Netflix": no acepta, no inventa.
  const p = puertos({ busquedas: { "A: B": [], A: [{ id: 6, title: "Otro" }] }, netflix: "falla" });
  assert.deepEqual(await resolverTitulo("A: B", p), { tmdbId: null, needsReview: true });
});

// ============================================================================
// Eficiencia y efectos
// ============================================================================

test("un candidato que ya se chequeó no se vuelve a pedir a la red", async () => {
  const p = puertos({
    busquedas: { "A: B": [{ id: 8, title: "X" }], A: [{ id: 8, title: "A" }] },
    netflix: [],
  });
  const r = await resolverTitulo("A: B", p);
  // Aparece en las dos consultas, pero el proveedor se consulta UNA vez.
  assert.deepEqual(p.proveedoresPedidos, [8]);
  // Y se acepta igual: contra la reducida su título SÍ coincide.
  assert.deepEqual(r, { tmdbId: 8, needsReview: true });
});

test("no muta los candidatos que le pasan", async () => {
  const cand: Candidato = { id: 284753, title: SAFED.title };
  const copia = { ...cand };
  const p = puertos({ busquedas: { [SAFED_TSV]: [], [SAFED_REDUCIDA]: [cand] }, netflix: [284753] });
  await resolverTitulo(SAFED_TSV, p);
  assert.deepEqual(cand, copia);
});

// ============================================================================
// La normalización que usan las comparaciones
// ============================================================================

test("normalizeTitle ignora acentos, mayúsculas y puntuación", () => {
  assert.equal(normalizeTitle("¡Qué bello es vivir!"), "que bello es vivir");
  assert.equal(normalizeTitle("Operation  Safed   Sagar"), "operation safed sagar");
});
