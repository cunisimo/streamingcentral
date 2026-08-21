#!/usr/bin/env node
// Medición del riel "Miniseries para ansiosos" DENTRO del Home real.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-miniseries-home.mjs dias 2026-08-21 7 [salida.json]
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-miniseries-home.mjs costo 2026-08-21 sin|con
//
// `dias`  — N días simulados: eje usado, cobertura, solape, y el TAMAÑO FINAL DE
//           TODOS LOS RIELES que quedan debajo del nuevo después del dedup. No
//           alcanza con contar cuántos títulos pierden: ninguno puede quedar
//           debajo de su piso ni desaparecer.
// `costo` — frío vs caliente. Va UN PROCESO POR VARIANTE a propósito (ver la
//           nota sobre el frío más abajo).
import { writeFileSync } from "node:fs";

const PROVIDERS = ["n", "d", "m"];
const VISIBLE = 20;
const AUDIENCE = 40;      // AUDIENCE_CARDS de lib/home.ts
const PISO_RIEL = 15;

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
const { candidatosDeSuperficie, enrichRaw, audienceTitles } = await import("@/lib/enrich.ts");
const { conRegistroDeEjes } = await import("@/lib/pools.ts");
const { dailySeed, pickDaily, withCacheMetrics, cacheStatus } = await import("@/lib/cache.ts");
const { soloAnimePlatform } = await import("@/lib/audience.ts");

const clave = (t) => `${t.type}:${t.id}`;
const fijar = (f) => { process.env.YUMP_FECHA = f; };

// --- Receta del riel (la misma que va a producción) --------------------------
const SUPERFICIE = "riel-mini";
const RECETA = { with_type: "2", with_status: "3" };
// Piso de votos DECLARADO por la superficie, no heredado del eje: 0 en todos
// salvo `top`, cuyo sort_by ES la nota y sin un piso de CANTIDAD de votos
// ordena por 10.0-con-1-voto. No es un piso de nota — no hay ninguno.
const PISO_VOTOS = { pop: "0", top: "10", nuevo: "0", taquilla: "0", hondo: "0" };
const ANIMACION = [16], FAMILIA = [10751, 10762], DOCUMENTAL = [99];

function sinGeneros(providers) {
  const out = [...DOCUMENTAL, ...FAMILIA];
  if (!providers.includes("cr")) out.push(...ANIMACION);
  return out;
}

// Réplica de `hashGenero` de lib/home.ts.
function hashTexto(g) {
  let h = 2166136261;
  for (let i = 0; i < g.length; i++) { h ^= g.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const mezclarDia = (p) => pickDaily(p, p.length, (dailySeed() + hashTexto("miniseries")) >>> 0);

// El piso por eje se resuelve en dos pasos porque `candidatosConEje` elige el
// eje adentro: se pide con el piso más ancho (0) y, si tocó `top`, se repite con
// su piso. Es una vuelta extra SOLO el día de `top` y solo en la medición; en
// producción el piso viaja en la receta desde el arranque.
async function candidatosMini(providers) {
  const base = {
    tipo: "tv", providers, startPage: 1, pages: 3, superficie: SUPERFICIE,
    extra: { ...RECETA, "vote_count.gte": PISO_VOTOS.pop },
    // `withoutGenres` no se puede pasar por `extra` (discover lo arma aparte),
    // así que va por el camino de `scope`… que exige un slug de género. Se pasa
    // como `extra.without_genres`, que discover pisa con Object.assign.
  };
  base.extra.without_genres = sinGeneros(providers).join(",");
  const r = await candidatosDeSuperficie(base);
  if (r.eje !== "top") return r;
  const conPiso = await candidatosDeSuperficie({
    ...base, ejeFijo: "top",
    extra: { ...base.extra, "vote_count.gte": PISO_VOTOS.top },
  });
  return { ...conPiso, eje: "top" };
}

// Réplica de `take()` de lib/home.ts.
function take(items, used, limit) {
  const out = [];
  if (limit <= 0) return out;
  for (const t of items) {
    const k = clave(t);
    if (used.has(k)) continue;
    used.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// Réplica del bucle de `genreRail`.
async function armarRiel(candidatos, used, providers, limite = VISIBLE) {
  const out = [];
  let pool = mezclarDia(candidatos);
  let vueltas = 0, pagados = 0;
  while (out.length < limite && vueltas < 4) {
    pool = pool.filter((r) => !used.has(`tv:${r.id}`));
    if (!pool.length) break;
    vueltas++;
    const faltan = limite - out.length;
    const tanda = pool.slice(0, Math.ceil(faltan * 1.4));
    pool = pool.slice(tanda.length);
    pagados += tanda.length;
    out.push(...take(await enrichRaw(tanda, "tv", providers), used, faltan));
  }
  return { items: out, vueltas, pagados };
}

// Orden EXACTO en el que composeHome reserva en `used` (etapa 2 de lib/home.ts).
// El riel nuevo entra después de `genre:documental`; abajo suyo quedan `family`
// y `adult-anime`, que son los únicos que pueden perder títulos.
const ANTES = ["ultimos", "mas-votados", "hacete-cargo",
  "genre:accion", "genre:scifi", "genre:terror", "genre:drama", "genre:comedia", "genre:documental"];
const DEBAJO = ["family", "adult-anime"];

async function unDia(fecha) {
  fijar(fecha);
  const { res: payload, ejes } = await conRegistroDeEjes(() => composeHome({ providers: PROVIDERS }));
  const porKey = Object.fromEntries(payload.rails.map((r) => [r.key, r]));

  // `used` justo después de genre:documental.
  const used = new Set(payload.hero.map(clave));
  for (const k of ANTES) for (const t of porKey[k]?.items ?? []) used.add(clave(t));

  const fuente = await candidatosMini(PROVIDERS);
  const mini = await armarRiel(fuente.candidatos, used, PROVIDERS);

  // Los rieles de abajo se REARMAN con el `used` que ya incluye al riel nuevo.
  // Es exacto y no una estimación: `audienceTitles` no lee `used` para pedir, así
  // que su pool es el mismo con y sin el riel nuevo — lo único que cambia es qué
  // toma `take`.
  const ocultarAnime = soloAnimePlatform(PROVIDERS);
  const familyPool = await audienceTitles("family", PROVIDERS);
  const animePool = ocultarAnime ? [] : await audienceTitles("adult-anime", PROVIDERS);
  const family = take(familyPool, used, AUDIENCE);
  const anime = ocultarAnime ? [] : take(animePool, used, AUDIENCE);

  const despues = { family: family.length, "adult-anime": anime.length };
  const antesDe = Object.fromEntries(DEBAJO.map((k) => [k, porKey[k]?.items.length ?? 0]));

  return {
    fecha,
    ejeMini: fuente.eje,
    degradadoEje: fuente.degradado,
    candidatos: fuente.candidatos.length,
    mini: mini.items.length,
    vueltas: mini.vueltas,
    pagados: mini.pagados,
    seOculta: mini.items.length < PISO_RIEL,
    claves: mini.items.map(clave),
    titulos: mini.items.map((t) => `${t.title} (${t.year})`),
    notas: mini.items.map((t) => t.tmdb).filter((v) => typeof v === "number"),
    // TODOS los rieles: los de arriba no se tocan (toman antes), los de abajo
    // se rearman. Se listan los dos grupos para poder verificar que ninguno
    // desaparece ni baja de su piso.
    rieles: [
      ...ANTES.map((k) => ({ key: k, n: porKey[k]?.items.length ?? 0, cambia: false })),
      { key: "miniseries", n: mini.items.length, cambia: true },
      ...DEBAJO.map((k) => ({ key: k, n: despues[k], antes: antesDe[k], perdidos: antesDe[k] - despues[k], cambia: true })),
    ],
    heroN: payload.hero.length,
    degradado: payload.degradado,
    ejesHome: Object.fromEntries(ejes),
  };
}

// ============================================================================
async function cmdDias(fecha, dias, salida) {
  const filas = [];
  const d0 = new Date(`${fecha}T12:00:00Z`);
  for (let i = 0; i < dias; i++) {
    const dia = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    const f = await unDia(dia);
    filas.push(f);
    process.stderr.write(`  ${dia} eje=${f.ejeMini}${f.degradadoEje ? "*" : ""} mini=${f.mini} ` +
      `family=${f.rieles.find((r) => r.key === "family").antes}→${f.rieles.find((r) => r.key === "family").n} ` +
      `anime=${f.rieles.find((r) => r.key === "adult-anime").antes}→${f.rieles.find((r) => r.key === "adult-anime").n}\n`);
  }
  const vistos = new Set(); const solapes = [];
  for (let i = 0; i < filas.length; i++) {
    filas[i].claves.forEach((k) => vistos.add(k));
    if (i > 0) {
      const prev = new Set(filas[i - 1].claves);
      solapes.push(filas[i].claves.length ? Math.round((filas[i].claves.filter((k) => prev.has(k)).length / filas[i].claves.length) * 100) : 0);
    }
  }
  const notas = filas.flatMap((f) => f.notas);
  const informe = {
    generado: new Date().toISOString(), desde: fecha, dias, providers: PROVIDERS,
    receta: RECETA, pisoVotos: PISO_VOTOS, sinGeneros: sinGeneros(PROVIDERS),
    cobertura: vistos.size,
    solapeMedio: solapes.length ? Math.round(solapes.reduce((a, b) => a + b, 0) / solapes.length) : 0,
    solapes,
    minPorDia: Math.min(...filas.map((f) => f.mini)),
    diasOculto: filas.filter((f) => f.seOculta).length,
    // Informativo. NUNCA se excluye por nota (ver el principio en CLAUDE.md).
    calidad: { media: Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100, bajo6: notas.filter((n) => n < 6).length, bajo5: notas.filter((n) => n < 5).length, n: notas.length },
    tmdb: resumenTmdb(), fallosTmdb: huboFallos(),
    dias_: filas,
  };
  // Tabla de TODOS los rieles, día a día.
  console.log("\nriel                      " + filas.map((f) => f.fecha.slice(5)).join("  ") + "   mín");
  const keys = filas[0].rieles.map((r) => r.key);
  for (const k of keys) {
    const ns = filas.map((f) => f.rieles.find((r) => r.key === k).n);
    console.log(`${k.padEnd(24)} ${ns.map((n) => String(n).padStart(5)).join("  ")}   ${String(Math.min(...ns)).padStart(3)}`);
  }
  console.log(`${"hero".padEnd(24)} ${filas.map((f) => String(f.heroN).padStart(5)).join("  ")}`);
  console.log(`\nejes: ${filas.map((f) => `${f.fecha.slice(5)}=${f.ejeMini}${f.degradadoEje ? "*" : ""}`).join(" ")}`);
  console.log(`cobertura ${informe.cobertura} · solape medio ${informe.solapeMedio}% · mín/día ${informe.minPorDia} · días oculto ${informe.diasOculto}`);
  console.log(`calidad (informativa): media ${informe.calidad.media} · <6.0 ${informe.calidad.bajo6}/${informe.calidad.n} · <5.0 ${informe.calidad.bajo5}`);
  console.log(`TMDB: ${informe.tmdb}${informe.fallosTmdb ? "  ⚠ hubo respuestas != 200" : ""}`);
  if (salida) { writeFileSync(salida, `${JSON.stringify(informe, null, 1)}\n`); console.log(`\nescrito en ${salida}`); }
}

// ============================================================================
// FRÍO EQUIVALENTE — cómo se garantiza.
//
// Un proceso nuevo vacía el cache EN MEMORIA, pero eso solo alcanza si no hay
// Upstash detrás: con Redis configurado, la segunda corrida leería lo que
// escribió la primera y el "frío" sería mentira. Por eso el script EXIGE que el
// cache esté en modo memoria y aborta si encuentra credenciales. El modo real y
// los HIT/MISS de cada corrida van en el informe para que se pueda verificar.
async function cmdCosto(fecha, variante) {
  const estado = cacheStatus();
  if (estado.modo !== "memoria") {
    console.error(`ABORTA: el cache está en modo "${estado.modo}" (fuente ${estado.fuente}).`);
    console.error("El frío de las dos corridas no sería comparable: la segunda leería lo que");
    console.error("escribió la primera. Corré sin UPSTASH_REDIS_REST_* / KV_REST_API_* en el entorno,");
    console.error("o apuntá cada corrida a una base distinta.");
    process.exit(1);
  }
  fijar(fecha);
  const conMini = variante === "con";

  async function corrida() {
    tmdbReq = 0;
    const t0 = Date.now();
    const { res, metricas } = await withCacheMetrics(() => conRegistroDeEjes(async () => {
      const payload = await composeHome({ providers: PROVIDERS });
      if (!conMini) return { payload, mini: null };
      const porKey = Object.fromEntries(payload.rails.map((r) => [r.key, r]));
      const used = new Set(payload.hero.map(clave));
      for (const k of ANTES) for (const t of porKey[k]?.items ?? []) used.add(clave(t));
      const fuente = await candidatosMini(PROVIDERS);
      const mini = await armarRiel(fuente.candidatos, used, PROVIDERS);
      return { payload, mini };
    }));
    const ms = Date.now() - t0;
    const { payload, mini } = res.res;
    const rails = [...payload.rails, ...(mini ? [{ key: "miniseries", title: "Miniseries para ansiosos", items: mini.items }] : [])];
    const json = JSON.stringify({ hero: payload.hero, rails, fallos: payload.fallos, degradado: payload.degradado });
    return {
      ms, tmdbReq,
      tarjetas: payload.hero.length + rails.reduce((a, r) => a + r.items.length, 0),
      payloadKB: Math.round(Buffer.byteLength(json) / 102.4) / 10,
      comandos: metricas.comandos, claves: metricas.claves, hits: metricas.hits, misses: metricas.misses,
      mini: mini ? mini.items.length : null,
    };
  }

  const frio = await corrida();
  const caliente = await corrida();
  const out = { fecha, variante, cache: estado, frio, caliente };
  console.log(JSON.stringify(out, null, 1));
}

// ============================================================================
const [cmd, ...args] = process.argv.slice(2);
if (cmd === "dias") await cmdDias(args[0] ?? "2026-08-21", Number(args[1] ?? 7), args[2]);
else if (cmd === "costo") await cmdCosto(args[0] ?? "2026-08-21", args[1] ?? "sin");
else { console.error("uso: dias <fecha> <n> [salida.json] | costo <fecha> sin|con"); process.exit(1); }
