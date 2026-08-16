#!/usr/bin/env node
// Medición del hero ("6 para hoy") — foto, comparación, clics limpios,
// cobertura semanal y tiempos.
//
// Se corre SIEMPRE con la fecha forzada, porque el hero rota por día y sin fijar
// la semilla no se puede distinguir un cambio del código de un cambio de día:
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-hero.mjs informe 2026-08-15
//
// LO QUE ESTA MEDICIÓN NO PUEDE FIJAR: el catálogo de TMDB. La semilla queda
// clavada, pero `popularity.desc` se reordena del lado de TMDB todos los días y
// los estrenos entran y salen. O sea que una foto vieja NO es reproducible ni
// con la fecha forzada, y la diferencia contra ella es la suma de dos cosas:
// la deriva del catálogo y el cambio del código. Por eso `informe` corre la
// comparación en las dos direcciones —contra la foto y contra el código anterior
// del mismo día— y las reporta por separado. Ver docs/MANTENIMIENTO.md.
import { readFileSync, writeFileSync } from "node:fs";

// --- Contador de respuestas de TMDB ------------------------------------------
// Sin esto, una corrida larga miente. `settleAll` y el `allSettled` de los pools
// se tragan los fallos a propósito (un riel caído no tumba el Home), así que un
// 429 llega hasta acá disfrazado de "lista vacía" — indistinguible de un bug de
// verdad. Pasó: la primera corrida de las 112 casillas dio 30 vacías, incluidos
// los tres chips que ni siquiera se tocaron. Eran 429.
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
const huboFallos = () => [...respuestas].some(([s, n]) => s !== 200 && n > 0);

const PROVIDERS = ["n", "d", "m"];   // las mismas de la foto del 2026-08-15
const N = 6;                          // tarjetas del hero
const CHIPS = [
  "palomitas", "drama", "misterio-intrincado", "comedia", "terror", "scifi",
  "familiar", "romance", "navidad", "guerra", "aliens", "espacio", "reales",
  "fantasia", "crimen", "supervivencia",
];

const { recommendations } = await import("../lib/enrich.ts");

const clave = (t) => `${t.type}:${t.id}`;
const fila = (items) => items.map((t) => ({ k: clave(t), t: t.title }));

function fijarFecha(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`fecha inválida: ${f}`);
  process.env.YUMP_FECHA = f;
}

async function tanda(genre, offset) {
  const r = await recommendations({
    genre: genre === "todos" ? undefined : genre,
    tipo: "all", providers: PROVIDERS, n: N, offset,
  });
  // `recommendations` devuelve { items, motivo }. Cuando dejó de devolver un
  // array pelado, esto seguía compilando (no hay tipos acá) y `items.length`
  // pasó a ser undefined: la corrida de las 112 casillas dio 112 vacías con
  // 3021 respuestas 200 de TMDB. De ahí el chequeo de abajo.
  if (!Array.isArray(r?.items)) throw new Error("recommendations() no devolvió { items }");
  return r.items;
}

// --- foto --------------------------------------------------------------------
async function tomarFoto(fecha, offsetsBase = 9) {
  fijarFecha(fecha);
  const base = {};
  for (let o = 0; o < offsetsBase; o++) base[o] = fila(await tanda("todos", o));
  const chips = {};
  for (const c of CHIPS) {
    chips[c] = {};
    for (let o = 0; o < 3; o++) chips[c][o] = fila(await tanda(c, o));
  }
  return { fecha, providers: PROVIDERS.join(","), base, chips };
}

// --- comparación contra una foto --------------------------------------------
// Dos números por bloque, que responden preguntas distintas:
//   posición — cuántas casillas traen exactamente lo mismo. Sensible al orden.
//   conjunto — cuánto se solapan los títulos sin mirar el orden. Es el que
//              distingue "se reordenó" de "trae otra cosa".
function comparar(vieja, nueva) {
  const bloque = (a, b) => {
    let pos = 0, total = 0;
    const setA = new Set(), setB = new Set();
    for (const off of Object.keys(a)) {
      const fa = a[off] ?? [], fb = b[off] ?? [];
      for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
        total++;
        if (fa[i] && fb[i] && fa[i].k === fb[i].k) pos++;
      }
      fa.forEach((x) => setA.add(x.k));
      fb.forEach((x) => setB.add(x.k));
    }
    const comunes = [...setA].filter((k) => setB.has(k)).length;
    const union = new Set([...setA, ...setB]).size;
    return { pos, total, comunes, union, unicosA: setA.size, unicosB: setB.size };
  };
  const out = { base: bloque(vieja.base, nueva.base), chips: {} };
  for (const c of Object.keys(vieja.chips)) {
    out.chips[c] = bloque(vieja.chips[c], nueva.chips[c] ?? {});
  }
  return out;
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function imprimirComparacion(titulo, cmp) {
  console.log(`\n### ${titulo}`);
  const b = cmp.base;
  console.log(`base   posición ${b.pos}/${b.total} (${pct(b.pos, b.total)})  ` +
    `conjunto ${b.comunes}/${b.union} (${pct(b.comunes, b.union)})  universo ${b.unicosA} → ${b.unicosB}`);
  for (const [c, v] of Object.entries(cmp.chips)) {
    console.log(`  ${c.padEnd(20)} posición ${String(v.pos).padStart(2)}/${v.total}  ` +
      `conjunto ${String(v.comunes).padStart(2)}/${v.union}  (${pct(v.comunes, v.union)})`);
  }
}

// --- clics limpios de "Otras" ------------------------------------------------
// Cuántas veces se puede tocar "Mostrame otras" antes de que aparezca un título
// ya visto. Es la métrica que el dueño reportó como problema ("solo trae 2
// nuevas"): mide el tamaño real del universo, no el del pool que se pidió.
async function clicsLimpios(fecha, genre = "todos", tope = 40) {
  fijarFecha(fecha);
  const vistos = new Set();
  let limpios = 0;
  for (let o = 0; o <= tope; o++) {
    const items = await tanda(genre, o);
    if (!items.length) break;
    const repite = items.some((t) => vistos.has(clave(t)));
    if (repite) break;
    items.forEach((t) => vistos.add(clave(t)));
    if (o > 0) limpios++;              // el offset 0 es la carga, no un clic
  }
  return { limpios, distintos: vistos.size };
}

// --- cobertura de N días -----------------------------------------------------
// Cuántos títulos distintos ve alguien que abre la app todos los días de una
// semana y NO toca "Otras". Con el catálogo de HOY para los siete días: TMDB no
// se puede retroceder ni adelantar, así que lo que varía es la semilla, que es
// justo lo que se quiere medir.
async function cobertura(desde, dias, offsets = 1) {
  const vistos = new Set();
  const porDia = [];
  const d0 = new Date(`${desde}T12:00:00Z`);
  for (let i = 0; i < dias; i++) {
    const d = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    fijarFecha(d);
    const delDia = new Set();
    for (let o = 0; o < offsets; o++) {
      for (const t of await tanda("todos", o)) { vistos.add(clave(t)); delDia.add(clave(t)); }
    }
    porDia.push({ dia: d, claves: [...delDia] });
  }
  // Solapamiento con el día anterior: 100% significa "el mismo hero siempre".
  const solapes = [];
  for (let i = 1; i < porDia.length; i++) {
    const a = new Set(porDia[i - 1].claves), b = porDia[i].claves;
    solapes.push(Math.round((b.filter((k) => a.has(k)).length / b.length) * 100));
  }
  return { total: vistos.size, dias, solapes };
}

// --- ningún chip vacío en 7 días ---------------------------------------------
// El criterio que faltaba, y que dejó pasar el bug de "Contacto extraterrestre":
// las métricas de arriba miran el hero base y promedios, y un chip angosto que
// se vacía UN día no mueve ninguna de ellas. Acá se recorren los 16 chips en los
// 7 días y se reporta cada casilla vacía, sin promediar nada.
async function chipsPorDia(desde, dias = 7) {
  const d0 = new Date(`${desde}T12:00:00Z`);
  const vacios = [];
  const minimos = [];
  for (let i = 0; i < dias; i++) {
    const dia = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    fijarFecha(dia);
    for (const chip of CHIPS) {
      const items = await tanda(chip, 0);
      if (!items.length) vacios.push(`${dia} · ${chip}`);
      else if (items.length < N) minimos.push(`${dia} · ${chip} (${items.length}/${N})`);
    }
    process.stderr.write(`  ${dia} ✓  (TMDB ${resumenTmdb()})\n`);
  }
  const casillas = dias * CHIPS.length;
  // Todo vacío no es un hallazgo, es un arnés roto. Ya pasó una vez y el
  // informe lo reportó con cara de dato. Mismo reflejo que MANTENIMIENTO 8.b.
  if (vacios.length === casillas && !huboFallos()) {
    throw new Error(
      `las ${casillas} casillas dieron vacías y TMDB respondió 200 siempre: ` +
      "es la medición, no el producto",
    );
  }
  return { vacios, minimos, casillas };
}

// --- tiempos -----------------------------------------------------------------
// Con el cache TIBIO, que es el caso real: el primer visitante del día lo llena
// y el resto lo lee. Medir en frío mide a TMDB, no al código.
async function tiempos(fecha, offsets = [1, 2, 3, 4, 5]) {
  fijarFecha(fecha);
  for (const o of offsets) await tanda("todos", o);   // calentar
  const ms = [];
  for (const o of offsets) {
    const t0 = performance.now();
    await tanda("todos", o);
    ms.push(Math.round(performance.now() - t0));
  }
  return { ms, min: Math.min(...ms), max: Math.max(...ms) };
}

// --- CLI ---------------------------------------------------------------------
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "foto") {
  const [fecha, salida] = args;
  const f = await tomarFoto(fecha);
  f.nota = "foto tomada con scripts/medir-hero.mjs";
  writeFileSync(salida, `${JSON.stringify(f, null, 1)}\n`);
  console.log(`foto de ${fecha} escrita en ${salida}`);
} else if (cmd === "comparar") {
  const [archivo] = args;
  const vieja = JSON.parse(readFileSync(archivo, "utf8"));
  const nueva = await tomarFoto(vieja.fecha, Object.keys(vieja.base).length);
  imprimirComparacion(`hoy (semilla de ${vieja.fecha}) vs ${archivo}`, comparar(vieja, nueva));
} else if (cmd === "informe") {
  // Corre las MISMAS métricas con el camino viejo y con el nuevo, en un solo
  // proceso, para que la comparación no dependa de acordarse de correr las dos.
  // `HERO_ANCHO=0` es el interruptor que devuelve el hero al camino viejo.
  const [fecha = "2026-08-15", archivo = "docs/medidas/2026-08-15-hero-antes.json"] = args;
  const vieja = JSON.parse(readFileSync(archivo, "utf8"));

  for (const modo of ["antes", "después"]) {
    process.env.HERO_ANCHO = modo === "antes" ? "0" : "1";
    console.log(`\n${"=".repeat(70)}\n== ${modo.toUpperCase()}  (HERO_ANCHO=${process.env.HERO_ANCHO})\n${"=".repeat(70)}`);

    const nueva = await tomarFoto(fecha, Object.keys(vieja.base).length);
    imprimirComparacion(`corrida de hoy (semilla ${fecha}) vs ${archivo}`, comparar(vieja, nueva));

    console.log("\n### clics limpios de \"Otras\" (base, sin chip)");
    const c = await clicsLimpios(fecha);
    console.log(`  ${c.limpios} clics antes de repetir · ${c.distintos} títulos distintos`);

    console.log("\n### cobertura de 7 días");
    const solo = await cobertura(fecha, 7, 1);
    console.log(`  abre y no toca nada:      ${solo.total} títulos distintos`);
    console.log(`  solapamiento día a día:   ${solo.solapes.map((s) => `${s}%`).join(" ")}`);
    const conOtras = await cobertura(fecha, 7, 6);
    console.log(`  abre y toca "Otras" x5:   ${conOtras.total} títulos distintos`);

    console.log("\n### tiempo de \"Otras\" (cache tibio)");
    const t = await tiempos(fecha);
    console.log(`  ${t.ms.join(" / ")} ms — min ${t.min}, max ${t.max}`);

    console.log("\n### ningún chip vacío en 7 días");
    const ch = await chipsPorDia(fecha);
    console.log(`  ${ch.casillas} casillas (16 chips × 7 días)`);
    console.log(`  VACÍAS: ${ch.vacios.length}${ch.vacios.length ? `\n    ${ch.vacios.join("\n    ")}` : " ✔"}`);
    if (ch.minimos.length) console.log(`  incompletas: ${ch.minimos.length}\n    ${ch.minimos.join("\n    ")}`);
  }
} else if (cmd === "chips") {
  const [fecha = "2026-08-15"] = args;
  const ch = await chipsPorDia(fecha);
  console.log(`${ch.casillas} casillas · vacías: ${ch.vacios.length}`);
  if (ch.vacios.length) console.log(ch.vacios.join("\n"));
  if (ch.minimos.length) console.log(`incompletas:\n${ch.minimos.join("\n")}`);
  console.log(`respuestas de TMDB: ${resumenTmdb()}`);
  if (huboFallos()) {
    console.log("\n⚠ Hubo respuestas que no fueron 200. Una casilla vacía puede");
    console.log("  ser eso y no un bug — bajá TMDB_MAX_CONCURRENT y repetí.");
    process.exitCode = 2;
  }
} else {
  console.log("uso: medir-hero.mjs [foto <fecha> <salida> | comparar <foto.json> | informe [fecha] [foto.json]]");
  process.exit(1);
}
