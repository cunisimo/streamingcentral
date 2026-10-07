// Selección estratificada de títulos nuevos para la ruleta (sin red).
// Corre con: npm run test:ruleta
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  NOMBRES_YUMP, construirCola, decidir, motivoNoServible, llenarObjetivo, cuotasConReserva,
  contadoresVacios, decadaDe, hashId, OBJETIVO_500,
} from "./seleccion.mjs";
import { crearClienteTmdb } from "./cliente-tmdb.mjs";
import { ejecutar } from "./pipeline.mjs";
import { diarioEnMemoria, crearDiario, leerDiario } from "./estado.mjs";

const AHORA = Date.parse("2026-10-07T15:00:00Z");

// Inventario sintético: `n` candidatos por ventana, mitad en la familia cortas.
function inventario(porVentana) {
  const candidatos = {};
  let id = 1;
  for (const [ventana, n, opts = {}] of porVentana) {
    for (let i = 0; i < n; i++, id++) {
      const corta = opts.todasCortas || i % 2 === 0;
      const principal = !opts.soloCortas;
      candidatos[id] = {
        fams: principal ? (corta ? ["principal", "cortas"] : ["principal"]) : ["cortas"],
        wp: principal ? ventana : null, wc: corta ? "2015-2029" : null,
        vc: principal ? 300 + i * 37 : 60 + i, va: 7, pop: 1,
      };
    }
  }
  return { descubierto_at: new Date(AHORA).toISOString(), candidatos };
}
const estadoVacio = (extra = {}) => ({ titulos: {}, reserva: {}, descartados: {}, sagas: {}, ...extra });
const OBJ_CHICO = { total: 12, reservaPct: 0, cortaMin: 4, decadas: { "<1980": 2, "1980s": 2, "1990s": 2, "2000s": 2, "2010s": 2, "2020s": 2 } };

// ── Cola ──────────────────────────────────────────────────────────────────────────

test("la cola es determinística: mismo inventario, misma cola, aunque cambie el orden de llegada", () => {
  const inv = inventario([["1920-1979", 10], ["2010-2019", 40]]);
  const invAlReves = { ...inv, candidatos: Object.fromEntries(Object.entries(inv.candidatos).reverse()) };
  const a = construirCola(inv, estadoVacio(), OBJETIVO_500, { ahoraMs: AHORA });
  const b = construirCola(invAlReves, estadoVacio(), OBJETIVO_500, { ahoraMs: AHORA });
  assert.deepEqual(a, b);
  assert.equal(a.length, 50);
});

test("la cola excluye lo que ya está en el pool, en reserva, descartado hace poco o fuera de los filtros", () => {
  const inv = inventario([["2010-2019", 6]]);
  inv.candidatos[6].vc = 1; inv.candidatos[6].fams = ["principal"]; // como el 567189 real
  const estado = estadoVacio({
    titulos: { 1: {} }, reserva: { 2: {} },
    descartados: { 3: { motivo: "sin-sinopsis", at: new Date(AHORA - 10 * 86_400_000).toISOString() } },
  });
  const ids = construirCola(inv, estado, OBJETIVO_500, { ahoraMs: AHORA }).map((c) => c.id);
  assert.deepEqual(ids.sort(), [4, 5]);
});

test("protege las antiguas: aparecen al principio en proporción a su cupo, no al de candidatos", () => {
  const inv = inventario([["1920-1979", 30], ["2010-2019", 600], ["2020-2029", 600]]);
  const cola = construirCola(inv, estadoVacio(), OBJETIVO_500, { ahoraMs: AHORA });
  const primeros = cola.slice(0, 60);
  const viejas = primeros.filter((c) => c.prevista === "<1980").length;
  // Cupo <1980 = 90 de 270 entre las tres décadas presentes = 1/3; con 1200
  // recientes contra 30 viejas, un orden por candidatos daría ~1.
  assert.ok(viejas >= 15, `viejas en los primeros 60: ${viejas}`);
});

test("mezcla populares y menos conocidas: los tres terciles de votos aparecen enseguida en cada década", () => {
  const inv = inventario([["2000-2009", 90]]);
  const cola = construirCola(inv, estadoVacio(), OBJETIVO_500, { ahoraMs: AHORA });
  const cortas = cola.filter((c) => c.cortaProbable).slice(0, 3).map((c) => c.tercil).sort();
  assert.deepEqual(cortas, [0, 1, 2]);
});

test("prioriza las probables cortas: 3 de cada 4 en la cola de una década", () => {
  const inv = inventario([["2000-2009", 80]]);
  const cola = construirCola(inv, estadoVacio(), OBJETIVO_500, { ahoraMs: AHORA }).slice(0, 40);
  assert.equal(cola.filter((c) => c.cortaProbable).length, 30);
});

test("el orden dentro de un tercil no es la popularidad", () => {
  const ids = [10, 11, 12, 13, 14, 15, 16, 17];
  const porHash = [...ids].sort((a, b) => hashId(a) - hashId(b));
  assert.notDeepEqual(porHash, ids);
});

// ── Decisión con el dato real ────────────────────────────────────────────────────

const titulo = (extra = {}) => ({
  tmdb_id: 1, title: "X", overview: "s", genres: ["Drama"], year: 2015, runtime: 85,
  providers_flatrate: ["Netflix"], ...extra,
});

test("sólo es servible con flatrate en una plataforma de Yump (no publicidad, no plataformas ajenas)", () => {
  assert.equal(motivoNoServible(titulo()), null);
  assert.equal(motivoNoServible(titulo({ providers_flatrate: ["Cultpix"] })), "sin-flatrate-yump");
  assert.equal(motivoNoServible(titulo({ providers_flatrate: [] , providers: ["Pluto TV"] })), "sin-flatrate-yump");
  assert.equal(motivoNoServible(titulo({ overview: "" })), "sin-sinopsis");
  assert.equal(motivoNoServible(titulo({ runtime: null })), "sin-duracion");
  assert.equal(motivoNoServible(null), "no-existe");
});

test("una de 91–100 min NO cuenta como corta, aunque la haya encontrado la familia de 60–100", () => {
  const cuotas = cuotasConReserva(OBJ_CHICO);
  const cont = contadoresVacios();
  assert.equal(decidir(titulo({ runtime: 90 }), cont, cuotas).corta, true);
  assert.equal(decidir(titulo({ runtime: 91 }), cont, cuotas).corta, false);
});

test("los lugares que faltan para las cortas no se le dan a una larga", () => {
  const cuotas = { total: 4, cortaMin: 2, decadas: { "2010s": 4 } };
  const cont = { total: 2, cortas: 0, decadas: { "2010s": 2 } };
  assert.equal(decidir(titulo({ runtime: 120 }), cont, cuotas).decision, "reserva");
  assert.equal(decidir(titulo({ runtime: 80 }), cont, cuotas).decision, "aceptado");
});

test("década llena → reserva (servible, guardada para la próxima ampliación)", () => {
  const cuotas = { total: 10, cortaMin: 0, decadas: { "2010s": 1, "2020s": 9 } };
  const cont = { total: 1, cortas: 0, decadas: { "2010s": 1 } };
  assert.deepEqual(decidir(titulo(), cont, cuotas), { decision: "reserva", motivo: "cupo-2010s-lleno" });
  assert.equal(decadaDe(1979), "<1980");
  assert.equal(decadaDe(2020), "2020s");
});

// ── Recorrido de la cola ─────────────────────────────────────────────────────────

test("se detiene al llenar el objetivo: no consulta un candidato de más", async () => {
  const cola = Array.from({ length: 100 }, (_, i) => ({ pos: i + 1, id: i + 1, prevista: "2010s", cortaProbable: true }));
  const cuotas = { total: 5, cortaMin: 0, decadas: { "2010s": 5 } };
  let llamadas = 0;
  const r = await llenarObjetivo(cola, cuotas, async (c) => { llamadas++; return titulo({ tmdb_id: c.id }); });
  assert.equal(r.aceptados.length, 5);
  assert.equal(llamadas, 5);
  assert.equal(r.completo, true);
});

test("los descartes se reemplazan con suplentes hasta llegar al objetivo", async () => {
  const cola = Array.from({ length: 20 }, (_, i) => ({ pos: i + 1, id: i + 1, prevista: "2010s", cortaProbable: false }));
  const cuotas = { total: 5, cortaMin: 0, decadas: { "2010s": 5 } };
  const r = await llenarObjetivo(cola, cuotas, async (c) => (c.id % 2 ? null : titulo({ tmdb_id: c.id, runtime: 120 })));
  assert.equal(r.aceptados.length, 5);
  assert.equal(r.consultas, 10);
  assert.equal(r.descartes.length, 5);
});

test("el cupo de una década sin más candidatos pasa a las demás, empezando por la más antigua", async () => {
  const cola = [
    { pos: 1, id: 1, prevista: "1980s", cortaProbable: false },
    ...Array.from({ length: 20 }, (_, i) => ({ pos: i + 2, id: i + 2, prevista: i % 2 ? "2010s" : "<1980", cortaProbable: false })),
  ];
  const anio = (c) => ({ "1980s": 1985, "2010s": 2015, "<1980": 1960 })[c.prevista];
  const cuotas = { total: 6, cortaMin: 0, decadas: { "<1980": 2, "1980s": 2, "2010s": 2 } };
  const r = await llenarObjetivo(cola, cuotas, async (c) => titulo({ tmdb_id: c.id, year: anio(c), runtime: 120 }));
  assert.equal(r.completo, true, JSON.stringify(r.cont));
  assert.equal(r.cont.decadas["1980s"], 1);
  assert.equal(r.cont.decadas["<1980"], 3, "el lugar sobrante de los 80 fue a la más antigua");
});

// ── Pipeline con cola, presupuesto y reanudación ─────────────────────────────────

function tmdbCola(fichas) {
  const pedidos = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    pedidos.push(u.pathname);
    const m = u.pathname.match(/\/movie\/(\d+)$/);
    const f = m && fichas[m[1]];
    const body = f ? {
      id: Number(m[1]), title: `T${m[1]}`, original_title: "t", release_date: `${f.year}-01-01`, overview: f.overview ?? "s",
      genres: [{ name: "Drama" }], runtime: f.runtime, vote_count: 400, vote_average: 7, popularity: 1, release_dates: { results: [] },
      "watch/providers": { results: { AR: { flatrate: f.flat.map((n) => ({ provider_name: n })) } } },
    } : {};
    return { status: f ? 200 : 404, ok: !!f, headers: { get: () => null }, json: async () => body };
  };
  return { fetchImpl, pedidos };
}
const reloj = () => { let t = AHORA; return { ahora: () => t, esperar: async (ms) => { t += ms; } }; };
const cliente = (fake, presupuesto = Infinity) => { const r = reloj(); return crearClienteTmdb({ token: "x", fetchImpl: fake.fetchImpl, ahora: r.ahora, esperar: r.esperar, ritmoMs: 0, presupuesto }); };

const FICHAS = {
  1: { year: 2015, runtime: 85, flat: ["Netflix"] },
  2: { year: 2015, runtime: 95, flat: ["Netflix"] },     // 60–100 pero larga
  3: { year: 2016, runtime: 80, flat: ["Cultpix"] },     // no es Yump
  4: { year: 2017, runtime: 88, flat: ["Disney Plus"] },
  5: { year: 2018, runtime: 82, flat: ["HBO Max"] },
  6: { year: 2019, runtime: 84, flat: ["Netflix"] },
};
const COLA = [1, 2, 3, 4, 5, 6].map((id, i) => ({ pos: i + 1, id, prevista: "2010s", cortaProbable: true }));
const CUOTAS = { total: 3, cortaMin: 2, decadas: { "<1980": 0, "1980s": 0, "1990s": 0, "2000s": 0, "2010s": 3, "2020s": 0 } };
const cfg = () => ({ fases: { descubrir: false, enriquecer: true, disponibilidad: false }, ttlDispDias: 30, ttlDescartesDias: 90, ahoraMs: AHORA, seleccion: { cola: COLA, cuotas: CUOTAS } });
const estadoPipeline = () => ({ region: "AR", titulos: {}, sagas: {}, descartados: {}, reserva: {}, descubrimiento: null });

test("con cola, el pipeline consulta sólo hasta llenar el objetivo y guarda la reserva", async () => {
  const fake = tmdbCola(FICHAS);
  const r = await ejecutar({ estado: estadoPipeline(), diario: diarioEnMemoria(), cliente: cliente(fake), cfg: cfg() });
  assert.equal(r.completo, true);
  // 1 corta ✓, 2 larga ✓ (aún cabe: faltan 1 corta y quedan 2 lugares), 3 no-Yump ✗, 4 corta ✓ → objetivo 3.
  assert.deepEqual(Object.keys(r.estado.titulos).map(Number).sort(), [1, 2, 4]);
  assert.equal(fake.pedidos.length, 4, "ni el 5 ni el 6 se consultan");
  assert.equal(r.estado.descartados[3].motivo, "sin-flatrate-yump");
  assert.equal(r.estado.titulos[1].providers_flatrate[0], "Netflix");
});

test("con cola, un corte por presupuesto se retoma y elige EXACTAMENTE lo mismo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-cola-"));
  const ref = await ejecutar({ estado: estadoPipeline(), diario: diarioEnMemoria(), cliente: cliente(tmdbCola(FICHAS)), cfg: cfg() });
  const f1 = tmdbCola(FICHAS);
  const r1 = await ejecutar({ estado: estadoPipeline(), diario: crearDiario(dir), cliente: cliente(f1, 2), cfg: cfg() });
  assert.equal(r1.completo, false);
  assert.equal(r1.motivo, "presupuesto");
  const f2 = tmdbCola(FICHAS);
  const r2 = await ejecutar({ estado: estadoPipeline(), diario: crearDiario(dir, leerDiario(dir)), cliente: cliente(f2), cfg: cfg() });
  assert.equal(r2.completo, true);
  assert.deepEqual(Object.keys(r2.estado.titulos).sort(), Object.keys(ref.estado.titulos).sort());
  assert.equal(f1.pedidos.length + f2.pedidos.length, 4, "ningún detalle repetido");
});

// ── Coherencia con la app ─────────────────────────────────────────────────────────

test("NOMBRES_YUMP coincide con los nombres de lib/roulette-providers.ts", () => {
  const ts = readFileSync(resolve(import.meta.dirname, "..", "..", "lib", "roulette-providers.ts"), "utf8");
  const bloque = ts.slice(ts.indexOf("const NOMBRES"), ts.indexOf("};", ts.indexOf("const NOMBRES")));
  const nombres = [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(nombres)].sort(), [...NOMBRES_YUMP].sort());
});

test("ejecutar enriquecer sin cola se niega a correr (evita procesar todo el inventario); el plan sí corre", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-cli-"));
  writeFileSync(join(dir, "pool-ruleta.json"), JSON.stringify({ region: "AR", generated_at: new Date(AHORA).toISOString(), titles: [] }));
  const cli = resolve(import.meta.dirname, "..", "actualizar-ruleta.mjs");
  const r = spawnSync(process.execPath, [cli, "--datos", dir, "--fases", "enriquecer", "--ejecutar", "--presupuesto", "1"], { encoding: "utf8", env: { ...process.env, TMDB_READ_TOKEN: "" } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /enriquecer exige una cola/);
  const plan = spawnSync(process.execPath, [cli, "--datos", dir, "--fases", "enriquecer"], { encoding: "utf8", env: { ...process.env, TMDB_READ_TOKEN: "" } });
  assert.equal(plan.status, 0, plan.stderr);
});

test("--armar-cola escribe la cola sin consultar TMDB", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-cli-"));
  writeFileSync(join(dir, "pool-ruleta.json"), JSON.stringify({ region: "AR", generated_at: new Date(AHORA).toISOString(), titles: [] }));
  writeFileSync(join(dir, "ruleta-inventario.json"), JSON.stringify(inventario([["2010-2019", 30], ["1920-1979", 5]])));
  const cli = resolve(import.meta.dirname, "..", "actualizar-ruleta.mjs");
  const r = spawnSync(process.execPath, ["--import", "data:text/javascript,globalThis.fetch=()=>{throw new Error('RED')}", cli, "--datos", dir, "--armar-cola", "--ahora", new Date(AHORA).toISOString()], { encoding: "utf8", env: { ...process.env, TMDB_READ_TOKEN: "" } });
  assert.equal(r.status, 0, r.stderr);
  const cola = JSON.parse(readFileSync(join(dir, "ruleta-cola.json"), "utf8"));
  assert.equal(cola.candidatos, 35);
  assert.ok(readdirSync(dir).every((f) => !f.startsWith("ruleta-estado")), "no escribe estado");
});

test("el plan de enriquecer usa la cola: estima por la simulación, no por todos los candidatos", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruleta-cli-"));
  const iso = new Date(AHORA).toISOString();
  writeFileSync(join(dir, "pool-ruleta.json"), JSON.stringify({ region: "AR", generated_at: iso, titles: [] }));
  const inv = inventario([["2010-2019", 300]]);
  writeFileSync(join(dir, "ruleta-inventario.json"), JSON.stringify(inv));
  // Estado con el descubrimiento hecho: 300 candidatos nuevos.
  writeFileSync(join(dir, "ruleta-estado.json"), JSON.stringify({ version: 1, region: "AR", titulos: {}, sagas: {}, descartados: {}, reserva: {}, descubrimiento: { at: iso, candidatos: inv.candidatos } }));
  writeFileSync(join(dir, "ruleta-cola.json"), JSON.stringify({ cuotas: { total: 10, cortaMin: 0, decadas: { "2010s": 10 } }, estimacion: { p90: 14 }, cola: Array.from({ length: 300 }, (_, i) => ({ pos: i + 1, id: i + 1, prevista: "2010s", cortaProbable: false })) }));
  const cli = resolve(import.meta.dirname, "..", "actualizar-ruleta.mjs");
  const r = spawnSync(process.execPath, [cli, "--datos", dir, "--fases", "enriquecer", "--ahora", iso], { encoding: "utf8", env: { ...process.env, TMDB_READ_TOKEN: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| detalle \| 14 \|/, r.stdout);
});
