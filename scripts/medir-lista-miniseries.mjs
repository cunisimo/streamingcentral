#!/usr/bin/env node
// ¿Cómo paginar /lista/miniseries sin duplicados NI títulos salteados?
//
//   node --env-file=.env.local scripts/medir-lista-miniseries.mjs [n,d,m] [páginas] [salida.json]
//
// Compara las dos formas de paginar contra TMDB:
//
//   A) UNIÓN DE POOLS POR PLATAFORMA (lo que hace el Home). Se piden los pools
//      1..N+1 de cada plataforma, se unen, se ordenan por popularidad y se corta
//      el tramo [(N-1)·20, N·20]. El problema: la lista CRECE al pedir más
//      profundidad, así que un título de una página profunda puede meterse antes
//      del borde y correrlo. El dedup del cliente tapa el duplicado, pero lo que
//      queda del otro lado del borde NO SE MUESTRA NUNCA. Eso es un salteo, y no
//      hay dedup que lo recupere.
//
//   B) UNA SOLA CONSULTA COMBINADA (`with_watch_providers=a|b|c`), paginada por
//      la página de TMDB. El orden lo fija TMDB una vez y no se reconstruye:
//      cada página es un tramo de un ranking que no se mueve.
//
// Lo que hay que verificar de B, y por eso este script existe: que el filtro
// estricto de plataformas (`providersOf`, que vuelve a chequear flatrate en AR)
// no la vacíe. Si tirara la mitad de cada página, B sería estable pero inútil.
import { writeFileSync } from "node:fs";

const TOKEN = process.env.TMDB_READ_TOKEN;
if (!TOKEN) { console.error("falta TMDB_READ_TOKEN"); process.exit(1); }

const BASE = "https://api.themoviedb.org/3";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, accept: "application/json" };
const MAX = 16;
let vuelo = 0; const cola = [];
const adq = () => (vuelo < MAX ? (vuelo++, Promise.resolve()) : new Promise((r) => cola.push(r)));
const lib = () => { const n = cola.shift(); if (n) n(); else vuelo--; };
let requests = 0;
async function tmdb(path, params = {}) {
  await adq();
  try {
    for (let i = 0; i < 4; i++) {
      const q = new URLSearchParams({ language: "es-ES", watch_region: "AR", ...params });
      const r = await fetch(`${BASE}${path}?${q}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      requests++;
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`TMDB ${r.status} en ${path}`);
      return r.json();
    }
    throw new Error("429 persistente");
  } finally { lib(); }
}

// Copia de lib/providers-ar.ts (PLATFORMS).
const PLATFORMS = [
  { code: "n", ids: [8] }, { code: "d", ids: [337] }, { code: "m", ids: [1899, 384] },
  { code: "at", ids: [350, 2243] }, { code: "p", ids: [119, 9] }, { code: "cr", ids: [283, 1968] },
  { code: "pp", ids: [531, 582, 1853] }, { code: "mb", ids: [11] }, { code: "un", ids: [1889] },
  { code: "mv", ids: [339] }, { code: "cv", ids: [167] }, { code: "vx", ids: [457] },
  { code: "dg", ids: [467] }, { code: "ok", ids: [575] },
];
const POR_CODIGO = new Map(PLATFORMS.map((p) => [p.code, p]));
const ID_A_CODE = new Map();
for (const p of PLATFORMS) for (const id of p.ids) ID_A_CODE.set(id, p.code);

// Receta ESTABLE de la página: sin ejes, popularidad desde la 1, minVotes 0.
const sinGeneros = (cs) => [99, 10751, 10762, ...(cs.includes("cr") ? [] : [16])].sort((a, b) => a - b);
const receta = (cs) => ({
  with_watch_monetization_types: "flatrate",
  with_type: "2", with_status: "3",
  without_genres: sinGeneros(cs).join(","),
  sort_by: "popularity.desc",
  "vote_count.gte": "0",
});
const disc = (p) => tmdb("/discover/tv", p);

const cacheProv = new Map();
const provsDe = (id) => {
  if (!cacheProv.has(id)) cacheProv.set(id, tmdb(`/tv/${id}/watch/providers`).catch(() => null));
  return cacheProv.get(id);
};
async function enPlataformas(id, cs) {
  const r = await provsDe(id);
  const flat = r?.results?.AR?.flatrate;
  return !!flat && flat.some((p) => cs.includes(ID_A_CODE.get(p.provider_id)));
}

const TAM = 20;

// --- B: una sola consulta combinada -----------------------------------------
async function paginaCombinada(cs, page) {
  const ids = cs.flatMap((c) => POR_CODIGO.get(c).ids);
  const r = await disc({ ...receta(cs), with_watch_providers: ids.join("|"), page: String(page) });
  return { crudos: r.results, total: r.total_results, paginas: r.total_pages };
}

// --- A: unión de pools por plataforma ---------------------------------------
async function poolsHasta(cs, hasta) {
  const partes = await Promise.all(cs.flatMap((c) =>
    Array.from({ length: hasta }, (_, i) =>
      disc({ ...receta(cs), with_watch_providers: POR_CODIGO.get(c).ids.join("|"), page: String(i + 1) })
        .then((r) => r.results).catch(() => []))));
  const v = new Map();
  for (const t of partes.flat()) if (!v.has(t.id)) v.set(t.id, t);
  return [...v.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.id - b.id);
}

async function main() {
  const cs = (process.argv[2] || "n,d,m").split(",").filter(Boolean);
  const PAGS = Number(process.argv[3] || 8);
  const salida = process.argv[4];
  const t0 = Date.now();

  // === B ===
  const b = { paginas: [], vistos: new Map(), dups: [], reqPorPagina: [] };
  for (let p = 1; p <= PAGS; p++) {
    const r0 = requests;
    const { crudos, total, paginas } = await paginaCombinada(cs, p);
    const sobreviven = await Promise.all(crudos.map((t) => enPlataformas(t.id, cs)));
    const visibles = crudos.filter((_, i) => sobreviven[i]);
    for (const t of crudos) {
      if (b.vistos.has(t.id)) b.dups.push(`${t.name} (pág ${b.vistos.get(t.id)} y ${p})`);
      else b.vistos.set(t.id, p);
    }
    b.paginas.push({ pagina: p, crudos: crudos.length, visibles: visibles.length, total, totalPaginas: paginas, ids: crudos.map((t) => t.id) });
    b.reqPorPagina.push(requests - r0);
  }

  // === A ===
  // Se simula igual que lo haría el cliente: página 1, después la 2, etc.
  const a = { paginas: [], mostrados: new Set() };
  for (let p = 1; p <= PAGS; p++) {
    const lista = await poolsHasta(cs, p + 1);
    const tramo = lista.slice((p - 1) * TAM, p * TAM);
    a.paginas.push({ pagina: p, union: lista.length, tramo: tramo.length, ids: tramo.map((t) => t.id) });
    for (const t of tramo) a.mostrados.add(t.id);
  }
  // La verdad contra la que se mide: la MISMA lista, armada de una sola vez a la
  // profundidad final. Si un título está en su top-N y el usuario nunca lo vio
  // paginando, se lo saltearon.
  const listaFinal = await poolsHasta(cs, PAGS + 1);
  const deberianVerse = listaFinal.slice(0, PAGS * TAM);
  const salteados = deberianVerse.filter((t) => !a.mostrados.has(t.id));
  const dupsA = [];
  const vistosA = new Map();
  for (const pg of a.paginas) for (const id of pg.ids) {
    if (vistosA.has(id)) dupsA.push(`${id} (pág ${vistosA.get(id)} y ${pg.pagina})`);
    else vistosA.set(id, pg.pagina);
  }

  // --- informe ---
  console.log(`plataformas: ${cs.join(",")} · ${PAGS} páginas · TMDB dice ${b.paginas[0].total} títulos en ${b.paginas[0].totalPaginas} páginas\n`);
  console.log("B) UNA CONSULTA COMBINADA, paginada por TMDB");
  console.log("  pág  crudos  visibles  sobrevive  requests");
  for (let i = 0; i < b.paginas.length; i++) {
    const x = b.paginas[i];
    console.log(`  ${String(x.pagina).padStart(3)}  ${String(x.crudos).padStart(6)}  ${String(x.visibles).padStart(8)}  ` +
      `${String(x.crudos ? Math.round(x.visibles / x.crudos * 100) + "%" : "—").padStart(9)}  ${String(b.reqPorPagina[i]).padStart(8)}`);
  }
  console.log(`  duplicados entre páginas: ${b.dups.length}${b.dups.length ? ` → ${b.dups.join(", ")}` : ""}`);
  console.log(`  únicos: ${b.vistos.size} de ${b.paginas.reduce((s, x) => s + x.crudos, 0)} crudos servidos`);

  console.log("\nA) UNIÓN DE POOLS POR PLATAFORMA (la propuesta anterior)");
  console.log("  pág  unión  tramo");
  for (const x of a.paginas) console.log(`  ${String(x.pagina).padStart(3)}  ${String(x.union).padStart(5)}  ${String(x.tramo).padStart(5)}`);
  console.log(`  duplicados entre páginas: ${dupsA.length}`);
  console.log(`  TÍTULOS SALTEADOS: ${salteados.length}${salteados.length ? ` → ${salteados.slice(0, 10).map((t) => `${t.name} (pop ${Math.round(t.popularity)})`).join(", ")}` : ""}`);

  const informe = {
    generado: new Date().toISOString(), plataformas: cs, paginas: PAGS,
    totalTMDB: b.paginas[0].total, totalPaginasTMDB: b.paginas[0].totalPaginas,
    combinada: {
      paginas: b.paginas.map(({ ids, ...r }) => r),
      duplicados: b.dups, unicos: b.vistos.size,
      requestsPorPagina: b.reqPorPagina,
      sobrevivenAlFiltro: b.paginas.reduce((s, x) => s + x.visibles, 0),
      crudosServidos: b.paginas.reduce((s, x) => s + x.crudos, 0),
    },
    unionDePools: {
      paginas: a.paginas.map(({ ids, ...r }) => r),
      duplicados: dupsA.length,
      salteados: salteados.map((t) => `${t.name} (pop ${Math.round(t.popularity)})`),
    },
    requests, segundos: Math.round((Date.now() - t0) / 1000),
  };
  if (salida) { writeFileSync(salida, `${JSON.stringify(informe, null, 1)}\n`); console.log(`\nescrito en ${salida}`); }
  console.log(`\nrequests de la medición: ${requests}`);
}

await main();
