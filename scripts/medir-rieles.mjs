#!/usr/bin/env node
// Medición de los rieles de género del Home — foto, cobertura, vueltas y costo.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-rieles.mjs foto 2026-08-16 docs/medidas/....json
//
// Se corre SIEMPRE con la fecha forzada (YUMP_FECHA): el Home rota por día y
// sin fijar la semilla no se puede separar un cambio del código de un cambio de
// día. Lo que la fecha NO fija es el catálogo de TMDB — ver MANTENIMIENTO 8.c.
//
// La foto es del HOME ENTERO (los 11 rieles) y no solo de los 6 de género: la
// rotación de ejes cambia qué títulos toma cada riel, y como el dedup del Home
// es global, lo que un riel se lleva se lo saca a los de abajo. Un cambio en
// "Acción" puede mover "Para toda la familia" sin que nadie lo toque.
import { readFileSync, writeFileSync } from "node:fs";

const PROVIDERS = ["n", "d", "m"];

// Mismo contador de respuestas de TMDB que en medir-hero.mjs, y por el mismo
// motivo: `settleAll` y el `allSettled` de los pools se tragan los errores a
// propósito, así que un fallo de red llega al informe disfrazado de "riel
// corto". Sin esto no se puede distinguir de una rotura real.
const respuestas = new Map();
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const r = await fetchOriginal(...args);
  if (String(args[0]).includes("themoviedb.org")) {
    respuestas.set(r.status, (respuestas.get(r.status) ?? 0) + 1);
  }
  return r;
};
const resumenTmdb = () => [...respuestas].sort((a, b) => a[0] - b[0])
  .map(([s, n]) => `${s}×${n}`).join(" ");
const huboFallos = () => [...respuestas].some(([s]) => s !== 200);
const resetTmdb = () => respuestas.clear();

const { composeHome } = await import("../lib/home.ts");
const { HOME_GENRES } = await import("../components/data.ts");
const { conRegistroDeEjes } = await import("../lib/pools.ts");

function fijarFecha(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`fecha inválida: ${f}`);
  process.env.YUMP_FECHA = f;
}
const clave = (t) => `${t.type}:${t.id}`;

// Un Home completo. `tipos` fuerza el toggle de los rieles de género: sirve
// para verificar el lado de series, que es donde se moría media docena de
// superficies cuando el eje no podía llenar.
async function home(tipos) {
  const { res, ejes } = await conRegistroDeEjes(() =>
    composeHome({ providers: PROVIDERS, types: tipos }));
  if (!Array.isArray(res?.rails)) throw new Error("composeHome no devolvió rails");
  return { payload: res, ejes };
}
const forzarTipo = (t) => Object.fromEntries(HOME_GENRES.map((g) => [g, t]));

function retrato({ payload, ejes }) {
  return {
    hero: payload.hero.map((t) => ({ k: clave(t), t: t.title })),
    degradado: payload.degradado,
    fallos: payload.fallos,
    ejes: Object.fromEntries(ejes),
    rieles: payload.rails.map((r) => ({
      key: r.key,
      titulo: r.title ?? r.genre,
      tipo: r.activeType ?? null,
      n: r.items.length,
      // Nota media y proporción bajo 6.0: el guardarraíl de calidad. El
      // promedio es orientativo; lo que decide es la cola baja.
      nota: media(r.items.map((t) => t.tmdb).filter((v) => typeof v === "number")),
      bajos: r.items.filter((t) => typeof t.tmdb === "number" && t.tmdb < 6).length,
      items: r.items.map((t) => ({ k: clave(t), t: t.title, v: t.tmdb })),
    })),
  };
}
const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

async function tomarFoto(fecha) {
  fijarFecha(fecha);
  const base = retrato(await home(undefined));
  const pelis = retrato(await home(forzarTipo("movie")));
  const series = retrato(await home(forzarTipo("tv")));
  return { fecha, providers: PROVIDERS.join(","), generos: HOME_GENRES, base, pelis, series };
}

// --- comparación -------------------------------------------------------------
function compararRieles(vieja, nueva, bloque) {
  const porKey = (f) => Object.fromEntries(f[bloque].rieles.map((r) => [r.key, r]));
  const a = porKey(vieja), b = porKey(nueva);
  const filas = [];
  for (const key of Object.keys(a)) {
    const ra = a[key], rb = b[key];
    if (!rb) { filas.push({ key, falta: true }); continue; }
    const sa = new Set(ra.items.map((i) => i.k)), sb = new Set(rb.items.map((i) => i.k));
    const comunes = [...sa].filter((k) => sb.has(k)).length;
    filas.push({
      key, titulo: ra.titulo,
      n: [ra.n, rb.n],
      nota: [ra.nota, rb.nota],
      bajos: [pctBajos(ra), pctBajos(rb)],
      solape: sb.size ? Math.round((comunes / new Set([...sa, ...sb]).size) * 100) : 0,
    });
  }
  return filas;
}
const pctBajos = (r) => (r.n ? Math.round((r.bajos / r.n) * 100) : 0);

// --- cobertura y solapamiento en N días --------------------------------------
async function cobertura(desde, dias, tipos) {
  const d0 = new Date(`${desde}T12:00:00Z`);
  const porRiel = new Map();      // key -> { vistos:Set, dias:[Set] , titulo }
  const ejesPorDia = [];
  const vacios = [];
  for (let i = 0; i < dias; i++) {
    const dia = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    fijarFecha(dia);
    const { payload, ejes } = await home(tipos);
    ejesPorDia.push({ dia, ejes: Object.fromEntries(ejes) });
    for (const r of payload.rails) {
      if (!porRiel.has(r.key)) porRiel.set(r.key, { titulo: r.title ?? r.genre, vistos: new Set(), dias: [], bajos: 0, muyBajos: 0, total: 0 });
      const e = porRiel.get(r.key);
      const hoy = new Set(r.items.map(clave));
      hoy.forEach((k) => e.vistos.add(k));
      e.dias.push(hoy);
      e.total += r.items.length;
      e.bajos += r.items.filter((t) => typeof t.tmdb === "number" && t.tmdb < 6).length;
      e.muyBajos += r.items.filter((t) => typeof t.tmdb === "number" && t.tmdb < 5).length;
      if (!r.items.length) vacios.push(`${dia} · ${r.key}`);
    }
    process.stderr.write(`  ${dia} ✓  (TMDB ${resumenTmdb()})\n`);
  }
  const filas = [...porRiel].map(([key, e]) => {
    const solapes = [];
    for (let i = 1; i < e.dias.length; i++) {
      const prev = e.dias[i - 1], cur = [...e.dias[i]];
      solapes.push(cur.length ? Math.round((cur.filter((k) => prev.has(k)).length / cur.length) * 100) : 0);
    }
    return {
      key, titulo: e.titulo,
      cobertura: e.vistos.size,
      minItems: Math.min(...e.dias.map((d) => d.size)),
      solapeMedio: solapes.length ? Math.round(solapes.reduce((a, b) => a + b, 0) / solapes.length) : 0,
      pctBajos: e.total ? Math.round((e.bajos / e.total) * 100) : 0,
      pctMuyBajos: e.total ? Math.round((e.muyBajos / e.total) * 100) : 0,
    };
  });
  return { filas, vacios, ejesPorDia };
}

function tabla(filas) {
  // Dos umbrales, los dos informativos. El de 6.0 es el guardarraíl heredado de
  // audiencia; el de 5.0 distingue "abrió el catálogo hacia el 5" (que es lo que
  // se busca: variedad) de "metió cosas malas de verdad". Ninguno filtra nada:
  // ver el principio sobre el puntaje de TMDB en CLAUDE.md.
  console.log("  riel                 cobertura  mín/día  solape  <6.0  <5.0");
  for (const f of filas) {
    console.log(`  ${String(f.titulo).padEnd(20).slice(0, 20)} ${String(f.cobertura).padStart(9)} ` +
      `${String(f.minItems).padStart(8)} ${String(f.solapeMedio + "%").padStart(7)} ${String(f.pctBajos + "%").padStart(5)} ${String(f.pctMuyBajos + "%").padStart(5)}`);
  }
}

// --- CLI ---------------------------------------------------------------------
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "foto") {
  const [fecha, salida] = args;
  const f = await tomarFoto(fecha);
  f.nota = "foto tomada con scripts/medir-rieles.mjs";
  f.tmdb = resumenTmdb();
  writeFileSync(salida, `${JSON.stringify(f, null, 1)}\n`);
  console.log(`foto de ${fecha} escrita en ${salida}`);
  for (const bloque of ["base", "pelis", "series"]) {
    console.log(`\n--- ${bloque} ---`);
    for (const r of f[bloque].rieles) {
      console.log(`  ${String(r.titulo).padEnd(24).slice(0, 24)} ${String(r.n).padStart(3)} ítems  nota ${r.nota ?? "—"}  <6.0 ${pctBajos(r)}%`);
    }
  }
  console.log(`\nTMDB: ${resumenTmdb()}${huboFallos() ? "  ⚠ hubo respuestas != 200" : ""}`);
} else if (cmd === "comparar") {
  const [archivo, fecha] = args;
  const vieja = JSON.parse(readFileSync(archivo, "utf8"));
  const nueva = await tomarFoto(fecha ?? vieja.fecha);
  for (const bloque of ["base", "pelis", "series"]) {
    console.log(`\n### ${bloque} — antes → después`);
    console.log("  riel                  ítems      nota          <6.0        solape");
    for (const f of compararRieles(vieja, nueva, bloque)) {
      if (f.falta) { console.log(`  ${f.key}: FALTA en la corrida nueva`); continue; }
      console.log(`  ${String(f.titulo).padEnd(20).slice(0, 20)} ${String(f.n[0]).padStart(3)}→${String(f.n[1]).padEnd(3)} ` +
        `${String(f.nota[0] ?? "—").padStart(5)}→${String(f.nota[1] ?? "—").padEnd(5)} ` +
        `${String(f.bajos[0] + "%").padStart(4)}→${String(f.bajos[1] + "%").padEnd(4)} ${String(f.solape + "%").padStart(8)}`);
    }
  }
  console.log(`\nTMDB: ${resumenTmdb()}`);
} else if (cmd === "cobertura") {
  const [fecha = "2026-08-16", dias = "7"] = args;
  for (const [etiqueta, tipos] of [["base", undefined], ["películas", forzarTipo("movie")], ["series", forzarTipo("tv")]]) {
    resetTmdb();
    console.log(`\n### ${etiqueta} — ${dias} días desde ${fecha}`);
    const c = await cobertura(fecha, Number(dias), tipos);
    tabla(c.filas);
    console.log(`  VACÍOS: ${c.vacios.length}${c.vacios.length ? `\n    ${c.vacios.join("\n    ")}` : " ✔"}`);
    console.log("  ejes por día:");
    for (const d of c.ejesPorDia) {
      const soloGenero = Object.entries(d.ejes).filter(([k]) => k.startsWith("riel-"));
      console.log(`    ${d.dia}  ${soloGenero.map(([k, v]) => `${k.replace("riel-", "")}=${v}`).join(" ") || "(sin ejes: camino viejo)"}`);
    }
    console.log(`  TMDB: ${resumenTmdb()}${huboFallos() ? "  ⚠ hubo respuestas != 200" : ""}`);
  }
} else {
  console.log("uso: medir-rieles.mjs [foto <fecha> <salida> | comparar <foto.json> [fecha] | cobertura <fecha> [dias]]");
  process.exit(1);
}
