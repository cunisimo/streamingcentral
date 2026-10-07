// Mantenimiento incremental de la ruleta, contra un TMDB SIMULADO.
// Ningún test sale a la red ni espera de verdad: `fetch`, el reloj y las
// esperas se inyectan.
//
// Corre con: node --test scripts/ruleta/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { crearClienteTmdb, retryAfterMs, PresupuestoAgotado } from "./cliente-tmdb.mjs";
import { ejecutar } from "./pipeline.mjs";
import { diarioEnMemoria, migrarDesdeLegado, crearDiario, leerDiario, cargarEstado } from "./estado.mjs";
import { planificar, FAMILIAS, esSecuelaInferida, claveDisp } from "./nucleo.mjs";
import { armarCargaIncremental, escribirSalidas } from "./salidas.mjs";
import { armarTextosNuevos } from "../build-roulette-sql.mjs";

const AHORA = Date.parse("2026-10-06T12:00:00Z");
const DIA = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

// ── TMDB simulado ─────────────────────────────────────────────────────────────
// `peliculas`: id → { title, year, runtime, providers, coleccion?, votos? }.
// discover devuelve, para cada familia y ventana, las películas que caen en ella.
function tmdbFalso(peliculas, { colecciones = {}, guion = [] } = {}) {
  const pedidos = [];
  const guionRestante = [...guion]; // respuestas forzadas en orden (p.ej. 429)
  const resp = (status, body, headers = {}) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    json: async () => body,
  });
  const fetchImpl = async (url) => {
    const u = new URL(url);
    pedidos.push(u.pathname + u.search);
    if (guionRestante.length) {
      const g = guionRestante.shift();
      if (g) return resp(g.status, g.body ?? {}, g.headers ?? {});
    }
    const p = u.pathname.replace("/3", "");
    if (p === "/discover/movie") {
      const desde = Number(u.searchParams.get("primary_release_date.gte").slice(0, 4));
      const hasta = Number(u.searchParams.get("primary_release_date.lte").slice(0, 4));
      const cortas = u.searchParams.has("with_runtime.lte");
      const todas = Object.entries(peliculas)
        .filter(([, m]) => m.year >= desde && m.year <= hasta && (!cortas || (m.runtime >= 60 && m.runtime <= 100)))
        .map(([id, m]) => ({ id: Number(id), vote_count: m.votos ?? 500, vote_average: 7, popularity: 1 }));
      const pag = Number(u.searchParams.get("page"));
      return resp(200, { total_pages: Math.max(1, Math.ceil(todas.length / 20)), results: todas.slice((pag - 1) * 20, pag * 20) });
    }
    let m;
    if ((m = p.match(/^\/movie\/(\d+)\/watch\/providers$/))) {
      const peli = peliculas[m[1]];
      if (!peli) return resp(404, {});
      return resp(200, { results: { AR: { flatrate: peli.providers.map((n) => ({ provider_name: n })) } } });
    }
    if ((m = p.match(/^\/movie\/(\d+)$/))) {
      const peli = peliculas[m[1]];
      if (!peli) return resp(404, {});
      return resp(200, {
        id: Number(m[1]), title: peli.title, original_title: peli.title, release_date: `${peli.year}-06-01`,
        overview: "sinopsis", genres: [{ name: "Drama" }], runtime: peli.runtime, original_language: "en",
        vote_count: peli.votos ?? 500, vote_average: 7, popularity: 1,
        belongs_to_collection: peli.coleccion ?? null,
        release_dates: { results: [] },
        "watch/providers": { results: { AR: { flatrate: peli.providers.map((n) => ({ provider_name: n })) } } },
      });
    }
    if ((m = p.match(/^\/collection\/(\d+)$/))) return resp(200, colecciones[m[1]] ?? { name: "?", parts: [] });
    return resp(404, {});
  };
  return { fetchImpl, pedidos };
}

function reloj() {
  let t = AHORA;
  const esperas = [];
  return { ahora: () => t, esperar: async (ms) => { esperas.push(ms); t += ms; }, esperas, avanzar: (ms) => { t += ms; } };
}

const cliente = (fake, opts = {}) => {
  const r = opts.reloj ?? reloj();
  return crearClienteTmdb({ token: "x", fetchImpl: fake.fetchImpl, ahora: r.ahora, esperar: r.esperar, ritmoMs: 0, ...opts });
};

// Estado de partida: lo arma la migración desde los archivos de siempre.
function estadoBase(peliculas, { dispHace = 0 } = {}) {
  const generated_at = iso(AHORA - dispHace);
  const titles = Object.entries(peliculas).map(([id, m]) => ({
    tmdb_id: Number(id), media_type: "movie", title: m.title, year: m.year, overview: "sinopsis",
    genres: ["Drama"], runtime: m.runtime, edad: "adultos", apto_chicos: false,
    vote_count: m.votos ?? 500, vote_average: 7, popularity: 1, providers: m.providers,
  }));
  const copy = { rows: titles.map((t) => ({ tmdb_id: t.tmdb_id, conoce: true, razon: `razón ${t.tmdb_id}`, advertencia: "pero", atencion: "alta" })) };
  const colecciones = { fetched_at: generated_at, rows: titles.map((t) => {
    const c = peliculas[t.tmdb_id].coleccion;
    return { tmdb_id: t.tmdb_id, title: t.title, year: t.year, collection_id: c?.id ?? null, collection_name: c?.name ?? null, es_secuela: !!peliculas[t.tmdb_id].secuela };
  }) };
  return migrarDesdeLegado({ pool: { region: "AR", generated_at, titles }, copy, colecciones });
}

const CFG = (fases, extra = {}) => ({
  fases: { descubrir: fases.includes("d"), enriquecer: fases.includes("e"), disponibilidad: fases.includes("p") },
  ttlDispDias: 30, ttlDescartesDias: 90, ahoraMs: AHORA, ...extra,
});

const BASE = {
  1: { title: "Uno", year: 2001, runtime: 120, providers: ["Netflix"] },
  2: { title: "Dos", year: 2012, runtime: 95, providers: ["Disney Plus"] },
  3: { title: "Saga 1", year: 1999, runtime: 110, providers: ["HBO Max"], coleccion: { id: 900, name: "Saga" } },
};

// Cuántas páginas de discover cuesta recorrer un catálogo dado (todas las ventanas).
function paginasDescubrir(peliculas) {
  let n = 0;
  for (const [fam, f] of Object.entries(FAMILIAS)) for (const [d, h] of f.ventanas) {
    const k = Object.values(peliculas).filter((m) => m.year >= +d.slice(0, 4) && m.year <= +h.slice(0, 4) && (fam !== "cortas" || (m.runtime >= 60 && m.runtime <= 100))).length;
    n += Math.max(1, Math.ceil(k / 20));
  }
  return n;
}

// ── 1. Sin cambios: cero llamadas ──────────────────────────────────────────────
test("títulos sin cambios y disponibilidad vigente no provocan ninguna llamada", async () => {
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  estado.descubrimiento = { at: iso(AHORA - DIA), candidatos: { 1: { fams: ["principal"], wp: null, wc: null, vc: 500, va: 7, pop: 1 }, 2: { fams: ["principal"], wp: null, wc: null, vc: 500, va: 7, pop: 1 }, 3: { fams: ["principal"], wp: null, wc: null, vc: 500, va: 7, pop: 1 } } };
  const fake = tmdbFalso(BASE);
  const c = cliente(fake);
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: c, cfg: CFG("ep") });
  assert.equal(r.completo, true);
  assert.equal(c.metricas().intentos, 0);
  assert.deepEqual(fake.pedidos, []);
  const plan = planificar(estado, new Map(), CFG("ep"));
  assert.equal(plan.llamadas.total, 0);
});

// ── 2. Nuevos: sólo lo necesario ────────────────────────────────────────────────
test("un título nuevo recibe UN detalle (con disponibilidad y saga en la misma respuesta) y nada más", async () => {
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  const conNuevos = { ...BASE, 4: { title: "Nueva", year: 2024, runtime: 130, providers: ["Netflix"] } };
  const fake = tmdbFalso(conNuevos);
  const c = cliente(fake);
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: c, cfg: CFG("dep") });
  assert.equal(r.completo, true);
  const m = c.metricas().porOperacion;
  assert.equal(m.detalle.intentos, 1);
  assert.equal(m.descubrir.intentos, paginasDescubrir(conNuevos));
  assert.equal(m.disponibilidad, undefined, "la disponibilidad vigente no se consulta");
  assert.equal(m.coleccion, undefined);
  assert.ok(fake.pedidos.some((p) => p.startsWith("/3/movie/4?") && p.includes("append_to_response=release_dates%2Cwatch%2Fproviders")));
  assert.deepEqual(r.diferencias.incorporados.map((i) => i.tmdb_id), [4]);
  assert.deepEqual(r.estado.titulos[4].providers, ["Netflix"]);
});

test("un candidato descartado hace poco no se vuelve a pedir", async () => {
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  estado.descartados[5] = { motivo: "sin-sinopsis", at: iso(AHORA - 10 * DIA) };
  const fake = tmdbFalso({ ...BASE, 5: { title: "Rechazada", year: 2020, runtime: 120, providers: ["Netflix"] } });
  const c = cliente(fake);
  await ejecutar({ estado, diario: diarioEnMemoria(), cliente: c, cfg: CFG("de") });
  assert.equal(c.metricas().porOperacion.detalle, undefined);
});

// ── 3 y 4. Disponibilidad vigente / vencida ─────────────────────────────────────
test("la disponibilidad vigente se reutiliza y la vencida se reconsulta con /watch/providers", async () => {
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  estado.titulos[2].disp_at = iso(AHORA - 45 * DIA); // vencida con TTL 30
  const ahora = { ...BASE, 2: { ...BASE[2], providers: ["Disney Plus", "Netflix"] } };
  const fake = tmdbFalso(ahora);
  const c = cliente(fake);
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: c, cfg: CFG("p") });
  assert.equal(c.metricas().intentos, 1);
  assert.deepEqual(fake.pedidos, ["/3/movie/2/watch/providers"]);
  assert.deepEqual(r.estado.titulos[2].providers, ["Disney Plus", "Netflix"]);
  assert.equal(r.estado.titulos[2].disp_at, iso(AHORA));
  assert.equal(r.estado.titulos[1].disp_at, estado.titulos[1].disp_at, "la vigente queda con su fecha");
  assert.deepEqual(r.diferencias.disponibilidad.cambiadas, [{ tmdb_id: 2, title: "Dos", suman: ["Netflix"], pierden: [] }]);
});

test("un título que dejó de estar en plataformas queda con disponibilidad vacía (el proceso anterior lo dejaba viejo para siempre)", async () => {
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const fake = tmdbFalso({ ...BASE, 1: { ...BASE[1], providers: [] } });
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: cliente(fake), cfg: CFG("p") });
  assert.deepEqual(r.estado.titulos[1].providers, []);
  assert.deepEqual(r.diferencias.disponibilidad.sinPlataforma, [1]);
});

// ── 5. Sagas ya procesadas ───────────────────────────────────────────────────────
test("una saga ya procesada no se vuelve a consultar; una desconocida, una sola vez", async () => {
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  const catalogo = {
    ...BASE,
    10: { title: "Saga 2", year: 2005, runtime: 110, providers: ["Netflix"], coleccion: { id: 900, name: "Saga" } },
    11: { title: "Otra 2", year: 2015, runtime: 110, providers: ["Netflix"], coleccion: { id: 901, name: "Otra" } },
    12: { title: "Otra 3", year: 2018, runtime: 110, providers: ["Netflix"], coleccion: { id: 901, name: "Otra" } },
  };
  const fake = tmdbFalso(catalogo, { colecciones: { 901: { name: "Otra", parts: [
    { id: 20, release_date: "2010-01-01" }, { id: 11, release_date: "2015-01-01" }, { id: 12, release_date: "2018-01-01" },
  ] } } });
  const c = cliente(fake);
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: c, cfg: CFG("de") });
  assert.equal(c.metricas().porOperacion.coleccion.intentos, 1, "la saga 901 una sola vez, la 900 ninguna");
  assert.ok(!fake.pedidos.some((p) => p.startsWith("/3/collection/900")));
  assert.equal(r.estado.titulos[10].es_secuela, true);
  assert.equal(r.estado.titulos[11].es_secuela, true);
  assert.equal(r.estado.titulos[12].es_secuela, true);
});

test("inferencia de secuela: año posterior a la primera conocida → secuela; empate → hay que consultar", () => {
  const saga = { primera: { id: 1, year: 2000 }, miembros: [{ id: 1, year: 2000, es_secuela: false }] };
  assert.equal(esSecuelaInferida(saga, { tmdb_id: 2, year: 2003 }), true);
  assert.equal(esSecuelaInferida(saga, { tmdb_id: 2, year: 2000 }), null);
  assert.equal(esSecuelaInferida(undefined, { tmdb_id: 2, year: 2003 }), null);
});

// ── 6. Reintentos cuentan ─────────────────────────────────────────────────────────
test("un 429 cuenta como intento real, se reintenta y respeta Retry-After", async () => {
  const r = reloj();
  const fake = tmdbFalso(BASE, { guion: [{ status: 429, headers: { "retry-after": "3" } }] });
  const c = cliente(fake, { reloj: r });
  const out = await c.pedir("disponibilidad", "/movie/1/watch/providers");
  assert.ok(out);
  const m = c.metricas();
  assert.equal(m.intentos, 2);
  assert.equal(m.exitos, 1);
  assert.equal(m.reintentos, 1);
  assert.equal(m.r429, 1);
  assert.equal(fake.pedidos.length, 2, "TMDB recibió dos pedidos");
  assert.ok(r.esperas.some((ms) => ms >= 3000), "esperó lo que pidió Retry-After");
});

test("los errores 5xx y de red también se cuentan; un fallo definitivo no se anota en el diario", async () => {
  const fake = tmdbFalso(BASE, { guion: [{ status: 503 }, { status: 503 }, { status: 503 }] });
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const c = cliente(fake);
  const diario = diarioEnMemoria();
  const r = await ejecutar({ estado, diario, cliente: c, cfg: CFG("p", { maxDisponibilidad: 1 }) });
  assert.equal(r.completo, false);
  assert.equal(r.motivo, "fallos");
  assert.equal(c.metricas().intentos, 3);
  assert.equal(c.metricas().fallos, 1);
  assert.equal(diario.entradas().size, 0);
});

test("Retry-After en segundos, en fecha HTTP, ausente o desmedido", () => {
  assert.equal(retryAfterMs("2", 0), 2000);
  assert.equal(retryAfterMs(new Date(AHORA + 5000).toUTCString(), AHORA), 5000);
  assert.equal(retryAfterMs(null, 0), 2000);
  assert.equal(retryAfterMs("9999", 0), 60000);
});

// ── Ritmo sin demoras artificiales ──────────────────────────────────────────────
test("el ritmo separa los pedidos, pero no espera si ya pasó el tiempo", async () => {
  const r = reloj();
  const c = cliente(tmdbFalso(BASE), { reloj: r, ritmoMs: 250 });
  await c.pedir("x", "/movie/1/watch/providers");
  await c.pedir("x", "/movie/2/watch/providers");
  assert.deepEqual(r.esperas, [250]);
  r.avanzar(1000); // trabajo de en medio más largo que el ritmo
  await c.pedir("x", "/movie/3/watch/providers");
  assert.deepEqual(r.esperas, [250], "no se agregó ninguna espera");
});

// ── 7. Presupuesto ───────────────────────────────────────────────────────────────
test("el presupuesto corta ANTES de superarse y no corrompe el estado", async () => {
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const copia = structuredClone(estado);
  const fake = tmdbFalso(BASE);
  const c = cliente(fake, { presupuesto: 2 });
  const diario = diarioEnMemoria();
  const r = await ejecutar({ estado, diario, cliente: c, cfg: CFG("p") });
  assert.equal(r.completo, false);
  assert.equal(r.motivo, "presupuesto");
  assert.equal(c.metricas().intentos, 2);
  assert.equal(fake.pedidos.length, 2, "ningún pedido más allá del presupuesto");
  assert.equal(r.estado, undefined, "no hay estado nuevo");
  assert.deepEqual(estado, copia, "el estado de entrada no se tocó");
  assert.equal(diario.entradas().size, 2, "lo terminado quedó en el diario");
  assert.throws(() => { throw new PresupuestoAgotado(2); }, PresupuestoAgotado);
});

test("un reintento que superaría el presupuesto también se corta", async () => {
  const fake = tmdbFalso(BASE, { guion: [{ status: 429, headers: { "retry-after": "1" } }] });
  const c = cliente(fake, { presupuesto: 1 });
  await assert.rejects(() => c.pedir("x", "/movie/1/watch/providers"), PresupuestoAgotado);
  assert.equal(fake.pedidos.length, 1);
});

// ── 8. Reanudación ────────────────────────────────────────────────────────────────
test("una corrida interrumpida continúa sin repetir trabajo (diario en disco)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const catalogo = { ...BASE, 4: { title: "Nueva", year: 2024, runtime: 130, providers: ["Netflix"] } };
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });

  // Referencia: la corrida entera sin cortes.
  const ref = cliente(tmdbFalso(catalogo));
  await ejecutar({ estado, diario: diarioEnMemoria(), cliente: ref, cfg: CFG("dep") });
  const totalRef = ref.metricas().intentos;

  // Corrida 1: se corta por presupuesto a la mitad.
  const fake1 = tmdbFalso(catalogo);
  const c1 = cliente(fake1, { presupuesto: Math.floor(totalRef / 2) });
  const r1 = await ejecutar({ estado, diario: crearDiario(dir), cliente: c1, cfg: CFG("dep") });
  assert.equal(r1.completo, false);

  // Corrida 2: relee el diario del disco y termina.
  const fake2 = tmdbFalso(catalogo);
  const c2 = cliente(fake2);
  const r2 = await ejecutar({ estado, diario: crearDiario(dir, leerDiario(dir)), cliente: c2, cfg: CFG("dep") });
  assert.equal(r2.completo, true);
  assert.equal(c1.metricas().intentos + c2.metricas().intentos, totalRef, "ni un pedido repetido");
  const repetidos = fake2.pedidos.filter((p) => fake1.pedidos.includes(p));
  assert.deepEqual(repetidos, []);
  assert.deepEqual(r2.diferencias.incorporados.map((i) => i.tmdb_id), [4]);
});

test("una línea a medio escribir en el diario se ignora (sólo esa operación se repite)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  writeFileSync(join(dir, "ruleta-progreso.jsonl"), `${JSON.stringify({ k: claveDisp(1), r: { providers: [] } })}\n{"k":"disp:2","r":`);
  const d = leerDiario(dir);
  assert.equal(d.size, 1);
  assert.ok(d.has(claveDisp(1)));
});

test("el plan descuenta lo que ya está en el diario", () => {
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const sin = planificar(estado, new Map(), CFG("p"));
  const con = planificar(estado, new Map([[claveDisp(1), { providers: [] }]]), CFG("p"));
  assert.equal(sin.llamadas.porOperacion.disponibilidad, 3);
  assert.equal(con.llamadas.porOperacion.disponibilidad, 2);
});

// ── 9. Textos editoriales ─────────────────────────────────────────────────────────
test("el SQL incremental nunca menciona columnas editoriales", () => {
  const estado = estadoBase(BASE);
  const t = Object.values(estado.titulos);
  const sql = armarCargaIncremental({ nuevos: t, metadatos: t, disponibilidad: t.map((x) => ({ tmdb_id: x.tmdb_id, providers: x.providers, at: iso(AHORA) })) }).join("\n");
  assert.ok(!/razon|advertencia|atencion|requiere_contexto|collection_name/.test(sql), sql);
  assert.match(sql, /on conflict \(tmdb_id, media_type\) do nothing;/);
  assert.match(sql, /'2026-10-06T12:00:00.000Z'::timestamptz/);
});

test("--textos-nuevos sólo escribe donde la base no tiene texto ni saga", () => {
  const sql = armarTextosNuevos(
    new Map([[4, { tmdb_id: 4, razon: "r", advertencia: null, atencion: "media" }]]),
    [{ tmdb_id: 4, requiere_contexto: true }, { tmdb_id: 5, requiere_contexto: false }],
    [{ tmdb_id: 4, collection_name: "Saga" }],
  );
  assert.match(sql, /and rt\.razon is null;/);
  assert.match(sql, /set requiere_contexto = true\nwhere media_type = 'movie' and collection_name is null and tmdb_id in \(4\);/);
  assert.match(sql, /rt\.collection_name is null;/);
  assert.ok(!/requiere_contexto = false/.test(sql), "nunca apaga un contexto existente");
  assert.ok(sql.indexOf("requiere_contexto") < sql.indexOf("set collection_name"), "el contexto va antes que el nombre de saga");
});

test("una corrida completa no toca copy-ruleta.json ni contexto-ruleta.json y conserva con_texto", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const copy = JSON.stringify({ rows: [{ tmdb_id: 1, conoce: true, razon: "corregida a mano" }] });
  writeFileSync(join(dir, "copy-ruleta.json"), copy);
  writeFileSync(join(dir, "contexto-ruleta.json"), "{\"rows\":[]}");
  const catalogo = { ...BASE, 4: { title: "Nueva", year: 2024, runtime: 130, providers: ["Netflix"] } };
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: cliente(tmdbFalso(catalogo)), cfg: CFG("dep") });
  escribirSalidas(dir, { ...r, estadoAnterior: estado }, iso(AHORA));
  assert.equal(readFileSync(join(dir, "copy-ruleta.json"), "utf8"), copy);
  assert.equal(readFileSync(join(dir, "contexto-ruleta.json"), "utf8"), "{\"rows\":[]}");
  const guardado = JSON.parse(readFileSync(join(dir, "ruleta-estado.json"), "utf8"));
  assert.equal(guardado.titulos[1].con_texto, true);
  assert.equal(guardado.titulos[4].con_texto, false);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    assert.ok(!/razon|advertencia|atencion/.test(readFileSync(join(dir, f), "utf8")), f);
  }
});

// ── Plan sin red ni escritura ─────────────────────────────────────────────────────
test("el modo plan no necesita token, no consulta TMDB y no escribe nada", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const titles = Object.values(estado.titulos);
  writeFileSync(join(dir, "pool-ruleta.json"), JSON.stringify({ region: "AR", generated_at: iso(AHORA - 60 * DIA), titles }));
  const antes = readdirSync(dir).sort();
  const cli = resolve(import.meta.dirname, "..", "actualizar-ruleta.mjs");
  const env = { ...process.env, TMDB_READ_TOKEN: "", TMDB_ACCESS_TOKEN: "" };
  // `fetch` envenenado: si el plan intentara salir a la red, el proceso falla.
  const r = spawnSync(process.execPath, ["--import", "data:text/javascript,globalThis.fetch=()=>{throw new Error('RED')}", cli, "--datos", dir, "--ahora", iso(AHORA)], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no se consultó TMDB/);
  assert.deepEqual(readdirSync(dir).sort(), antes);
  assert.ok(!existsSync(join(dir, "ruleta-estado.json")));
  assert.equal(cargarEstado(dir).origen, "legado");
});

// ── Correcciones posteriores a la primera corrida real (2026-10-06) ──────────────
// Las dos fallas se vieron en la corrida real de descubrir: el informe salió
// fechado 2026-10-07 a las 21:01 de Argentina, y la sección "Progreso" quedó
// vacía porque la corrida se cortó por presupuesto.

// 21:30 en Argentina = 00:30 UTC del día siguiente: la franja donde la fecha
// UTC ya dice "mañana" (CLAUDE.md, convención de fechas).
const NOCHE_AR = Date.parse("2026-10-07T00:30:00Z");

test("los archivos de una corrida llevan la fecha ARGENTINA, no la UTC", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: cliente(tmdbFalso(BASE)), cfg: CFG("p", { ahoraMs: NOCHE_AR }) });
  escribirSalidas(dir, { ...r, estadoAnterior: estado }, iso(NOCHE_AR));
  const nombres = readdirSync(dir);
  assert.ok(nombres.some((n) => n.includes("2026-10-06")), nombres.join(", "));
  assert.ok(!nombres.some((n) => n.includes("2026-10-07")), nombres.join(", "));
});

test("el informe del plan se fecha en hora argentina", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const titles = Object.values(estadoBase(BASE).titulos);
  writeFileSync(join(dir, "pool-ruleta.json"), JSON.stringify({ region: "AR", generated_at: iso(AHORA), titles }));
  const cli = resolve(import.meta.dirname, "..", "actualizar-ruleta.mjs");
  const r = spawnSync(process.execPath, [cli, "--datos", dir, "--ahora", iso(NOCHE_AR)], { encoding: "utf8", env: { ...process.env, TMDB_READ_TOKEN: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /# Ruleta — plan 2026-10-06/);
});

test("una corrida cortada por presupuesto informa el progreso reconstruido del diario", async () => {
  const catalogo = { ...BASE, 4: { title: "Nueva", year: 2024, runtime: 130, providers: ["Netflix"] } };
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const diario = diarioEnMemoria();
  const r = await ejecutar({ estado, diario, cliente: cliente(tmdbFalso(catalogo), { presupuesto: 6 }), cfg: CFG("dep") });
  assert.equal(r.completo, false);
  assert.equal(r.motivo, "presupuesto");
  const d = r.progreso.descubrir;
  assert.ok(d, `progreso vacío: ${JSON.stringify(r.progreso)}`);
  assert.equal(d.paginasHechas, 6, "las seis ventanas de la familia principal");
  assert.ok(d.paginasPendientesConocidas >= 0);
  assert.ok(d.ventanas.length >= 1);
  assert.equal(d.candidatos, 4, "las tres de BASE más la nueva de 2024");
  assert.equal(d.nuevos, 1);
  assert.equal(d.ventanasSinEmpezar, FAMILIAS.cortas.ventanas.length);
});

test("el progreso del diario también cuenta detalles y disponibilidades hechas", async () => {
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const diario = diarioEnMemoria();
  const r = await ejecutar({ estado, diario, cliente: cliente(tmdbFalso(BASE), { presupuesto: 2 }), cfg: CFG("p") });
  assert.equal(r.completo, false);
  assert.deepEqual(r.progreso.disponibilidad, { hechas: 2, objetivo: 3 });
});

// ── Inventario y corridas que sólo descubren ─────────────────────────────────────

test("una corrida que sólo descubre escribe estado e inventario, y NI pool NI SQL", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  const poolAntes = JSON.stringify({ region: "AR", titles: Object.values(estado.titulos) });
  writeFileSync(join(dir, "pool-ruleta.json"), poolAntes);
  const catalogo = { ...BASE, 1: { ...BASE[1], votos: 900 }, 4: { title: "Nueva", year: 2024, runtime: 95, providers: ["Netflix"] } };
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: cliente(tmdbFalso(catalogo)), cfg: CFG("d") });
  assert.equal(r.completo, true);
  const out = escribirSalidas(dir, { ...r, estadoAnterior: estado }, iso(AHORA));
  assert.equal(readFileSync(join(dir, "pool-ruleta.json"), "utf8"), poolAntes, "el pool no se reescribe");
  assert.ok(!readdirSync(dir).some((f) => f.endsWith(".sql")), readdirSync(dir).join(", "));
  const inv = JSON.parse(readFileSync(join(dir, "ruleta-inventario.json"), "utf8"));
  assert.equal(inv.total, 4);
  assert.deepEqual(inv.candidatos[4].fams, ["principal", "cortas"], "95 min: aparece en las dos familias");
  assert.equal(inv.candidatos[4].wp, "2020-2029");
  assert.equal(inv.candidatos[4].wc, "2015-2029");
  assert.deepEqual(out.estado.metadatos_pendientes_sql, [1], "los votos nuevos de 1 quedan pendientes");
});

test("los metadatos pendientes de un descubrimiento van en la primera carga real", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const estado = estadoBase(BASE, { dispHace: 5 * DIA });
  const catalogo = { ...BASE, 1: { ...BASE[1], votos: 900 } };
  const r1 = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: cliente(tmdbFalso(catalogo)), cfg: CFG("d") });
  const e1 = escribirSalidas(dir, { ...r1, estadoAnterior: estado }, iso(AHORA)).estado;
  e1.titulos[2].disp_at = iso(AHORA - 60 * DIA); // fuerza una carga de disponibilidad
  const r2 = await ejecutar({ estado: e1, diario: diarioEnMemoria(), cliente: cliente(tmdbFalso(catalogo)), cfg: CFG("p") });
  const e2 = escribirSalidas(dir, { ...r2, estadoAnterior: e1 }, iso(AHORA + DIA)).estado;
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  assert.match(sql, /update roulette_titles rt set[\s\S]*\(1, 120, 2001, 900, 7::numeric\)/);
  assert.deepEqual(e2.metadatos_pendientes_sql, []);
});

test("dos corridas del mismo día no se pisan el informe (fecha y hora argentinas)", async () => {
  const { selloAR } = await import("./nucleo.mjs");
  const { archivosDeSalida } = await import("./salidas.mjs");
  assert.equal(selloAR(NOCHE_AR), "2026-10-06-2130");
  const a = archivosDeSalida("d", "2026-10-07", selloAR(Date.parse("2026-10-07T13:00:00Z")));
  const b = archivosDeSalida("d", "2026-10-07", selloAR(Date.parse("2026-10-07T18:51:00Z")));
  assert.notEqual(a.informeJson, b.informeJson);
  assert.match(b.informeJson, /ruleta-informe-2026-10-07-1551\.json$/);
});

// ── Corrida autorizada con "429 = parar" y sin SQL (2026-10-07) ──────────────────

test("con detenerEn429, un 429 corta la corrida ENTERA sin esperar ni reintentar, y conserva el progreso", async () => {
  const { Detenido429 } = await import("./cliente-tmdb.mjs");
  const r0 = reloj();
  const fake = tmdbFalso(BASE, { guion: [null, { status: 429, headers: { "retry-after": "30" } }] });
  const c = crearClienteTmdb({ token: "x", fetchImpl: fake.fetchImpl, ahora: r0.ahora, esperar: r0.esperar, ritmoMs: 0, detenerEn429: true });
  await c.pedir("x", "/movie/1/watch/providers");
  await assert.rejects(() => c.pedir("x", "/movie/2/watch/providers"), Detenido429);
  assert.equal(c.metricas().r429, 1);
  assert.equal(c.metricas().reintentos, 0);
  assert.equal(fake.pedidos.length, 2, "no hubo reintento");
  assert.ok(!r0.esperas.some((ms) => ms >= 30000), "no esperó el Retry-After");

  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const diario = diarioEnMemoria();
  const fake2 = tmdbFalso(BASE, { guion: [null, { status: 429, headers: { "retry-after": "1" } }] });
  const r = await ejecutar({ estado, diario, cliente: cliente(fake2, { detenerEn429: true }), cfg: CFG("p") });
  assert.equal(r.completo, false);
  assert.equal(r.motivo, "429");
  assert.equal(diario.entradas().size, 1, "lo terminado antes del 429 quedó en el diario");
  assert.equal(fake2.pedidos.length, 2, "después del 429 no salió ningún pedido más");
});

test("con sql:false una corrida completa no escribe ningún .sql y deja los metadatos pendientes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-"));
  const estado = estadoBase(BASE, { dispHace: 60 * DIA });
  const r = await ejecutar({ estado, diario: diarioEnMemoria(), cliente: cliente(tmdbFalso({ ...BASE, 1: { ...BASE[1], votos: 900 } })), cfg: CFG("dp") });
  const out = escribirSalidas(dir, { ...r, estadoAnterior: estado }, iso(AHORA), { sql: false });
  assert.ok(!readdirSync(dir).some((f) => f.endsWith(".sql")), readdirSync(dir).join(", "));
  assert.ok(existsSync(join(dir, "ruleta-estado.json")));
  assert.deepEqual(out.estado.metadatos_pendientes_sql, [1]);
  assert.equal(out.filasSql.partes, 0);
});
