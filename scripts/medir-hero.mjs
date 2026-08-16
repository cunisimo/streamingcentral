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
  return recommendations({
    genre: genre === "todos" ? undefined : genre,
    tipo: "all", providers: PROVIDERS, n: N, offset,
  });
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
  }
} else {
  console.log("uso: medir-hero.mjs [foto <fecha> <salida> | comparar <foto.json> | informe [fecha] [foto.json]]");
  process.exit(1);
}
