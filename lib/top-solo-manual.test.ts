// El Top es EXCLUSIVAMENTE la carga manual del dueño (decisión del 2026-10-20).
//
// Lo que fija este archivo, en el orden del pedido:
//  1. un bloque publicado se muestra con EXACTAMENTE la selección y el orden
//     del dueño; TMDB sólo pone las fichas;
//  2. un bloque sin publicar no dispara ningún respaldo ni oculta a los demás;
//  3. una lectura fallida es un ERROR con reintento, distinto de "no hay
//     publicaciones";
//  4. aunque `netflix_top10` tuviera datos recientes, no intervienen ni en el
//     Top ni en la disponibilidad;
//  5. no queda programación ni ruta que pueda disparar la ingesta.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { componerTop, ERROR_LECTURA_TOP, type DepsTop, type PublicacionTop } from "./top-composer.ts";
import { resolverDisponibilidad } from "./disponibilidad.ts";
import { BLOQUES, claveBloque } from "./top-manual-nucleo.ts";
import type { MediaType, PlatformCode, UITitle } from "./types.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");
/** Sin comentarios: lo que se busca es código, no la historia que lo explica. */
const codigo = (rel: string) => leer(rel)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ficha = (tipo: MediaType, id: number, platforms: PlatformCode[] = []): UITitle => ({
  id, type: tipo, title: `Ficha ${id}`, year: 2026, runtime: null, poster: null,
  country: "AR", genres: [], platforms, tmdb: 7, hasEditorial: false,
});

/** Diez posiciones de un tipo, con ids distintos por bloque. */
const diez = (tipo: MediaType, base: number) =>
  Array.from({ length: 10 }, (_, i) => ({ posicion: i + 1, tipo, tmdb_id: base + i, titulo: `T${base + i}` }));

function deps(o: {
  pubs?: Map<string, PublicacionTop>;
  leer?: () => Promise<Map<string, PublicacionTop>>;
  enriquecer?: DepsTop["enriquecer"];
} = {}): DepsTop & { pedidos: { tipo: MediaType; id: number }[][] } {
  const pedidos: { tipo: MediaType; id: number }[][] = [];
  return {
    pedidos,
    leerPublicaciones: o.leer ?? (async () => o.pubs ?? new Map()),
    enriquecer: o.enriquecer ?? (async (pares) => { pedidos.push(pares); return pares.map((p) => ficha(p.tipo, p.id, ["x" as PlatformCode])); }),
    conPlataforma: (t) => t,
    orden: (p) => ["n", "d", "m", "p", "at", "cr"].indexOf(p),
  };
}

const todos = (r: Awaited<ReturnType<typeof componerTop>>) => {
  assert.ok(r.ok, "se esperaba un Top, no un error");
  return [...r.payload.mine, ...r.payload.others];
};

// ============================================================================
// 1. La selección y el orden son los del dueño
// ============================================================================

test("un bloque publicado conserva EXACTAMENTE la selección y el orden manual", async () => {
  // Las posiciones llegan desordenadas a propósito y TMDB devuelve las fichas
  // en OTRO orden y sin una: el bloque sale igual en el orden del dueño, con
  // sus diez títulos, y el que no tiene ficha conserva su lugar.
  const entradas = diez("movie", 500);
  const desordenadas = [entradas[3], entradas[0], entradas[9], ...entradas.slice(4, 9), entradas[1], entradas[2]];
  const d = deps({
    pubs: new Map([["n:movie", { captured_at: "2026-10-09", entradas: desordenadas }]]),
    enriquecer: async (pares) => pares.filter((p) => p.id !== 507).reverse().map((p) => ficha(p.tipo, p.id)),
  });
  const [n] = todos(await componerTop("movie", ["n"], d));
  assert.equal(n.platform, "n");
  assert.equal(n.estado, "publicado");
  assert.equal(n.source, "manual");
  assert.equal(n.week, "2026-10-09");
  assert.deepEqual(n.slots.map((s) => s.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(n.slots.map((s) => s.rawTitle), entradas.map((e) => e.titulo));
  assert.deepEqual(n.slots.map((s) => s.item?.id ?? null), [500, 501, 502, 503, 504, 505, 506, null, 508, 509]);
});

test("TMDB sólo enriquece: se le piden EXACTAMENTE los títulos del bloque, en su orden", async () => {
  const d = deps({ pubs: new Map([["d:tv", { captured_at: "2026-10-09", entradas: diez("tv", 900) }]]) });
  await componerTop("tv", ["d"], d);
  assert.deepEqual(d.pedidos, [diez("tv", 900).map((e) => ({ tipo: "tv", id: e.tmdb_id }))]);
});

test("las seis plataformas usan su propia publicación, Netflix incluida", async () => {
  const pubs = new Map<string, PublicacionTop>();
  BLOQUES.filter((b) => b.tipo === "movie").forEach((b, i) =>
    pubs.set(claveBloque(b.plataforma, b.tipo), { captured_at: "2026-10-09", entradas: diez("movie", 1000 * (i + 1)) }));
  const bloques = todos(await componerTop("movie", ["n", "d"], deps({ pubs })));
  assert.equal(bloques.length, 6);
  for (const b of bloques) {
    assert.equal(b.estado, "publicado", b.platform);
    assert.deepEqual(b.slots.map((s) => s.rawTitle), pubs.get(`${b.platform}:movie`)!.entradas.map((e) => e.titulo), b.platform);
  }
});

// ============================================================================
// 2. Un bloque faltante no dispara respaldo ni oculta a los otros
// ============================================================================

test("un bloque sin publicar dice que no está disponible; los demás se ven igual", async () => {
  // Netflix sin publicar: antes, faltar UN bloque devolvía el Top entero a la
  // fuente vieja (top automático + popularidad). Ahora Netflix queda vacío y
  // los otros cinco muestran lo suyo.
  const pubs = new Map<string, PublicacionTop>();
  for (const p of ["d", "m", "p", "at", "cr"] as PlatformCode[]) {
    pubs.set(`${p}:movie`, { captured_at: "2026-10-09", entradas: diez("movie", 100) });
  }
  const d = deps({ pubs });
  const r = await componerTop("movie", ["n", "d", "m"], d);
  const bloques = todos(r);
  assert.equal(bloques.length, 6, "se ocultó algún bloque");
  const n = bloques.find((b) => b.platform === "n")!;
  assert.equal(n.estado, "sin-publicar");
  assert.deepEqual(n.slots, [], "un bloque sin publicar mostró posiciones de otra fuente");
  assert.equal(n.source, "manual");
  for (const b of bloques.filter((x) => x.platform !== "n")) {
    assert.equal(b.estado, "publicado", b.platform);
    assert.equal(b.slots.length, 10, b.platform);
  }
  assert.ok(r.ok);
  assert.equal(r.payload.degradado, false, "un bloque sin publicar NO es un fallo");
  assert.equal(d.pedidos.length, 5, "se pidieron fichas para el bloque sin publicar");
});

test("el tipo cuenta: Películas publicado no cubre Series", async () => {
  const pubs = new Map([["n:movie", { captured_at: "2026-10-09", entradas: diez("movie", 1) }]]);
  const [n] = todos(await componerTop("tv", ["n"], deps({ pubs })));
  assert.equal(n.estado, "sin-publicar");
});

test("las plataformas del usuario van primero; el resto, abajo; en el orden del selector", async () => {
  const r = await componerTop("movie", ["cr", "d"], deps());
  assert.ok(r.ok);
  assert.deepEqual(r.payload.mine.map((b) => b.platform), ["d", "cr"]);
  assert.deepEqual(r.payload.others.map((b) => b.platform), ["n", "m", "p", "at"]);
});

// ============================================================================
// 3. Lectura fallida: error con reintento, distinto de "no hay nada"
// ============================================================================

test("una lectura fallida es un ERROR, no un Top vacío ni otro ranking", async () => {
  const d = deps({ leer: async () => { throw new Error("Supabase caído"); } });
  const r = await componerTop("movie", ["n"], d);
  assert.deepEqual(r, { ok: false, error: ERROR_LECTURA_TOP });
  assert.equal(d.pedidos.length, 0, "con la lectura caída igual se fue a TMDB");
});

test("sin publicaciones NO es un error: los doce bloques dicen «todavía no disponible»", async () => {
  const r = await componerTop("movie", [], deps({ pubs: new Map() }));
  const bloques = todos(r);
  assert.equal(bloques.length, 6);
  assert.ok(bloques.every((b) => b.estado === "sin-publicar" && b.slots.length === 0));
  assert.ok(r.ok);
  assert.equal(r.payload.degradado, false);
});

test("reintentar después de un fallo devuelve el Top publicado", async () => {
  let caida = true;
  const pubs = new Map([["n:movie", { captured_at: "2026-10-09", entradas: diez("movie", 1) }]]);
  const d = deps({ leer: async () => { if (caida) throw new Error("caído"); return pubs; } });
  assert.equal((await componerTop("movie", ["n"], d)).ok, false);
  caida = false;
  const [n] = todos(await componerTop("movie", ["n"], d));
  assert.equal(n.estado, "publicado");
});

test("un fallo de TMDB al enriquecer NO esconde el bloque: sale con sus títulos y degradado", async () => {
  const pubs = new Map([["n:movie", { captured_at: "2026-10-09", entradas: diez("movie", 1) }]]);
  const r = await componerTop("movie", ["n"], deps({ pubs, enriquecer: async () => { throw new Error("TMDB caído"); } }));
  assert.ok(r.ok);
  assert.equal(r.payload.degradado, true);
  assert.equal(r.payload.fallos, 1);
  const [n] = r.payload.mine;
  assert.deepEqual(n.slots.map((s) => [s.rank, s.rawTitle, s.item]), diez("movie", 1).map((e) => [e.posicion, e.titulo, null]));
});

test("la lectura real LANZA ante un error de Supabase, y no lo guarda en caché", () => {
  // `ultimasPublicaciones` es server-only: se fija su código. Devolver `[]`
  // ante un error mostraría los doce bloques como «todavía no disponible».
  const src = codigo("lib/top-manual.ts");
  const cuerpo = src.slice(src.indexOf("export async function ultimasPublicaciones"), src.indexOf("export async function evidenciaTopManual"));
  assert.match(cuerpo, /if \(error\) \{[\s\S]*?throw new Error\(/);
  assert.match(cuerpo, /if \(!db\) throw new Error\(/);
  assert.doesNotMatch(cuerpo, /fallo: true/, "un error volvió a leerse como «no hay publicaciones»");
});

test("la ruta responde 503 ante la lectura fallida, y la vista ofrece reintentar", () => {
  const ruta = codigo("app/api/top/route.ts");
  assert.match(ruta, /if \(!r\.ok\) \{[\s\S]*?status: 503/);
  const vista = codigo("components/TopView.tsx");
  assert.match(vista, /No pudimos cargar el top\.\{" "\}\s*<button className="up-retry" onClick=\{retry\}>Reintentar<\/button>/);
  assert.match(vista, /const mine = error \? \[\] :/, "un error dejaba en pantalla el payload anterior (podía ser del otro tipo)");
  assert.match(vista, /Todavía no disponible\./, "falta el estado de bloque sin publicar");
  assert.doesNotMatch(vista, /dato oficial|Lo más popular ahora|source === "netflix"/, "quedó un rótulo de las fuentes retiradas");
});

// ============================================================================
// 4. Los datos automáticos no intervienen
// ============================================================================

test("el Top no tiene ningún camino hacia el ranking automático ni la popularidad", async () => {
  // Aunque alguien le pase lectores "de más", `componerTop` no los conoce.
  let consultas = 0;
  const espia = async () => { consultas++; return new Map([["n:movie", { captured_at: "2026-10-19", entradas: diez("movie", 77) }]]); };
  const d = { ...deps(), latestWeekRows: espia, popularBlock: espia, leerTopOficial: espia } as DepsTop;
  const [n] = todos(await componerTop("movie", ["n"], d));
  assert.equal(consultas, 0);
  assert.equal(n.estado, "sin-publicar");
  for (const rel of ["lib/top.ts", "lib/top-composer.ts", "app/api/top/route.ts"]) {
    assert.doesNotMatch(codigo(rel), /netflix_top10|netflix-top10|latestWeekRows|popularBlock|netflixBlock|listByCategory|discover\(|sortBy|popularity/, rel);
  }
});

test("la disponibilidad ignora el top automático aunque traiga un dato «reciente»", async () => {
  // El lector viejo ya no es parte del contrato: pasado igual, no se consulta
  // y el título sigue resolviéndose por las fuentes vigentes.
  let consultas = 0;
  const r = await resolverDisponibilidad({
    tipo: "tv", id: 322428, deTmdb: [], hoy: "2026-10-20",
    leerDatosTitulo: async () => null,
    leerTopOficial: async () => { consultas++; return new Set(["tv:322428"]); },
  } as Parameters<typeof resolverDisponibilidad>[0]);
  assert.equal(consultas, 0);
  assert.deepEqual(r.plataformas, []);
  assert.equal(r.procedencia, null);
  // La carga manual sigue valiendo, con su regla de siempre.
  const manual = await resolverDisponibilidad({
    tipo: "tv", id: 322428, deTmdb: [], hoy: "2026-10-20",
    leerDatosTitulo: async () => null,
    leerTopManual: async () => new Map([["tv:322428", ["n"] as PlatformCode[]]]),
  });
  assert.equal(manual.procedencia, "top-manual");
});

test("ningún código de la app lee `netflix_top10` ni importa la ingesta", () => {
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) recorrer(rel);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name)) archivos.push(rel);
    }
  };
  for (const d of ["lib", "app", "components", "hooks"]) recorrer(d);
  const infractores = archivos.filter((rel) =>
    /netflix_top10|netflix-top10|netflix-resolver|ingestLatestWeek|disponiblesEnTopOficial|"top-oficial"/.test(codigo(rel)));
  assert.deepEqual(infractores, []);
});

// ============================================================================
// 5. Nada puede disparar la ingesta
// ============================================================================

test("no queda programación de cron en el repo", () => {
  // `vercel.json` sólo existía para el cron de Netflix y se borró. Si alguien
  // lo recrea, no puede volver a programar nada sin que esto lo vea.
  const vercel = path.join(raiz, "vercel.json");
  if (fs.existsSync(vercel)) {
    const cfg = JSON.parse(fs.readFileSync(vercel, "utf8")) as { crons?: unknown[] };
    assert.deepEqual(cfg.crons ?? [], [], "vercel.json volvió a programar un cron");
  }
  assert.doesNotMatch(leer("next.config.mjs"), /cron/i);
});

test("la ruta antigua no existe: /api/cron/netflix-top10 ya no puede ejecutar nada", () => {
  assert.equal(fs.existsSync(path.join(raiz, "app/api/cron")), false, "volvió a existir app/api/cron");
  assert.equal(fs.existsSync(path.join(raiz, "lib/netflix-top10.ts")), false);
  assert.equal(fs.existsSync(path.join(raiz, "lib/netflix-resolver.ts")), false);
});
