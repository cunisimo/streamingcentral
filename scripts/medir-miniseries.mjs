#!/usr/bin/env node
// Medición del riel "Miniseries para ansiosos" a nivel TMDB.
//
//   node --env-file=.env.local scripts/medir-miniseries.mjs <subcomando> [salida.json]
//
// Subcomandos:
//   tipos        mapa de `with_type` verificado contra el campo `type` del detalle
//   variantes    las 4 variantes de query (piso 60 / minVotes 0 × estado)
//   temporadas   temporadas, `type` y `status` reales de TODO el pool
//   plataformas  fill del riel en cada una de las 14 plataformas, por eje
//   combos       lo mismo para combinaciones reales de plataformas
//   region       país de origen AR/LatAm con el piso del eje vs minVotes 0
//   todo         todos, a un JSON
//
// NO importa lib/: pega directo contra TMDB con los mismos parámetros que usa
// la app (flatrate, watch_region=AR, language=es-ES). Las comprobaciones de
// temporadas piden el detalle de cada título A PROPÓSITO y SOLO ACÁ: en
// producción el riel sale entero de discover (ver docs/medidas/).
import { writeFileSync } from "node:fs";

const TOKEN = process.env.TMDB_READ_TOKEN;
if (!TOKEN) { console.error("falta TMDB_READ_TOKEN"); process.exit(1); }

const BASE = "https://api.themoviedb.org/3";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, accept: "application/json" };
const DEFAULTS = { language: "es-ES", watch_region: "AR" };

// Mismo techo de concurrencia que lib/tmdb.ts, y por el mismo motivo: sin él
// una ráfaga de cientos de requests se cobra 429s y los números salen mal.
const MAX = 20;
let enVuelo = 0; const cola = [];
const adq = () => (enVuelo < MAX ? (enVuelo++, Promise.resolve()) : new Promise((r) => cola.push(r)));
const liberar = () => { const n = cola.shift(); if (n) n(); else enVuelo--; };

const status = new Map();
let requests = 0;

async function tmdb(path, params = {}) {
  const q = new URLSearchParams({ ...DEFAULTS, ...params });
  await adq();
  try {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(`${BASE}${path}?${q}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      requests++;
      status.set(r.status, (status.get(r.status) ?? 0) + 1);
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`TMDB ${r.status} en ${path}`);
      return r.json();
    }
    throw new Error(`TMDB 429 persistente en ${path}`);
  } finally { liberar(); }
}

// --- Plataformas: copia de lib/providers-ar.ts (PLATFORMS) -------------------
// Es un .mjs sin TS, así que va a mano. Si se agrega o saca una plataforma allá,
// actualizar acá — el informe dice explícitamente cuántas midió.
const PLATFORMS = [
  { code: "n", name: "Netflix", ids: [8] },
  { code: "d", name: "Disney+", ids: [337] },
  { code: "m", name: "Max", ids: [1899, 384] },
  { code: "at", name: "Apple TV+", ids: [350, 2243] },
  { code: "p", name: "Prime Video", ids: [119, 9] },
  { code: "cr", name: "Crunchyroll", ids: [283, 1968] },
  { code: "pp", name: "Paramount+", ids: [531, 582, 1853] },
  { code: "mb", name: "MUBI", ids: [11] },
  { code: "un", name: "Universal+", ids: [1889] },
  { code: "mv", name: "MovistarTV", ids: [339] },
  { code: "cv", name: "Claro video", ids: [167] },
  { code: "vx", name: "ViX", ids: [457] },
  { code: "dg", name: "DIRECTV GO", ids: [467] },
  { code: "ok", name: "OnDemandKorea", ids: [575] },
];
const POR_CODIGO = new Map(PLATFORMS.map((p) => [p.code, p]));
const ID_A_CODE = new Map();
for (const p of PLATFORMS) for (const id of p.ids) ID_A_CODE.set(id, p.code);
const TRIO = ["n", "d", "m"];

// --- Receta del riel ---------------------------------------------------------
// with_type=2  → miniserie (verificado en el subcomando `tipos`)
// with_status=3 → MARCADA COMO FINALIZADA POR TMDB. No es una garantía de que
//   la historia esté narrativamente cerrada: es el campo `status` de la ficha,
//   dato declarativo de TMDB que a veces está mal. Ver el subcomando
//   `temporadas`, que mide cuántas series de más de una temporada SOBREVIVEN a
//   este filtro.
// without_genres → animación (16) e infantil (10751, 10762) salvo que el
//   usuario tenga Crunchyroll (misma excepción que lib/audience.ts), y
//   documental (99) siempre: con el eje `nuevo` el pool llegaba a 41% de
//   documentales y el riel iría pegado abajo de "Documental".
const ANIMACION = [16];
const FAMILIA = [10751, 10762];
const DOCUMENTAL = [99];
const ANIME_PLATFORM = "cr";

function sinGeneros(codigos) {
  const out = [...DOCUMENTAL, ...FAMILIA];
  if (!codigos.includes(ANIME_PLATFORM)) out.push(...ANIMACION);
  return out;
}

const RECETA_MINI = { with_type: "2", with_status: "3" };

// --- Ejes: copia de EJES en lib/pools.ts, lado `tv` --------------------------
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const EJES = {
  pop: { desde: 1, params: { sort_by: "popularity.desc", "vote_count.gte": "60" } },
  top: { desde: 1, params: { sort_by: "vote_average.desc", "vote_count.gte": "300" } },
  nuevo: { desde: 1, params: { sort_by: "first_air_date.desc", "vote_count.gte": "10", "first_air_date.lte": HOY } },
  taquilla: { desde: 1, params: { sort_by: "vote_count.desc", "vote_count.gte": "60" } },
  hondo: { desde: 4, params: { sort_by: "popularity.desc", "vote_count.gte": "60" } },
};
const PAGINAS = 3;   // FETCH_BUFFER de lib/home.ts
const VISIBLE = 20;  // VISIBLE_CARDS
const PISO_RIEL = 15;

const discover = (p) => tmdb("/discover/tv", { with_watch_monetization_types: "flatrate", sort_by: "popularity.desc", ...p });
const nombre = (t) => t.name || t.original_name || `#${t.id}`;
const anio = (t) => (t.first_air_date ? t.first_air_date.slice(0, 4) : "?");

const cacheDetalle = new Map();
const detalle = (id) => {
  if (!cacheDetalle.has(id)) cacheDetalle.set(id, tmdb(`/tv/${id}`).catch(() => null));
  return cacheDetalle.get(id);
};
const cacheProv = new Map();
const provsDe = (id) => {
  if (!cacheProv.has(id)) cacheProv.set(id, tmdb(`/tv/${id}/watch/providers`).catch(() => null));
  return cacheProv.get(id);
};

// Réplica de `providersOf` + `onUserPlatforms` de lib/enrich.ts: SOLO flatrate
// en AR, y solo las plataformas elegidas. Es el filtro que decide cuántas
// tarjetas sobreviven de verdad.
async function enPlataformas(id, codigos) {
  const r = await provsDe(id);
  const flat = r?.results?.AR?.flatrate;
  if (!flat) return false;
  return flat.some((p) => codigos.includes(ID_A_CODE.get(p.provider_id)));
}

// Unión de pools por plataforma, tal como lo hace lib/pools.ts:
// una query por plataforma y página, dedup por id, reorden por popularidad.
async function pool(codigos, eje, extra = {}) {
  const def = EJES[eje];
  const partes = await Promise.all(codigos.flatMap((c) => {
    const p = POR_CODIGO.get(c);
    return Array.from({ length: PAGINAS }, (_, i) =>
      discover({
        ...RECETA_MINI, ...def.params, ...extra,
        without_genres: sinGeneros(codigos).join(","),
        with_watch_providers: p.ids.join("|"),
        page: String(def.desde + i),
      }).then((r) => r.results).catch(() => []));
  }));
  const v = new Map();
  for (const t of partes.flat()) if (!v.has(t.id)) v.set(t.id, t);
  return [...v.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

// ============================================================================
async function subTipos() {
  const filas = [];
  for (let v = 0; v <= 6; v++) {
    const r = await discover({ with_type: String(v), page: "1" });
    const muestra = r.results.slice(0, 8);
    const tipos = new Map();
    await Promise.all(muestra.map(async (t) => {
      const d = await detalle(t.id);
      const k = d?.type ?? "(sin detalle)";
      tipos.set(k, (tipos.get(k) ?? 0) + 1);
    }));
    filas.push({
      with_type: v, total_results: r.total_results, muestra: muestra.length,
      tipos: Object.fromEntries(tipos),
      ejemplos: muestra.slice(0, 3).map((t) => `${nombre(t)} (${anio(t)})`),
    });
  }
  return filas;
}

// ============================================================================
async function subVariantes() {
  const VARIANTES = [
    { id: "A", etiqueta: "with_type=2 · piso heredado 60 votos", p: { with_type: "2", "vote_count.gte": "60" } },
    { id: "B", etiqueta: "with_type=2 + with_status=3 · piso 60", p: { with_type: "2", with_status: "3", "vote_count.gte": "60" } },
    { id: "C", etiqueta: "with_type=2 · minVotes 0", p: { with_type: "2", "vote_count.gte": "0" } },
    { id: "D", etiqueta: "with_type=2 + with_status=3 · minVotes 0", p: { with_type: "2", with_status: "3", "vote_count.gte": "0" } },
  ];
  const out = [];
  for (const v of VARIANTES) {
    const porPlataforma = {};
    await Promise.all(TRIO.map(async (c) => {
      const r = await discover({ ...v.p, with_watch_providers: POR_CODIGO.get(c).ids.join("|"), page: "1" });
      porPlataforma[c] = { nombre: POR_CODIGO.get(c).name, total: r.total_results };
    }));
    const ids = TRIO.flatMap((c) => POR_CODIGO.get(c).ids);
    const combi = await discover({ ...v.p, with_watch_providers: ids.join("|"), page: "1" });
    const partes = await Promise.all(TRIO.flatMap((c) =>
      Array.from({ length: PAGINAS }, (_, i) =>
        discover({ ...v.p, with_watch_providers: POR_CODIGO.get(c).ids.join("|"), page: String(i + 1) })
          .then((r) => r.results).catch(() => []))));
    const vistos = new Map();
    for (const t of partes.flat()) if (!vistos.has(t.id)) vistos.set(t.id, t);
    const union = [...vistos.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const muestra = union.slice(0, 60);
    const estricto = await Promise.all(muestra.map((t) => enPlataformas(t.id, TRIO)));
    out.push({
      ...v, porPlataforma, combinadaTMDB: combi.total_results, unionPools: union.length,
      filtroEstricto: { evaluadas: muestra.length, sobreviven: estricto.filter(Boolean).length },
      ejemplos: union.slice(0, 12).map((t) => `${nombre(t)} (${anio(t)}) · ${t.vote_count}v · ${t.vote_average.toFixed(1)}`),
    });
  }
  return out;
}

// ============================================================================
// Temporadas, `type` y `status` reales. Se pide el detalle de TODO el pool de
// los cinco ejes, no de una muestra: la pregunta "¿with_type=2 garantiza una
// temporada?" no se contesta mirando solo la cabeza por popularidad.
async function subTemporadas() {
  // Sin `with_status` para poder medir QUÉ saca el filtro y qué deja pasar.
  const todos = new Map();
  const porEje = {};
  for (const eje of Object.keys(EJES)) {
    const def = EJES[eje];
    const partes = await Promise.all(TRIO.flatMap((c) =>
      Array.from({ length: PAGINAS }, (_, i) =>
        discover({
          with_type: "2", ...def.params, without_genres: sinGeneros(TRIO).join(","),
          with_watch_providers: POR_CODIGO.get(c).ids.join("|"), page: String(def.desde + i),
        }).then((r) => r.results).catch(() => []))));
    const v = new Set();
    for (const t of partes.flat()) if (!v.has(t.id)) { v.add(t.id); todos.set(t.id, t); }
    porEje[eje] = v.size;
  }
  const ids = [...todos.keys()];
  const detalles = await Promise.all(ids.map(detalle));
  const filas = detalles.filter(Boolean).map((d) => ({
    id: d.id, nombre: d.name, type: d.type, status: d.status,
    temporadas: d.number_of_seasons ?? 0, episodios: d.number_of_episodes ?? 0,
  }));
  const cuenta = (xs, f) => xs.reduce((m, x) => (m.set(f(x), (m.get(f(x)) ?? 0) + 1), m), new Map());
  const multi = filas.filter((f) => f.temporadas > 1);
  // La pregunta del dueño: ¿cuántas de más de una temporada SOBREVIVEN al
  // filtro de estado? `with_status=3` filtra por el campo `status`, no por la
  // cantidad de temporadas, así que no tiene por qué sacarlas.
  const multiSobreviven = multi.filter((f) => f.status === "Ended");
  const eps = filas.map((f) => f.episodios).filter((n) => n > 0).sort((a, b) => a - b);
  const pct = (q) => eps[Math.floor(eps.length * q)];
  return {
    porEje, total: filas.length,
    type: Object.fromEntries(cuenta(filas, (f) => f.type)),
    status: Object.fromEntries(cuenta(filas, (f) => f.status)),
    temporadas: Object.fromEntries(cuenta(filas, (f) => (f.temporadas >= 3 ? "3+" : String(f.temporadas)))),
    multiTemporada: multi.map((f) => `${f.nombre} — ${f.temporadas} temp · status ${f.status}`),
    multiTemporadaTrasFiltro: multiSobreviven.map((f) => `${f.nombre} — ${f.temporadas} temp`),
    conFiltroEstado: {
      pasan: filas.filter((f) => f.status === "Ended").length,
      quedanFuera: filas.filter((f) => f.status !== "Ended").length,
      multiQueSobrevive: multiSobreviven.length,
    },
    episodios: { min: eps[0], p25: pct(0.25), mediana: pct(0.5), p75: pct(0.75), p95: pct(0.95), max: eps[eps.length - 1], sobre12: eps.filter((n) => n > 12).length, n: eps.length },
  };
}

// ============================================================================
// Fill del riel en CADA plataforma suelta, por eje. Es la pregunta que decide
// si el riel se oculta: la app admite 14 plataformas y el trío n,d,m es el caso
// fácil, no el peor.
const PISO_EJE = 24;   // lib/pools.ts
const EJE_BASE = "pop";

// Réplica de `candidatosConEje`: si el eje del día no llega al piso, se cae al
// eje base y se queda con la cosecha MÁS GRANDE de las dos. Medir el eje crudo
// sin esto da un falso negativo — `hondo` arranca en la página 4 y en una
// plataforma chica vuelve VACÍO siempre, que es exactamente el caso para el que
// se escribió el guard.
async function poolConGuard(codigos, eje, extra = {}) {
  const delDia = await pool(codigos, eje, extra);
  if (delDia.length >= PISO_EJE || eje === EJE_BASE) return { candidatos: delDia, eje, degradado: false };
  const suelo = await pool(codigos, EJE_BASE, extra);
  if (suelo.length <= delDia.length) return { candidatos: delDia, eje, degradado: false };
  return { candidatos: suelo, eje: `${EJE_BASE}*`, degradado: true };
}

async function subPlataformas() {
  const out = [];
  for (const p of PLATFORMS) {
    const fila = { code: p.code, nombre: p.name, ejes: {} };
    for (const eje of Object.keys(EJES)) {
      const g = await poolConGuard([p.code], eje);
      const candidatos = g.candidatos;
      // Réplica del bucle de genreRail: enriquece una tanda con 40% de margen y
      // filtra a la plataforma. Sin mezcla diaria: acá se mide el TECHO, y
      // barajar solo cambia cuáles entran, no cuántas sobreviven al filtro.
      const items = [];
      let restante = [...candidatos];
      let vueltas = 0, pagados = 0;
      while (items.length < VISIBLE && restante.length && vueltas < 4) {
        vueltas++;
        const faltan = VISIBLE - items.length;
        const tanda = restante.slice(0, Math.ceil(faltan * 1.4));
        restante = restante.slice(tanda.length);
        pagados += tanda.length;
        const ok = await Promise.all(tanda.map((t) => enPlataformas(t.id, [p.code])));
        for (let i = 0; i < tanda.length; i++) if (ok[i] && items.length < VISIBLE) items.push(tanda[i]);
      }
      fila.ejes[eje] = { candidatos: candidatos.length, tarjetas: items.length, pagados, ejeUsado: g.eje, degradado: g.degradado };
    }
    const tarjetas = Object.values(fila.ejes).map((e) => e.tarjetas);
    fila.min = Math.min(...tarjetas);
    fila.max = Math.max(...tarjetas);
    // El veredicto lo marca el PEOR eje: el riel rota, así que si un solo eje
    // no llega al piso, ese día el riel se oculta para esa plataforma.
    fila.veredicto = fila.min >= VISIBLE ? "20 siempre" : fila.min >= PISO_RIEL ? "15-19 algún día" : "se oculta algún día";
    fila.ejesBajoPiso = Object.entries(fila.ejes).filter(([, e]) => e.tarjetas < PISO_RIEL).map(([k]) => k);
    out.push(fila);
    process.stderr.write(`  ${p.code.padEnd(3)} ${p.name.padEnd(14)} ${Object.entries(fila.ejes).map(([k, e]) => `${k}=${e.tarjetas}${e.degradado ? "*" : ""}`).join(" ")}  → ${fila.veredicto}\n`);
  }
  return out;
}

// ============================================================================
// Lo mismo pero para COMBINACIONES reales. Una plataforma sola es el peor caso
// y no el caso típico: el selector arranca con n,d,m y la mayoría elige 2 o 3.
const COMBOS = [
  ["n"], ["d"], ["cr"], ["mb"],
  ["n", "d", "m"], ["n", "p"], ["d", "m"], ["cr", "n"],
  ["mb", "un", "vx"], ["n", "d", "m", "at", "p", "pp"],
  PLATFORMS.map((p) => p.code),
];
async function subCombos() {
  const out = [];
  for (const codigos of COMBOS) {
    const fila = { combo: codigos.join(","), n: codigos.length, ejes: {} };
    for (const eje of Object.keys(EJES)) {
      const g = await poolConGuard(codigos, eje);
      const items = [];
      let restante = [...g.candidatos];
      let vueltas = 0;
      while (items.length < VISIBLE && restante.length && vueltas < 4) {
        vueltas++;
        const tanda = restante.slice(0, Math.ceil((VISIBLE - items.length) * 1.4));
        restante = restante.slice(tanda.length);
        const ok = await Promise.all(tanda.map((t) => enPlataformas(t.id, codigos)));
        for (let i = 0; i < tanda.length; i++) if (ok[i] && items.length < VISIBLE) items.push(tanda[i]);
      }
      fila.ejes[eje] = { candidatos: g.candidatos.length, tarjetas: items.length, degradado: g.degradado };
    }
    const t = Object.values(fila.ejes).map((e) => e.tarjetas);
    fila.min = Math.min(...t);
    fila.veredicto = fila.min >= VISIBLE ? "20 siempre" : fila.min >= PISO_RIEL ? "15-19 algún día" : "se oculta algún día";
    // Claves de pool que consume ESTE combo en un día: 1 receta × plataformas ×
    // páginas, más otro tanto si el guard tiene que caer al eje base.
    fila.clavesPorDia = codigos.length * PAGINAS;
    fila.clavesPorDiaConFallback = codigos.length * PAGINAS * 2;
    out.push(fila);
    process.stderr.write(`  ${fila.combo.padEnd(28).slice(0, 28)} ${Object.entries(fila.ejes).map(([k, e]) => `${k}=${e.tarjetas}${e.degradado ? "*" : ""}`).join(" ")}  → ${fila.veredicto}  (${fila.clavesPorDia} claves/día)\n`);
  }
  return out;
}

// ============================================================================
// País de origen: lo que el piso de votos deja afuera del cine/serie regional.
// El idioma NO sirve de sustituto (una coproducción española y una argentina
// son las dos "es"), así que se mide por `origin_country`.
const LATAM = ["AR", "MX", "CL", "CO", "UY", "PE", "BR", "VE", "EC", "BO", "PY", "CR", "DO", "GT", "PA", "CU", "NI", "HN", "SV"];
async function subRegion() {
  const out = { porEje: {}, resumen: {} };
  const acumPiso = new Map(), acumCero = new Map();
  for (const eje of Object.keys(EJES)) {
    const conPiso = await pool(TRIO, eje);
    // minVotes 0: `vote_count.gte` en extra pisa el del eje (en discover() el
    // extra se aplica con Object.assign DESPUÉS de armar vote_count.gte).
    const conCero = await pool(TRIO, eje, { "vote_count.gte": "0" });
    const marcar = (xs, acum) => {
      const ar = [], latam = [];
      for (const t of xs) {
        const cs = t.origin_country ?? [];
        if (cs.includes("AR")) ar.push(t);
        if (cs.some((c) => LATAM.includes(c))) { latam.push(t); acum.set(t.id, t); }
      }
      return { total: xs.length, ar: ar.length, latam: latam.length, titulos: latam.map((t) => `${nombre(t)} (${anio(t)}) ${(t.origin_country ?? []).join("/")} · ${t.vote_count}v`) };
    };
    const a = marcar(conPiso, acumPiso);
    const b = marcar(conCero, acumCero);
    const nuevosIds = new Set(conPiso.map((t) => t.id));
    const soloEnCero = conCero.filter((t) => !nuevosIds.has(t.id) && (t.origin_country ?? []).some((c) => LATAM.includes(c)));
    out.porEje[eje] = {
      pisoDelEje: EJES[eje].params["vote_count.gte"],
      conPiso: a, conCero: b,
      latamQueSoloApareceConCero: soloEnCero.map((t) => `${nombre(t)} (${anio(t)}) ${(t.origin_country ?? []).join("/")} · ${t.vote_count}v`),
    };
  }
  out.resumen = {
    latamUnicasConPiso: acumPiso.size,
    latamUnicasConCero: acumCero.size,
    soloConCero: [...acumCero.keys()].filter((id) => !acumPiso.has(id)).length,
    titulosSoloConCero: [...acumCero.values()].filter((t) => !acumPiso.has(t.id))
      .map((t) => `${nombre(t)} (${anio(t)}) ${(t.origin_country ?? []).join("/")} · ${t.vote_count}v`),
  };
  return out;
}

// ============================================================================
const [cmd = "todo", salida] = process.argv.slice(2);
const t0 = Date.now();
const informe = { generado: new Date().toISOString(), fechaAR: HOY, receta: RECETA_MINI, sinGenerosTrio: sinGeneros(TRIO), plataformas: PLATFORMS.length };

if (cmd === "tipos" || cmd === "todo") { process.stderr.write("tipos…\n"); informe.tipos = await subTipos(); }
if (cmd === "variantes" || cmd === "todo") { process.stderr.write("variantes…\n"); informe.variantes = await subVariantes(); }
if (cmd === "temporadas" || cmd === "todo") { process.stderr.write("temporadas…\n"); informe.temporadas = await subTemporadas(); }
if (cmd === "plataformas" || cmd === "todo") { process.stderr.write("plataformas (14)…\n"); informe.plataformas = await subPlataformas(); }
if (cmd === "combos" || cmd === "todo") { process.stderr.write("combos…\n"); informe.combos = await subCombos(); }
if (cmd === "region" || cmd === "todo") { process.stderr.write("region…\n"); informe.region = await subRegion(); }

informe.costoMedicion = { requests, status: Object.fromEntries(status), segundos: Math.round((Date.now() - t0) / 1000) };
const json = `${JSON.stringify(informe, null, 1)}\n`;
if (salida) { writeFileSync(salida, json); process.stderr.write(`escrito en ${salida}\n`); } else { console.log(json); }
