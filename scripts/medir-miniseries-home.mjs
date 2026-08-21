#!/usr/bin/env node
// Medición del riel "Miniseries para ansiosos" DENTRO del Home real.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-miniseries-home.mjs dias 2026-08-21 7 [salida.json]
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-miniseries-home.mjs costo 2026-08-21 sin|con
//
// Corre el composer DE VERDAD y prende y apaga el riel con su propio kill
// switch (`RIEL_MINISERIES`). No replica nada del pipeline a propósito: una
// réplica mide la réplica, y el dedup del Home es justo donde una diferencia de
// una línea cambia el resultado.
//
// `dias`  — N días simulados con y sin el riel: eje usado, cobertura, solape, y
//           el TAMAÑO FINAL DE TODOS LOS RIELES en las dos versiones. No alcanza
//           con contar cuántos títulos pierden los de abajo: ninguno puede
//           quedar debajo de su piso ni desaparecer.
// `costo` — frío vs caliente. UN PROCESO POR VARIANTE, y con el modo del cache
//           verificado (ver la nota sobre el frío más abajo).
import { writeFileSync } from "node:fs";

const PROVIDERS = ["n", "d", "m"];

let tmdbReq = 0;
const respuestas = new Map();
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (...a) => {
  const r = await fetchOriginal(...a);
  if (String(a[0]).includes("themoviedb.org")) {
    tmdbReq++;
    respuestas.set(r.status, (respuestas.get(r.status) ?? 0) + 1);
  }
  return r;
};
const resumenTmdb = () => [...respuestas].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}x${n}`).join(" ");
const huboFallos = () => [...respuestas].some(([s]) => s !== 200);

const { composeHome } = await import("@/lib/home.ts");
const { conRegistroDeEjes } = await import("@/lib/pools.ts");
const { withCacheMetrics, cacheStatus } = await import("@/lib/cache.ts");
const { MINISERIES_KEY, MINISERIES_PISO, MINISERIES_TITULO } = await import("@/lib/miniseries.ts");

const clave = (t) => `${t.type}:${t.id}`;
const fijar = (f) => { process.env.YUMP_FECHA = f; };
// El kill switch se lee en cada llamada a propósito (igual que EJES_RIELES),
// así que las dos versiones se pueden medir en el mismo proceso y comparten el
// cache: la diferencia que quede es del riel y no de qué había cacheado.
const conRiel = (v) => { if (v) delete process.env.RIEL_MINISERIES; else process.env.RIEL_MINISERIES = "0"; };

async function home() {
  const { res, ejes } = await conRegistroDeEjes(() => composeHome({ providers: PROVIDERS }));
  return { payload: res, ejes: Object.fromEntries(ejes) };
}
const tamanos = (p) => Object.fromEntries(p.rails.map((r) => [r.key, r.items.length]));

async function unDia(fecha) {
  fijar(fecha);
  conRiel(false);
  const base = await home();
  conRiel(true);
  const con = await home();

  const riel = con.payload.rails.find((r) => r.key === MINISERIES_KEY);
  const items = riel?.items ?? [];
  const antes = tamanos(base.payload);
  const despues = tamanos(con.payload);

  // Verificaciones duras, en cada día. Si alguna salta, el informe no sirve.
  const problemas = [];
  if (riel && riel.title !== MINISERIES_TITULO) problemas.push(`título "${riel.title}"`);
  if (riel && items.length < MINISERIES_PISO) problemas.push(`${items.length} < piso ${MINISERIES_PISO} y aun así visible`);
  for (const t of items) {
    if (t.type !== "tv") problemas.push(`no es serie: ${t.title}`);
    if (!t.platforms.some((c) => PROVIDERS.includes(c))) problemas.push(`fuera de plataformas: ${t.title}`);
  }
  // Dedup contra TODO el Home.
  const vistos = new Map();
  for (const [nombre, xs] of [["hero", con.payload.hero], ...con.payload.rails.map((r) => [r.key, r.items])]) {
    for (const t of xs) {
      const k = clave(t);
      if (vistos.has(k)) problemas.push(`duplicado ${t.title}: ${vistos.get(k)} y ${nombre}`);
      else vistos.set(k, nombre);
    }
  }
  // Ningún riel puede desaparecer ni encogerse por debajo de lo que ya tenía.
  for (const [k, n] of Object.entries(antes)) {
    if (!(k in despues)) problemas.push(`el riel "${k}" desapareció al sumar miniseries`);
    else if (despues[k] < n) problemas.push(`"${k}" bajó de ${n} a ${despues[k]}`);
  }

  return {
    fecha,
    ejeMini: con.ejes[`${MINISERIES_KEY}/tv`] ?? con.ejes[`riel-mini-${MINISERIES_KEY}/tv`] ?? null,
    ejes: con.ejes,
    visible: !!riel,
    n: items.length,
    claves: items.map(clave),
    titulos: items.map((t) => `${t.title} (${t.year})`),
    notas: items.map((t) => t.tmdb).filter((v) => typeof v === "number"),
    rieles: { sin: antes, con: despues },
    unicosSin: base.payload.hero.length + Object.values(antes).reduce((a, b) => a + b, 0),
    unicosCon: con.payload.hero.length + Object.values(despues).reduce((a, b) => a + b, 0),
    degradado: con.payload.degradado,
    problemas,
  };
}

async function cmdDias(fecha, dias, salida) {
  const filas = [];
  const d0 = new Date(`${fecha}T12:00:00Z`);
  for (let i = 0; i < dias; i++) {
    const dia = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    const f = await unDia(dia);
    filas.push(f);
    process.stderr.write(`  ${dia} mini=${f.n}${f.visible ? "" : " (oculto)"} eje=${f.ejeMini ?? "?"}` +
      `${f.problemas.length ? `  ⚠ ${f.problemas.length} problema(s)` : ""}\n`);
  }

  const vistos = new Set(); const solapes = [];
  for (let i = 0; i < filas.length; i++) {
    filas[i].claves.forEach((k) => vistos.add(k));
    if (i > 0) {
      const prev = new Set(filas[i - 1].claves);
      solapes.push(filas[i].claves.length
        ? Math.round((filas[i].claves.filter((k) => prev.has(k)).length / filas[i].claves.length) * 100) : 0);
    }
  }
  const notas = filas.flatMap((f) => f.notas);
  const problemas = filas.flatMap((f) => f.problemas.map((p) => `${f.fecha}: ${p}`));

  // Tabla de TODOS los rieles, sin → con, día a día.
  const keys = [...new Set(filas.flatMap((f) => Object.keys(f.rieles.con)))];
  console.log(`\nriel                     ${filas.map((f) => f.fecha.slice(5)).join("   ")}    mín`);
  for (const k of keys) {
    const cel = filas.map((f) => {
      const a = f.rieles.sin[k], b = f.rieles.con[k];
      if (a === undefined) return String(b ?? 0).padStart(7);
      return (a === b ? String(b) : `${a}→${b}`).padStart(7);
    });
    const mins = filas.map((f) => f.rieles.con[k] ?? 0);
    console.log(`${k.padEnd(24)} ${cel.join(" ")}  ${String(Math.min(...mins)).padStart(5)}`);
  }
  console.log(`\nejes de miniseries: ${filas.map((f) => `${f.fecha.slice(5)}=${f.ejeMini ?? "?"}`).join(" ")}`);
  console.log(`cobertura ${vistos.size} · solape medio ${solapes.length ? Math.round(solapes.reduce((a, b) => a + b, 0) / solapes.length) : 0}%` +
    ` · mín/día ${Math.min(...filas.map((f) => f.n))} · días oculto ${filas.filter((f) => !f.visible).length}`);
  if (notas.length) {
    console.log(`calidad (INFORMATIVA, nunca excluye): media ${Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100}` +
      ` · <6.0 ${notas.filter((n) => n < 6).length}/${notas.length} · <5.0 ${notas.filter((n) => n < 5).length}`);
  }
  console.log(`TMDB: ${resumenTmdb()}${huboFallos() ? "  ⚠ hubo respuestas != 200" : ""}`);
  if (problemas.length) {
    console.error(`\n${problemas.length} PROBLEMA(S):`);
    for (const p of problemas) console.error(`  - ${p}`);
  } else {
    console.log("\nsin problemas: ningún riel desapareció ni encogió, cero duplicados, cero películas, todo en plataforma.");
  }

  if (salida) {
    writeFileSync(salida, `${JSON.stringify({
      generado: new Date().toISOString(), desde: fecha, dias, providers: PROVIDERS,
      cobertura: vistos.size, solapes,
      solapeMedio: solapes.length ? Math.round(solapes.reduce((a, b) => a + b, 0) / solapes.length) : 0,
      minPorDia: Math.min(...filas.map((f) => f.n)),
      diasOculto: filas.filter((f) => !f.visible).length,
      calidad: notas.length ? {
        media: Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100,
        bajo6: notas.filter((n) => n < 6).length, bajo5: notas.filter((n) => n < 5).length, n: notas.length,
      } : null,
      problemas, tmdb: resumenTmdb(), dias_: filas,
    }, null, 1)}\n`);
    console.log(`\nescrito en ${salida}`);
  }
  process.exit(problemas.length ? 1 : 0);
}

// ============================================================================
// FRÍO EQUIVALENTE — cómo se garantiza.
//
// Un proceso nuevo vacía el cache EN MEMORIA, pero eso solo alcanza si no hay
// Upstash detrás: con Redis configurado, la segunda corrida leería lo que
// escribió la primera y el "frío" sería mentira. Por eso el script EXIGE que el
// cache esté en modo memoria y aborta si encuentra credenciales. El modo real y
// los HIT/MISS de cada corrida van en el informe para poder verificarlo.
async function cmdCosto(fecha, variante) {
  const estado = cacheStatus();
  if (estado.modo !== "memoria") {
    console.error(`ABORTA: el cache está en modo "${estado.modo}" (fuente ${estado.fuente}).`);
    console.error("El frío de las dos corridas no sería comparable: la segunda leería lo que escribió");
    console.error("la primera. Corré sin UPSTASH_REDIS_REST_* / KV_REST_API_* en el entorno, o apuntá");
    console.error("cada corrida a una base distinta.");
    process.exit(1);
  }
  fijar(fecha);
  conRiel(variante === "con");

  async function corrida() {
    tmdbReq = 0;
    const t0 = Date.now();
    const { res, metricas } = await withCacheMetrics(() =>
      conRegistroDeEjes(() => composeHome({ providers: PROVIDERS })));
    const ms = Date.now() - t0;
    const p = res.res;
    const json = JSON.stringify({ hero: p.hero, rails: p.rails, fallos: p.fallos, degradado: p.degradado });
    return {
      ms, tmdbReq,
      tarjetas: p.hero.length + p.rails.reduce((a, r) => a + r.items.length, 0),
      payloadKB: Math.round(Buffer.byteLength(json) / 102.4) / 10,
      comandos: metricas.comandos, claves: metricas.claves, hits: metricas.hits, misses: metricas.misses,
      mini: p.rails.find((r) => r.key === MINISERIES_KEY)?.items.length ?? null,
    };
  }

  console.log(JSON.stringify({ fecha, variante, cache: estado, frio: await corrida(), caliente: await corrida() }, null, 1));
}

// ============================================================================
// BARRIDO DE /lista/miniseries — la prueba de que la paginación no saltea.
//
// Recorre TODAS las páginas hasta que el server dice que no hay más y comprueba
// tres cosas contra el total que declara TMDB: que no se repita ningún título,
// que no falte ninguno, y que no se cuele nada que no sea una miniserie en las
// plataformas elegidas. Un dedup en el cliente probaría lo primero; lo segundo
// —que es lo que importa— solo se prueba llegando al final y contando.
async function cmdLista(codigos, salida) {
  const { miniseriesLista } = await import("@/lib/enrich.ts");
  const vistos = new Map();
  const paginas = [];
  const problemas = [];
  let total = 0, declarado = 0, totalPaginas = 0;
  for (let p = 1; p <= 200; p++) {
    const r0 = tmdbReq;
    const t0 = Date.now();
    const { res, metricas } = await withCacheMetrics(() => miniseriesLista(codigos, p));
    declarado = res.total; totalPaginas = res.totalPaginas;
    for (const t of res.items) {
      const k = clave(t);
      if (vistos.has(k)) problemas.push(`duplicado "${t.title}" en las páginas ${vistos.get(k)} y ${p}`);
      else vistos.set(k, p);
      if (t.type !== "tv") problemas.push(`no es serie: "${t.title}" (pág ${p})`);
      if (!t.platforms.some((c) => codigos.includes(c))) problemas.push(`fuera de plataforma: "${t.title}" (pág ${p})`);
    }
    total += res.items.length;
    paginas.push({
      pagina: p, items: res.items.length, hayMas: res.hayMas,
      tmdb: tmdbReq - r0, comandos: metricas.comandos, ms: Date.now() - t0,
    });
    process.stderr.write(`  pág ${String(p).padStart(2)}: ${String(res.items.length).padStart(2)} items · hayMás ${res.hayMas ? "sí" : "NO"} · tmdb ${tmdbReq - r0}\n`);
    if (!res.hayMas) break;
  }
  // La cuenta que decide: TMDB dice cuántos hay, y hay que haberlos visto todos
  // exactamente una vez. Si falta uno, se lo salteó la paginación.
  if (vistos.size !== declarado) {
    problemas.push(`TMDB declara ${declarado} títulos y se vieron ${vistos.size}: faltan ${declarado - vistos.size}`);
  }
  const frios = paginas.filter((x) => x.tmdb > 0);
  console.log(`\nplataformas: ${codigos.join(",")}`);
  console.log(`páginas: ${paginas.length} de ${totalPaginas} · items ${total} · únicos ${vistos.size} · declarados por TMDB ${declarado}`);
  console.log(`cobertura: ${declarado ? (vistos.size / declarado * 100).toFixed(1) : 0}% del catálogo, sin repetir`);
  if (frios.length) {
    const t = frios.map((x) => x.tmdb);
    console.log(`costo por página (frío): TMDB ${Math.min(...t)}-${Math.max(...t)} · comandos ${Math.min(...frios.map((x) => x.comandos))}-${Math.max(...frios.map((x) => x.comandos))}`);
  }
  if (problemas.length) { console.error(`\n${problemas.length} PROBLEMA(S):`); for (const x of problemas) console.error(`  - ${x}`); }
  else console.log("\nsin problemas: cero duplicados, cero salteados, cero no-series, cero fuera de plataforma.");
  if (salida) {
    writeFileSync(salida, `${JSON.stringify({
      generado: new Date().toISOString(), plataformas: codigos,
      paginas: paginas.length, totalPaginasTMDB: totalPaginas, items: total,
      unicos: vistos.size, declaradosPorTMDB: declarado,
      cobertura: declarado ? Number((vistos.size / declarado * 100).toFixed(1)) : 0,
      problemas, detalle: paginas, tmdb: resumenTmdb(),
    }, null, 1)}\n`);
    console.log(`\nescrito en ${salida}`);
  }
  process.exit(problemas.length ? 1 : 0);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "dias") await cmdDias(args[0] ?? "2026-08-21", Number(args[1] ?? 7), args[2]);
else if (cmd === "costo") await cmdCosto(args[0] ?? "2026-08-21", args[1] ?? "sin");
else if (cmd === "lista") await cmdLista((args[0] ?? "n,d,m").split(",").filter(Boolean), args[1]);
else { console.error("uso: dias <fecha> <n> [salida.json] | costo <fecha> sin|con | lista <plataformas> [salida.json]"); process.exit(1); }
