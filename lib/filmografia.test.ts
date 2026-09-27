// Filmografía de una persona (`personFilmography` en lib/enrich.ts).
//
// Dos bugs, encontrados con Denis Villeneuve en producción (27/09):
//
//   1. La reparación de idioma reconstruía los créditos con un índice por
//      `media_type:id`. Una persona puede tener VARIOS créditos en la misma obra
//      (Duna: Director, Producer, Screenplay) y el último pisaba `job`,
//      `department` y `character` de los demás: Duna y Duna: Parte dos dejaban de
//      ser créditos de dirección y desaparecían de la ficha.
//   2. `merged.slice(0, 40)` recortaba ANTES de saber qué estaba en las
//      plataformas del usuario: las carreras largas perdían obras en silencio.
//
// Todo se prueba sobre lógica pura, sin TMDB: las dependencias se inyectan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveMixta, conRespuesto, indiceMixto, repararLote } from "./idioma.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import {
  armarFilmografia, esActuacion, esAparicionPropia, ordenDeSecciones,
  primeroEnTusPlataformas, repararCreditos, seccionesDeCreditos,
  type CreditoPersona,
} from "./filmografia.ts";
import type { PlatformCode, UITitle } from "./types.ts";

// --- Datos -------------------------------------------------------------------
const cred = (o: Partial<CreditoPersona> & { id: number }): CreditoPersona => ({
  media_type: "movie", title: `Obra ${o.id}`, overview: "Sinopsis.", original_language: "en",
  vote_count: 100, genre_ids: [18], ...o,
});

// Los créditos REALES de Villeneuve en las dos Duna, en el orden en que los
// trae TMDB (combined_credits, 27/09). El orden importa: el índice viejo
// conservaba el ÚLTIMO de cada obra.
const DUNA = 438631;
const DUNA2 = 693134;
const crewVilleneuve: CreditoPersona[] = [
  cred({ id: DUNA, title: "Duna", job: "Director", department: "Directing", vote_count: 14000 }),
  cred({ id: DUNA, title: "Duna", job: "Producer", department: "Production", vote_count: 14000 }),
  cred({ id: DUNA, title: "Duna", job: "Screenplay", department: "Writing", vote_count: 14000 }),
  cred({ id: DUNA2, title: "Duna: Parte dos", job: "Screenplay", department: "Writing", vote_count: 7000 }),
  cred({ id: DUNA2, title: "Duna: Parte dos", job: "Director", department: "Directing", vote_count: 7000 }),
  cred({ id: DUNA2, title: "Duna: Parte dos", job: "Producer", department: "Production", vote_count: 7000 }),
  cred({ id: 329865, title: "La llegada", job: "Director", department: "Directing", vote_count: 18000 }),
  cred({ id: 335984, title: "Blade Runner 2049", job: "Director", department: "Directing", vote_count: 14500 }),
];
const castVilleneuve: CreditoPersona[] = [
  cred({ id: 900001, media_type: "tv", title: "Un talk show", character: "Self", genre_ids: [10767] }),
  cred({ id: DUNA, title: "Duna", character: "Self (archive footage)" }),
];

// Implementación ANTERIOR (lib/enrich.ts hasta 2af1a37), copiada a propósito:
// sin ella, un test que pasara con las dos versiones no demostraría el arreglo
// (docs/MANTENIMIENTO.md §8.b).
async function repararCreditosViejo(cast: CreditoPersona[], crew: CreditoPersona[]) {
  const planos = [...cast, ...crew];
  const rep = await repararLote(planos, async () => [], "viejo", { clave: claveMixta, claveRespaldo: claveMixta, activo: true });
  const idx = indiceMixto(rep.items, claveMixta);
  return {
    cast: cast.map((c) => ({ ...c, ...conRespuesto(idx, c, claveMixta) })),
    crew: crew.map((c) => ({ ...c, ...conRespuesto(idx, c, claveMixta) })),
  };
}

const sinRespaldo = async () => [];

// --- 1 y 9: la reparación no toca campos estructurales -----------------------
test("control: la implementación VIEJA pierde el crédito de Director de Duna", async () => {
  const r = await repararCreditosViejo(castVilleneuve, crewVilleneuve);
  const jobsDuna = r.crew.filter((c) => c.id === DUNA).map((c) => c.job);
  assert.deepEqual(jobsDuna, ["Screenplay", "Screenplay", "Screenplay"], "el último pisaba a los demás");
  const jobsDuna2 = r.crew.filter((c) => c.id === DUNA2).map((c) => c.job);
  assert.deepEqual(jobsDuna2, ["Producer", "Producer", "Producer"]);
});

test("varios trabajos en el mismo título conservan Director, Producer y Screenplay", async () => {
  const r = await repararCreditos({ cast: castVilleneuve, crew: crewVilleneuve }, sinRespaldo, "t", true);
  assert.deepEqual(r.crew.filter((c) => c.id === DUNA).map((c) => [c.job, c.department]), [
    ["Director", "Directing"], ["Producer", "Production"], ["Screenplay", "Writing"],
  ]);
  assert.deepEqual(r.crew.filter((c) => c.id === DUNA2).map((c) => c.job), ["Screenplay", "Director", "Producer"]);
  assert.equal(r.crew.length, crewVilleneuve.length, "no se pierde ni se agrega ningún crédito");
  assert.equal(r.cast.length, castVilleneuve.length);
  // El `character` del reparto sigue siendo el suyo: no lo pisa el crew de la misma obra.
  assert.equal(r.cast.find((c) => c.id === DUNA)?.character, "Self (archive footage)");
  assert.equal(r.cast.find((c) => c.id === DUNA)?.job, undefined, "el reparto no recibe un `job` del crew");
});

test("la reparación de idioma sigue funcionando y NO cambia job, department, character ni media_type", async () => {
  // Título roto (coreano, sin sinopsis) en tres créditos de la misma obra y en
  // uno de reparto; el respaldo trae UN solo registro por obra, con otro `job`.
  const roto = { title: "듄", overview: "", original_language: "ko" };
  const cast = [cred({ id: 1, ...roto, character: "Voz del gusano (voice)" })];
  const crew = [
    cred({ id: 1, ...roto, job: "Director", department: "Directing" }),
    cred({ id: 1, ...roto, job: "Producer", department: "Production" }),
    cred({ id: 1, media_type: "tv", ...roto, job: "Director", department: "Directing" }),
  ];
  const respaldo = async () => [
    { id: 1, media_type: "movie", title: "Duna", overview: "Arena.", job: "Writer", department: "Writing", character: "Otro" },
    { id: 1, media_type: "tv", title: "Duna, la serie", overview: "Tele." },
  ];
  const r = await repararCreditos({ cast, crew }, respaldo, "t", true);
  assert.deepEqual(r.crew.map((c) => [c.media_type, c.title, c.overview, c.job, c.department]), [
    ["movie", "Duna", "Arena.", "Director", "Directing"],
    ["movie", "Duna", "Arena.", "Producer", "Production"],
    ["tv", "Duna, la serie", "Tele.", "Director", "Directing"],
  ]);
  assert.equal(r.cast[0].title, "Duna");
  assert.equal(r.cast[0].character, "Voz del gusano (voice)", "el character del respaldo no entra");
  assert.equal(r.fallo, false);
});

test("si el respaldo falla, los créditos quedan intactos y se avisa", async () => {
  const r = await repararCreditos(
    { cast: [cred({ id: 1, title: "듄", overview: "" })], crew: crewVilleneuve },
    async () => { throw new Error("caído"); }, "t", true,
  );
  assert.equal(r.fallo, true);
  assert.deepEqual(r.crew.map((c) => c.job), crewVilleneuve.map((c) => c.job));
});

// --- Secciones ---------------------------------------------------------------
test("Duna y Duna: Parte dos son créditos de dirección de Villeneuve después de reparar", async () => {
  const r = await repararCreditos({ cast: castVilleneuve, crew: crewVilleneuve }, sinRespaldo, "t", true);
  const s = seccionesDeCreditos(r);
  const ids = s.direccion.map((c) => c.id);
  assert.ok(ids.includes(DUNA), "Duna en Dirección");
  assert.ok(ids.includes(DUNA2), "Duna: Parte dos en Dirección");
  assert.equal(ids.length, 4, "sin duplicados: una entrada por obra");
  assert.deepEqual(s.actuacion, [], "Self y archivo no son actuación");
});

test("un crédito de voz y uno sin acreditar aparecen en Actuación", () => {
  const s = seccionesDeCreditos({
    cast: [
      cred({ id: 9806, title: "Los increíbles", character: "Lucius Best / Frozone (voice)" }),
      cred({ id: 12, character: "Nick Fury (uncredited)" }),
      cred({ id: 13, character: "Narrator (voice)", genre_ids: [99] }),
    ],
    crew: [],
  });
  assert.deepEqual(s.actuacion.map((c) => c.id), [9806, 12, 13]);
});

test("Self y sus variantes no cuentan como actuación", () => {
  for (const ch of [
    "Self", "self", "Himself", "himself", "Herself", "Themselves",
    "Self (archive footage)", "Self - Guest", "Self - Host", "Self – Executive Producer",
    "Self (uncredited)", "Himself (Footage)", "Self (voice) (archive footage)", "Él mismo", "Ella misma",
  ]) {
    assert.equal(esAparicionPropia(ch), true, ch);
    assert.equal(esActuacion(cred({ id: 1, character: ch })), false, ch);
  }
  for (const ch of ["Selfridge", "Woody (voice)", "Narrator", "Host of the Party", "Nick Fury (uncredited)"]) {
    assert.equal(esAparicionPropia(ch), false, ch);
  }
});

test("talk show / noticias / reality: fuera sólo si es aparición propia, no por el género", () => {
  const talk = [10767];
  assert.equal(esActuacion(cred({ id: 1, media_type: "tv", character: "Self - Guest", genre_ids: talk })), false);
  // Sin personaje o como presentador en un programa de no ficción: aparición propia presunta.
  assert.equal(esActuacion(cred({ id: 2, media_type: "tv", character: "", genre_ids: talk })), false);
  assert.equal(esActuacion(cred({ id: 3, media_type: "tv", character: "Host", genre_ids: [10764] })), false);
  // Un personaje real dentro de un talk show (un sketch) SÍ es actuación.
  assert.equal(esActuacion(cred({ id: 4, media_type: "tv", character: "Nick Fury", genre_ids: talk })), true);
  // Y un crédito sin nombre de personaje en ficción es reparto real.
  assert.equal(esActuacion(cred({ id: 5, character: "" })), true);
});

test("dirección y actuación quedan separadas; la misma obra puede estar en las dos", () => {
  const s = seccionesDeCreditos({
    cast: [
      cred({ id: 1, character: "Cameo" }),              // dirigió Y actuó
      cred({ id: 2, character: "Protagonista" }),
      cred({ id: 3, character: "Self" }),               // cameo como sí mismo: fuera
    ],
    crew: [
      cred({ id: 1, job: "Director" }),
      cred({ id: 1, job: "Writer" }),
      cred({ id: 4, job: "Director" }),
      cred({ id: 5, job: "Producer" }),                 // no es dirección
      cred({ id: 6, job: "Second Unit Director" }),     // tampoco
    ],
  });
  assert.deepEqual(s.direccion.map((c) => c.id).sort(), [1, 4]);
  assert.deepEqual(s.actuacion.map((c) => c.id).sort(), [1, 2]);
});

test("película y serie con el mismo id no se deduplican entre sí", () => {
  const s = seccionesDeCreditos({
    cast: [], crew: [cred({ id: 7, job: "Director" }), cred({ id: 7, media_type: "tv", job: "Director" })],
  });
  assert.deepEqual(s.direccion.map((c) => `${c.media_type}:${c.id}`), ["movie:7", "tv:7"]);
});

test("una persona con una sola profesión: una sola sección", () => {
  const s = seccionesDeCreditos({ cast: [cred({ id: 1, character: "Vincent" })], crew: [] });
  assert.equal(s.direccion.length, 0);
  assert.equal(s.actuacion.length, 1);
  assert.deepEqual(ordenDeSecciones("Acting", s), ["actuacion"]);
});

test("orden de las secciones: según su profesión conocida, sin mostrar las vacías", () => {
  const ambas = { direccion: [cred({ id: 1 })], actuacion: [cred({ id: 2 }), cred({ id: 3 })] };
  assert.deepEqual(ordenDeSecciones("Directing", ambas), ["direccion", "actuacion"]);
  assert.deepEqual(ordenDeSecciones("Acting", ambas), ["actuacion", "direccion"]);
  assert.deepEqual(ordenDeSecciones(undefined, ambas), ["actuacion", "direccion"], "sin dato, la más grande primero");
  assert.deepEqual(ordenDeSecciones("Directing", { direccion: [], actuacion: [] }), []);
});

// --- Disponibilidad: ordena, no filtra ----------------------------------------
const plataformasDe = (m: Record<number, PlatformCode[]>) => (c: CreditoPersona) => m[c.id] ?? [];
function enriquecedor(plataformas: (c: CreditoPersona) => PlatformCode[]) {
  const llamadas: string[] = [];
  const enriquecer = async (c: CreditoPersona): Promise<UITitle> => {
    llamadas.push(`${c.media_type}:${c.id}`);
    return sinPlataformas(c, plataformas(c));
  };
  return { enriquecer, llamadas };
}
function sinPlataformas(c: CreditoPersona, platforms: PlatformCode[] = []): UITitle {
  return {
    id: c.id, type: c.media_type === "tv" ? "tv" : "movie", title: c.title ?? "", year: null, runtime: null,
    poster: null, country: null, genres: [], platforms, tmdb: null, hasEditorial: false,
  };
}

test("un título posterior al puesto 40 sigue siendo accesible", async () => {
  // 60 películas dirigidas, ordenadas por votos; la 55 es la única en Netflix.
  const crew = Array.from({ length: 60 }, (_, i) => cred({ id: i + 1, job: "Director", vote_count: 1000 - i }));
  const { enriquecer, llamadas } = enriquecedor(plataformasDe({ 55: ["n"] }));
  const r = await armarFilmografia({
    secciones: seccionesDeCreditos({ cast: [], crew }), providers: ["n"], enriquecer, sinPlataformas,
  });
  assert.equal(r.direccion.length, 60, "no se recorta nada");
  assert.equal(llamadas.length, 60, "se evalúa la disponibilidad de todas");
  assert.equal(r.direccion[0].id, 55, "la disponible sube al primer lugar");
});

test("elegir sólo Max no elimina lo que no está en Max: sólo cambia el orden", async () => {
  const r0 = await repararCreditos({ cast: castVilleneuve, crew: crewVilleneuve }, sinRespaldo, "t", true);
  const { enriquecer } = enriquecedor(plataformasDe({ [DUNA]: ["m"], [DUNA2]: ["m"], 329865: ["n"] }));
  const r = await armarFilmografia({ secciones: seccionesDeCreditos(r0), providers: ["m"], enriquecer, sinPlataformas });
  assert.deepEqual(r.direccion.map((t) => t.id), [DUNA, DUNA2, 329865, 335984],
    "primero las dos de Max (por votos), después el resto (por votos)");
  assert.equal(r.direccion.length, 4, "nada filtrado");
});

test("lo disponible en tus plataformas va primero, en cada sección y de forma estable", () => {
  const t = (id: number, platforms: PlatformCode[]) => sinPlataformas(cred({ id }), platforms);
  const orden = primeroEnTusPlataformas([t(1, []), t(2, ["n"]), t(3, ["d"]), t(4, ["m", "n"]), t(5, [])], ["n"]);
  assert.deepEqual(orden.map((x) => x.id), [2, 4, 1, 3, 5]);
  assert.deepEqual(primeroEnTusPlataformas([t(1, []), t(2, ["n"])], []).map((x) => x.id), [1, 2], "sin plataformas, sin cambios");
});

test("una obra dirigida y actuada se enriquece UNA vez y aparece en las dos secciones", async () => {
  const { enriquecer, llamadas } = enriquecedor(() => []);
  const r = await armarFilmografia({
    secciones: seccionesDeCreditos({
      cast: [cred({ id: 1, character: "Cameo" })], crew: [cred({ id: 1, job: "Director" })],
    }),
    providers: ["n"], enriquecer, sinPlataformas,
  });
  assert.deepEqual(llamadas, ["movie:1"]);
  assert.equal(r.direccion.length, 1);
  assert.equal(r.actuacion.length, 1);
});

test("un fallo de TMDB en un título lo deja SIN plataformas, no lo esconde", async () => {
  const enriquecer = async (c: CreditoPersona): Promise<UITitle> => {
    if (c.id === 2) throw new ErrorTmdb({ estado: 429, clase: "http429", path: "/movie/2/watch/providers" });
    return sinPlataformas(c, ["n"]);
  };
  const r = await armarFilmografia({
    secciones: seccionesDeCreditos({ cast: [], crew: [cred({ id: 1, job: "Director" }), cred({ id: 2, job: "Director" })] }),
    providers: ["n"], enriquecer, sinPlataformas,
  });
  assert.deepEqual(r.direccion.map((t) => [t.id, t.platforms]), [[1, ["n"]], [2, []]]);
  assert.deepEqual(r.degradacion, { proveedores: 1 });
});

test("un error propio (no de TMDB) no se disfraza: se propaga", async () => {
  await assert.rejects(armarFilmografia({
    secciones: seccionesDeCreditos({ cast: [], crew: [cred({ id: 1, job: "Director" })] }),
    providers: ["n"], enriquecer: async () => { throw new TypeError("bug"); }, sinPlataformas,
  }), TypeError);
});

test("compatibilidad: `titles` y `hidden` para los bundles nativos ya instalados", async () => {
  // Los clientes viejos muestran `titles` como "Filmografía en tus plataformas":
  // sólo lo disponible, sin repetir una obra que esté en las dos secciones.
  const { enriquecer } = enriquecedor(plataformasDe({ 1: ["n"], 3: ["n"] }));
  const r = await armarFilmografia({
    secciones: seccionesDeCreditos({
      cast: [cred({ id: 1, character: "Cameo", vote_count: 10 }), cred({ id: 2, character: "X", vote_count: 20 })],
      crew: [cred({ id: 1, job: "Director", vote_count: 10 }), cred({ id: 3, job: "Director", vote_count: 30 })],
    }),
    providers: ["n"], enriquecer, sinPlataformas,
  });
  assert.deepEqual(r.titles.map((t) => t.id), [3, 1], "disponibles, por votos, sin duplicar");
  assert.equal(r.hidden, 1, "la obra 2 no está en tus plataformas");
});
