// Filmografía de una persona (issue #25): roles que no se pisan, filmografía
// completa como datos básicos, y disponibilidad SÓLO del bloque visible.
//
// Todo sobre lógica pura, sin TMDB: `armarFilmografia` es la composición que
// ejecuta `personFilmography` (lib/enrich.ts), y `plataformasDe` —lo único que
// cuesta llamadas por título— se inyecta y se CUENTA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveMixta, conRespuesto, indiceMixto, repararLote } from "./idioma.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import { codeForTmdbId } from "./providers-ar.ts";
import { decisionDeTmdb } from "./disponibilidad.ts";
import {
  agruparSecciones, armarFilmografia, compararObras, esActuacion, esAparicionPropia,
  MAX_POR_PEDIDO, ordenDeSecciones, parsearClave, repararCreditos, resolverBloque,
  type CreditoPersona, type GrupoObra,
} from "./filmografia.ts";
import { BLOQUE, BLOQUE_INICIAL, claveDe, siguienteBloque } from "./filmografia-bloques.ts";
import type { MediaType, ObraPersona, PlatformCode } from "./types.ts";

// --- Datos -------------------------------------------------------------------
const cred = (o: Partial<CreditoPersona> & { id: number }): CreditoPersona => ({
  media_type: "movie", title: `Obra ${o.id}`, overview: "Sinopsis.", original_language: "en",
  vote_count: 100, genre_ids: [18], release_date: "2000-01-01", ...o,
});
const permutaciones = <T>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

const DUNE = 438631;
const DUNE2 = 693134;
const ARRIVAL = 329865;
const BR2049 = 335984;
// Villeneuve, en el ORDEN en que TMDB trae sus créditos de equipo (27/09):
// Dune con Director, Producer, Screenplay; Dune: Part Two con Screenplay,
// Director, Producer. El índice viejo conservaba el ÚLTIMO de cada obra.
const crewVilleneuve: CreditoPersona[] = [
  cred({ id: DUNE, title: "Dune", job: "Director", department: "Directing", credit_id: "d1", release_date: "2021-09-15", vote_count: 14000 }),
  cred({ id: DUNE, title: "Dune", job: "Producer", department: "Production", credit_id: "d2", release_date: "2021-09-15", vote_count: 14000 }),
  cred({ id: DUNE, title: "Dune", job: "Screenplay", department: "Writing", credit_id: "d3", release_date: "2021-09-15", vote_count: 14000 }),
  cred({ id: DUNE2, title: "Dune: Part Two", job: "Screenplay", department: "Writing", credit_id: "e1", release_date: "2024-02-27", vote_count: 7000 }),
  cred({ id: DUNE2, title: "Dune: Part Two", job: "Director", department: "Directing", credit_id: "e2", release_date: "2024-02-27", vote_count: 7000 }),
  cred({ id: DUNE2, title: "Dune: Part Two", job: "Producer", department: "Production", credit_id: "e3", release_date: "2024-02-27", vote_count: 7000 }),
  cred({ id: ARRIVAL, title: "Arrival", job: "Director", department: "Directing", release_date: "2016-11-10", vote_count: 18000 }),
  cred({ id: BR2049, title: "Blade Runner 2049", job: "Director", department: "Directing", release_date: "2017-10-04", vote_count: 14500 }),
  cred({ id: 273481, title: "Sicario", job: "Director", release_date: "2015-09-17", vote_count: 9000 }),
  cred({ id: 146233, title: "Prisoners", job: "Director", release_date: "2013-09-19", vote_count: 11000 }),
  cred({ id: 181886, title: "Enemy", job: "Director", release_date: "2013-09-08", vote_count: 4000 }),
  cred({ id: 46738, title: "Incendies", job: "Director", release_date: "2010-09-04", vote_count: 2500 }),
  cred({ id: 46738, title: "Incendies", job: "Screenplay", release_date: "2010-09-04", vote_count: 2500 }),
  cred({ id: 900100, title: "Un proyecto anunciado", job: "Director", release_date: "", vote_count: 0 }),
  cred({ id: 900200, title: "Algo que sólo produjo", job: "Producer", release_date: "2019-01-01" }),
];
const castVilleneuve: CreditoPersona[] = [
  cred({ id: 900001, media_type: "tv", title: "Un talk show", character: "Self", genre_ids: [10767], first_air_date: "2010-01-01" }),
  cred({ id: DUNE, title: "Dune", character: "Self (archive footage)", release_date: "2021-09-15" }),
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

// Stand-in de `aObra` (enrich.ts la arma con img()/genreIdsToSlugs()).
const aObra = (g: GrupoObra<CreditoPersona>): ObraPersona => ({
  id: g.credito.id, type: g.tipo, title: g.credito.title ?? g.credito.name ?? "", year: null, fecha: g.fecha,
  poster: null, country: null, genres: [], tmdb: null, votos: g.credito.vote_count ?? 0, hasEditorial: false, roles: g.roles,
});
function contador(plataformas: (tipo: MediaType, id: number) => PlatformCode[] = () => []) {
  const llamadas: string[] = [];
  return {
    llamadas,
    plataformasDe: async (tipo: MediaType, id: number) => { llamadas.push(`${tipo}:${id}`); return plataformas(tipo, id); },
  };
}

// --- Roles: la reparación no pisa, la consolidación agrega --------------------
test("control: la implementación VIEJA pierde el Director de Dune y de Dune: Part Two", async () => {
  const r = await repararCreditosViejo(castVilleneuve, crewVilleneuve);
  assert.deepEqual(r.crew.filter((c) => c.id === DUNE).map((c) => c.job), ["Screenplay", "Screenplay", "Screenplay"]);
  assert.deepEqual(r.crew.filter((c) => c.id === DUNE2).map((c) => c.job), ["Producer", "Producer", "Producer"]);
});

test("Dune (Director + Producer + Screenplay) y Dune: Part Two (Screenplay + Director + Producer) siguen en Dirección con los tres roles", async () => {
  const rep = await repararCreditos({ cast: castVilleneuve, crew: crewVilleneuve }, sinRespaldo, "t", true);
  const { direccion } = agruparSecciones(rep);
  const roles = (id: number) => direccion.find((g) => g.credito.id === id)?.roles;
  assert.deepEqual(roles(DUNE), ["Director", "Producer", "Screenplay"]);
  assert.deepEqual(roles(DUNE2), ["Director", "Screenplay", "Producer"]);
  // Y la reparación dejó cada registro con su propia identidad.
  assert.deepEqual(rep.crew.filter((c) => c.id === DUNE).map((c) => [c.job, c.department, c.credit_id]), [
    ["Director", "Directing", "d1"], ["Producer", "Production", "d2"], ["Screenplay", "Writing", "d3"],
  ]);
});

test("una obra con varios créditos NO pierde Director, en CUALQUIER orden del array (y el algoritmo viejo sí)", async () => {
  const base = [
    cred({ id: 1, job: "Director", department: "Directing" }),
    cred({ id: 1, job: "Producer", department: "Production" }),
    cred({ id: 1, job: "Screenplay", department: "Writing" }),
  ];
  let perdidasViejo = 0;
  for (const orden of permutaciones(base)) {
    const rep = await repararCreditos({ cast: [], crew: orden }, sinRespaldo, "t", true);
    const g = agruparSecciones(rep).direccion;
    assert.equal(g.length, 1, `orden ${orden.map((c) => c.job)}: sigue en Dirección`);
    assert.deepEqual([...g[0].roles].sort(), ["Director", "Producer", "Screenplay"]);
    assert.equal(g[0].roles[0], "Director");
    const viejo = await repararCreditosViejo([], orden);
    if (!agruparSecciones(viejo).direccion.length) perdidasViejo++;
  }
  assert.equal(perdidasViejo, 4, "con el índice viejo, sólo sobrevive cuando Director queda último (2 de 6 órdenes)");
});

test("la reparación de idioma sigue funcionando y NO cambia job, department, character, credit_id ni media_type", async () => {
  const roto = { title: "듄", overview: "", original_language: "ko" };
  const cast = [cred({ id: 1, ...roto, character: "Voz del gusano (voice)", credit_id: "c1" })];
  const crew = [
    cred({ id: 1, ...roto, job: "Director", department: "Directing", credit_id: "k1" }),
    cred({ id: 1, ...roto, job: "Producer", department: "Production", credit_id: "k2" }),
    cred({ id: 1, media_type: "tv", ...roto, job: "Director", department: "Directing", credit_id: "k3" }),
  ];
  const respaldo = async () => [
    { id: 1, media_type: "movie", title: "Duna", overview: "Arena.", job: "Writer", department: "Writing", character: "Otro", credit_id: "x" },
    { id: 1, media_type: "tv", title: "Duna, la serie", overview: "Tele." },
  ];
  const r = await repararCreditos({ cast, crew }, respaldo, "t", true);
  assert.deepEqual(r.crew.map((c) => [c.media_type, c.title, c.overview, c.job, c.department, c.credit_id]), [
    ["movie", "Duna", "Arena.", "Director", "Directing", "k1"],
    ["movie", "Duna", "Arena.", "Producer", "Production", "k2"],
    ["tv", "Duna, la serie", "Tele.", "Director", "Directing", "k3"],
  ]);
  assert.equal(r.cast[0].title, "Duna");
  assert.equal(r.cast[0].character, "Voz del gusano (voice)");
  assert.equal(r.cast[0].credit_id, "c1");
});

test("si el respaldo de idioma falla, los créditos quedan intactos y se avisa", async () => {
  const r = await repararCreditos(
    { cast: [cred({ id: 1, title: "듄", overview: "" })], crew: crewVilleneuve },
    async () => { throw new Error("caído"); }, "t", true,
  );
  assert.equal(r.fallo, true);
  assert.deepEqual(r.crew.map((c) => c.job), crewVilleneuve.map((c) => c.job));
});

// --- Aceptación: Villeneuve --------------------------------------------------
test("Villeneuve: Dirección conserva Dune, Dune: Part Two, Arrival y Blade Runner 2049, todas en el bloque inicial", async () => {
  const rep = await repararCreditos({ cast: castVilleneuve, crew: crewVilleneuve }, sinRespaldo, "t", true);
  const { llamadas, plataformasDe } = contador();
  const r = await armarFilmografia({ credits: rep, conocidoPor: "Directing", providers: ["m"], aObra, plataformasDe });
  const ids = r.direccion.map((o) => o.id);
  for (const id of [DUNE, DUNE2, ARRIVAL, BR2049]) assert.ok(ids.includes(id), `falta ${id}`);
  assert.equal(ids.includes(900200), false, "sólo produjo: no es Dirección");
  assert.equal(new Set(ids).size, ids.length, "una vez por obra");
  // Fecha descendente: Dune: Part Two (2024) primero; lo anunciado sin fecha, al final.
  assert.deepEqual(ids.slice(0, 4), [DUNE2, DUNE, BR2049, ARRIVAL]);
  assert.equal(ids[ids.length - 1], 900100);
  for (const id of [DUNE, DUNE2, ARRIVAL, BR2049]) assert.ok(llamadas.includes(`movie:${id}`), `movie:${id} en el primer bloque`);
  assert.deepEqual(r.actuacion, [], "Self y archivo no son actuación");
  assert.deepEqual(r.secciones, ["direccion"]);
});

test("Dune y Dune: Part Two muestran Max cuando los proveedores de TMDB dicen Max en AR", async () => {
  // Respuesta de `watch/providers` como la de TMDB: Max = provider_id 1899 en
  // AR/flatrate. Se convierte con el MISMO mapeo y la MISMA decisión que usa
  // `providersOf` + `disponibilidadDe` (codeForTmdbId + decisionDeTmdb).
  const watchProviders: Record<number, { AR?: { flatrate?: { provider_id: number }[] } }> = {
    [DUNE]: { AR: { flatrate: [{ provider_id: 1899 }] } },
    [DUNE2]: { AR: { flatrate: [{ provider_id: 1899 }] } },
  };
  const plataformasDe = async (tipo: MediaType, id: number): Promise<PlatformCode[]> => {
    const flat = watchProviders[id]?.AR?.flatrate ?? [];
    const codes = flat.map((p) => codeForTmdbId(p.provider_id)).filter((c): c is PlatformCode => !!c);
    return decisionDeTmdb({ tipo, id, deTmdb: codes, hayFlatrateAR: flat.length > 0 }) ?? [];
  };
  const rep = await repararCreditos({ cast: castVilleneuve, crew: crewVilleneuve }, sinRespaldo, "t", true);
  const r = await armarFilmografia({ credits: rep, conocidoPor: "Directing", providers: ["m"], aObra, plataformasDe });
  assert.deepEqual(r.disponibilidad[`movie:${DUNE}`], ["m"]);
  assert.deepEqual(r.disponibilidad[`movie:${DUNE2}`], ["m"]);
  assert.deepEqual(r.titles.map((t) => t.id).sort(), [DUNE, DUNE2].sort(), "legado: lo disponible en Max");
});

// --- Aceptación: sin límites artificiales -------------------------------------
test("Spielberg: 52 obras dirigidas y 18 actuadas llegan TODAS como datos básicos; al abrir se consultan 12", async () => {
  const crew = Array.from({ length: 52 }, (_, i) => cred({ id: 1000 + i, job: "Director", release_date: `${1971 + i}-06-01` }));
  const cast = Array.from({ length: 18 }, (_, i) => cred({ id: 5000 + i, character: `Cameo ${i}`, release_date: `${1980 + i}-01-01` }));
  const { llamadas, plataformasDe } = contador();
  const r = await armarFilmografia({ credits: { cast, crew }, conocidoPor: "Directing", providers: ["n"], aObra, plataformasDe });
  assert.equal(r.direccion.length, 52, "ni 10 ni 40");
  assert.equal(r.actuacion.length, 18);
  assert.deepEqual(r.secciones, ["direccion", "actuacion"]);
  assert.deepEqual(r.inicial, { direccion: 8, actuacion: 4 });
  assert.equal(llamadas.length, 12);
});

test("un actor conserva películas, series, personajes normales y trabajos de voz", () => {
  const s = agruparSecciones({
    cast: [
      cred({ id: 9806, title: "The Incredibles", character: "Lucius Best / Frozone (voice)", release_date: "2004-10-27" }),
      cred({ id: 24428, title: "The Avengers", character: "Nick Fury", release_date: "2012-04-25" }),
      cred({ id: 1403, media_type: "tv", name: "Agents of S.H.I.E.L.D.", title: undefined, character: "Nick Fury", first_air_date: "2013-09-24", release_date: undefined }),
      cred({ id: 12, character: "Nick Fury (uncredited)", release_date: "2008-04-30" }),
    ],
    crew: [],
  });
  assert.deepEqual(s.actuacion.map((g) => g.clave), ["tv:1403", "movie:24428", "movie:12", "movie:9806"]);
  assert.deepEqual(s.actuacion.find((g) => g.clave === "movie:9806")?.roles, ["Lucius Best / Frozone (voice)"]);
  assert.equal(s.direccion.length, 0);
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
  assert.equal(esActuacion(cred({ id: 2, media_type: "tv", character: "", genre_ids: talk })), false);
  assert.equal(esActuacion(cred({ id: 3, media_type: "tv", character: "Host", genre_ids: [10764] })), false);
  assert.equal(esActuacion(cred({ id: 4, media_type: "tv", character: "Nick Fury", genre_ids: talk })), true);
  assert.equal(esActuacion(cred({ id: 5, character: "" })), true);
});

test("Dirección y Actuación separadas; una obra dirigida y actuada está en las dos, una vez en cada una", () => {
  const s = agruparSecciones({
    cast: [
      cred({ id: 1, character: "Cameo" }),
      cred({ id: 1, character: "Voz en off (voice)" }),     // dos personajes, misma obra
      cred({ id: 1, character: "Cameo" }),                  // repetido exacto
      cred({ id: 2, character: "Protagonista" }),
      cred({ id: 3, character: "Self" }),
    ],
    crew: [
      cred({ id: 1, job: "Director" }), cred({ id: 1, job: "Writer" }), cred({ id: 1, job: "Director" }),
      cred({ id: 4, job: "Director" }),
      cred({ id: 5, job: "Producer" }),
      cred({ id: 6, job: "Second Unit Director" }),
    ],
  });
  assert.deepEqual(s.direccion.map((g) => g.credito.id).sort(), [1, 4]);
  assert.deepEqual(s.actuacion.map((g) => g.credito.id).sort(), [1, 2]);
  assert.deepEqual(s.direccion.find((g) => g.credito.id === 1)?.roles, ["Director", "Writer"]);
  assert.deepEqual(s.actuacion.find((g) => g.credito.id === 1)?.roles, ["Cameo", "Voz en off (voice)"]);
});

test("película y serie con el mismo id son obras distintas", () => {
  const s = agruparSecciones({ cast: [], crew: [cred({ id: 7, job: "Director" }), cred({ id: 7, media_type: "tv", job: "Director" })] });
  assert.deepEqual(s.direccion.map((g) => g.clave).sort(), ["movie:7", "tv:7"]);
});

test("orden: fecha descendente, sin fecha al final, empate por votos y clave (total y estable)", () => {
  const g = (clave: string, fecha: string | null, votos: number): GrupoObra<CreditoPersona> =>
    ({ clave, tipo: "movie", credito: cred({ id: 1, vote_count: votos }), roles: [], fecha });
  const orden = [g("movie:1", "2010-01-01", 5), g("movie:2", null, 999), g("movie:3", "2020-01-01", 1),
    g("movie:4", "2010-01-01", 50), g("movie:5", "2010-01-01", 50)].sort(compararObras).map((x) => x.clave);
  assert.deepEqual(orden, ["movie:3", "movie:4", "movie:5", "movie:1", "movie:2"]);
});

test("una persona con una sola profesión: una sola sección", () => {
  assert.deepEqual(ordenDeSecciones("Acting", { direccion: 0, actuacion: 3 }), ["actuacion"]);
  assert.deepEqual(ordenDeSecciones("Directing", { direccion: 1, actuacion: 2 }), ["direccion", "actuacion"]);
  assert.deepEqual(ordenDeSecciones("Acting", { direccion: 1, actuacion: 2 }), ["actuacion", "direccion"]);
  assert.deepEqual(ordenDeSecciones(undefined, { direccion: 5, actuacion: 2 }), ["direccion", "actuacion"]);
  assert.deepEqual(ordenDeSecciones("Directing", { direccion: 0, actuacion: 0 }), []);
});

// --- Aceptación: 229 obras, carga progresiva ---------------------------------
const carrera229 = () => ({
  cast: Array.from({ length: 229 }, (_, i) => cred({
    id: 20000 + i, media_type: i % 5 === 0 ? "tv" : "movie", character: i % 7 === 0 ? `Personaje ${i} (voice)` : `Personaje ${i}`,
    release_date: i % 5 === 0 ? undefined : `${2025 - Math.floor(i / 5)}-0${1 + (i % 9)}-01`,
    first_air_date: i % 5 === 0 ? `${2025 - Math.floor(i / 5)}-01-15` : undefined,
  })),
  crew: [],
});

test("229 obras: las 229 como datos básicos, 12 enriquecidas al abrir (tope 24), las 24 siguientes al pedir más", async () => {
  const { llamadas, plataformasDe } = contador();
  const r = await armarFilmografia({ credits: carrera229(), conocidoPor: "Acting", providers: ["n"], aObra, plataformasDe });
  assert.equal(r.actuacion.length, 229, "datos básicos completos");
  // 🔴 El contrato de coste: la apertura procesa COMO MÁXIMO un bloque (24), y
  // en concreto la apertura chica (12, ver BLOQUE_INICIAL).
  assert.ok(llamadas.length <= BLOQUE, `la apertura enriqueció ${llamadas.length} (> ${BLOQUE})`);
  assert.equal(llamadas.length, BLOQUE_INICIAL);
  const claves = r.actuacion.map(claveDe);
  assert.deepEqual(llamadas.sort(), claves.slice(0, 12).sort(), "exactamente las posiciones 0–11");

  const resueltas = new Set([...Object.keys(r.disponibilidad), ...r.sinDisponibilidad]);
  let visibles = r.inicial.actuacion;
  for (const [desde, hasta] of [[12, 36], [36, 60]]) {
    const sig = siguienteBloque(claves, visibles, (k) => resueltas.has(k));
    assert.deepEqual(sig.pedir, claves.slice(desde, hasta), `"Ver más" pide ${desde}–${hasta - 1}`);
    llamadas.length = 0;
    const b = await resolverBloque(sig.pedir, plataformasDe);
    assert.equal(llamadas.length, 24);
    for (const k of Object.keys(b.disponibilidad)) resueltas.add(k);
    visibles = sig.hasta;
  }
  // El último bloque es menor: 229 = 12 + 9 × 24 + 1.
  const ultimo = siguienteBloque(claves, 228, (k) => resueltas.has(k));
  assert.equal(ultimo.pedir.length, 1);
  assert.equal(ultimo.hasta, 229);
});

test("resolverBloque rechaza más de un bloque y nunca consulta dos veces la misma obra", async () => {
  const { llamadas, plataformasDe } = contador();
  const muchas = Array.from({ length: MAX_POR_PEDIDO + 1 }, (_, i) => `movie:${i + 1}`);
  await assert.rejects(resolverBloque(muchas, plataformasDe), RangeError);
  assert.equal(llamadas.length, 0, "rechaza ANTES de consultar");
  await resolverBloque(["movie:1", "movie:1", "tv:1"], plataformasDe);
  assert.deepEqual(llamadas.sort(), ["movie:1", "tv:1"]);
});

test("una obra dirigida y actuada visible en las dos secciones se consulta UNA vez", async () => {
  const { llamadas, plataformasDe } = contador();
  const r = await armarFilmografia({
    credits: { cast: [cred({ id: 1, character: "Cameo" })], crew: [cred({ id: 1, job: "Director" })] },
    conocidoPor: "Directing", providers: ["n"], aObra, plataformasDe,
  });
  assert.deepEqual(llamadas, ["movie:1"]);
  assert.equal(r.direccion.length, 1);
  assert.equal(r.actuacion.length, 1);
});

test("un fallo parcial de TMDB conserva TODOS los créditos básicos y marca 'sin datos', no 'no está'", async () => {
  const plataformasDe = async (_t: MediaType, id: number): Promise<PlatformCode[]> => {
    if (id === 2) throw new ErrorTmdb({ estado: 429, clase: "http429", path: "/movie/2/watch/providers" });
    return ["n"];
  };
  const crew = [1, 2, 3].map((id) => cred({ id, job: "Director" }));
  const r = await armarFilmografia({ credits: { cast: [], crew }, conocidoPor: "Directing", providers: ["n"], aObra, plataformasDe });
  assert.equal(r.direccion.length, 3);
  assert.deepEqual(r.sinDisponibilidad, ["movie:2"]);
  assert.equal(r.disponibilidad["movie:2"], undefined, "no se afirma que no está");
  assert.deepEqual(r.titles.map((t) => t.id).sort(), [1, 3]);
});

test("un error propio (no de TMDB) no se disfraza: se propaga", async () => {
  await assert.rejects(resolverBloque(["movie:1"], async () => { throw new TypeError("bug"); }), TypeError);
});

test("parsearClave sólo acepta tipo:id", () => {
  assert.deepEqual(parsearClave("movie:438631"), { tipo: "movie", id: 438631 });
  assert.deepEqual(parsearClave("tv:1"), { tipo: "tv", id: 1 });
  for (const k of ["person:1", "movie:", "movie:1:2", "movie:abc", " movie:1"]) assert.equal(parsearClave(k), null, k);
});

test("legado `titles`/`hidden`: sólo lo disponible del bloque inicial, sin consultas extra", async () => {
  const cast = Array.from({ length: 60 }, (_, i) => cred({ id: 100 + i, character: "X", release_date: `${2060 - i}-01-01`, vote_count: i }));
  const { llamadas, plataformasDe } = contador(() => ["n"]);
  const r = await armarFilmografia({ credits: { cast, crew: [] }, conocidoPor: "Acting", providers: ["n"], aObra, plataformasDe });
  assert.equal(llamadas.length, 12, "el legado no dispara consultas");
  assert.equal(r.titles.length, 12, "acotado al bloque ya resuelto");
  assert.deepEqual(r.titles.map((t) => t.platforms), Array(12).fill(["n"]));
  assert.ok(r.titles.every((t, i, a) => i === 0 || (cast.find((c) => c.id === a[i - 1].id)!.vote_count! >= cast.find((c) => c.id === t.id)!.vote_count!)), "por votos, como antes");
  assert.equal(r.hidden, 48);
});
