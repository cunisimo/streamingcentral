#!/usr/bin/env node
// Medición del idioma de los títulos: es-ES vs es-AR vs es-MX vs alternativos AR.
//
//   node --env-file=.env.local scripts/medir-idioma-titulos.mjs <subcomando>
//
// Orden de uso: instrumento → muestra → medir → sinopsis → informe → estrategias
//
// Subcomandos:
//   instrumento  verifica que el parámetro `language` LLEGA y CAMBIA la respuesta,
//                antes de creerle a cualquier número. Si es-AR devuelve lo mismo
//                que es-ES puede ser un hallazgo real o el instrumento roto; el
//                control con en-US/de-DE distingue una cosa de la otra.
//   muestra      arma los 60 títulos desde el catálogo REAL de Yump (flatrate,
//                watch_region=AR, los 14 provider_id de lib/providers-ar.ts) y
//                los versiona en docs/medidas/. La muestra queda FIJA: `medir`
//                la lee del archivo, así que la medición es reproducible aunque
//                TMDB reordene su catálogo mañana.
//   medir        6 llamadas por título (es-ES, es-AR, es-MX, alternative_titles,
//                translations, watch/providers) → JSON crudo.
//   sinopsis     el costo escondido del cambio: cuántas fichas se quedan SIN
//                sinopsis en es-MX. 2 llamadas por título.
//   informe      agrega el JSON crudo a los porcentajes pedidos. No pega a la red.
//   estrategias  compara las 5 estrategias contra el nombre REAL de la
//                plataforma, leyendo -verificado.json. No pega a la red.
//
// NO importa lib/: pega directo contra TMDB. No toca Redis ni Supabase, así que
// no contamina ningún cache de producción ni modifica la base.
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const TOKEN = process.env.TMDB_READ_TOKEN;
const BASE = "https://api.themoviedb.org/3";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, accept: "application/json" };
const DEFAULTS = { watch_region: "AR" };

const DIR = "docs/medidas";
const F_MUESTRA = `${DIR}/2026-08-23-idioma-muestra.json`;
const F_CRUDO = `${DIR}/2026-08-23-idioma-crudo.json`;
const F_INFORME = `${DIR}/2026-08-23-idioma-informe.json`;

// Mismo techo que lib/tmdb.ts: sin él una ráfaga se cobra 429s y los números
// salen MAL, no de menos — un 429 se leería como "título sin traducción".
const MAX = 16;
let enVuelo = 0; const cola = [];
const adq = () => (enVuelo < MAX ? (enVuelo++, Promise.resolve()) : new Promise((r) => cola.push(r)));
const liberar = () => { const n = cola.shift(); if (n) n(); else enVuelo--; };

const status = new Map();
let requests = 0;
let primeraUrl = null;

async function tmdb(path, params = {}) {
  const q = new URLSearchParams({ ...DEFAULTS, ...params });
  const url = `${BASE}${path}?${q}`;
  if (!primeraUrl) primeraUrl = url;
  await adq();
  try {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
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
// Es un .mjs sin TS, así que va a mano. Si cambia allá, actualizar acá — el
// informe dice explícitamente cuántas midió.
const PLATFORMS = [
  { code: "n",  name: "Netflix",       ids: [8] },
  { code: "d",  name: "Disney+",       ids: [337] },
  { code: "m",  name: "Max",           ids: [1899, 384] },
  { code: "at", name: "Apple TV+",     ids: [350, 2243] },
  { code: "p",  name: "Prime Video",   ids: [119, 9] },
  { code: "cr", name: "Crunchyroll",   ids: [283, 1968] },
  { code: "pp", name: "Paramount+",    ids: [531, 582, 1853] },
  { code: "mb", name: "MUBI",          ids: [11] },
  { code: "un", name: "Universal+",    ids: [1889] },
  { code: "mv", name: "MovistarTV",    ids: [339] },
  { code: "cv", name: "Claro video",   ids: [167] },
  { code: "vx", name: "ViX",           ids: [457] },
  { code: "dg", name: "DIRECTV GO",    ids: [467] },
  { code: "ok", name: "OnDemandKorea", ids: [575] },
];
const TODOS_IDS = PLATFORMS.flatMap((p) => p.ids).join("|");
const POR_ID = new Map(PLATFORMS.flatMap((p) => p.ids.map((id) => [id, p.code])));

// ============================================================================
// instrumento
// ============================================================================
// Antes de medir 60 títulos hay que probar que el instrumento distingue. Los
// casos 562 y 771 están documentados en lib/tmdb.ts: en es-MX son "Duro de
// matar" y "Mi pobre angelito". Si NO difieren, el `language` no está llegando.
async function instrumento() {
  const casos = [
    { id: 562, tipo: "movie", esperado: "es-MX difiere de es-ES (Duro de matar / Jungla de cristal)" },
    { id: 771, tipo: "movie", esperado: "es-MX difiere de es-ES (Mi pobre angelito / Solo en casa)" },
    { id: 12535, tipo: "movie", esperado: "el caso que disparó la auditoría" },
  ];
  const idiomas = ["es-ES", "es-AR", "es-MX", "en-US", "de-DE"];
  const out = [];
  for (const c of casos) {
    const fila = { id: c.id, tipo: c.tipo, esperado: c.esperado, titulos: {} };
    for (const l of idiomas) {
      const d = await tmdb(`/${c.tipo}/${c.id}`, { language: l });
      fila.titulos[l] = d.title ?? d.name ?? "";
      fila.original = d.original_title ?? d.original_name ?? null;
    }
    out.push(fila);
  }

  const c562 = out.find((f) => f.id === 562);
  const veredicto = {
    // 1. El parámetro LLEGA: en-US y de-DE tienen que diferir de es-ES.
    parametro_llega: c562.titulos["en-US"] !== c562.titulos["es-ES"]
                  && c562.titulos["de-DE"] !== c562.titulos["es-ES"],
    // 2. es-MX distingue: el caso documentado en lib/tmdb.ts se reproduce.
    es_mx_distingue: c562.titulos["es-MX"] !== c562.titulos["es-ES"],
    // 3. es-AR: si no difiere en NINGUNO de los tres, con (1) en verde es un
    //    hallazgo real (TMDB no tiene traducción es-AR y cae al español de
    //    España), no un bug del script.
    es_ar_aporta_en_algun_caso: out.some((f) => f.titulos["es-AR"] !== f.titulos["es-ES"]),
  };
  console.log(JSON.stringify({ veredicto, casos: out, primeraUrl, requests }, null, 2));
  if (!veredicto.parametro_llega) {
    console.error("\nINSTRUMENTO ROTO: el parámetro `language` no cambia la respuesta. No medir.");
    process.exit(2);
  }
  if (!veredicto.es_mx_distingue) {
    console.error("\nINSTRUMENTO SOSPECHOSO: 562 no reproduce el caso documentado en lib/tmdb.ts.");
    process.exit(2);
  }
  console.error("\nInstrumento OK: el idioma llega y cambia la respuesta.");
}

// ============================================================================
// muestra
// ============================================================================
const RECETAS = {
  pop:     { movie: { sort_by: "popularity.desc" },
             tv:    { sort_by: "popularity.desc" } },
  clasico: { movie: { sort_by: "popularity.desc", "primary_release_date.lte": "1999-12-31" },
             tv:    { sort_by: "popularity.desc", "first_air_date.lte": "1999-12-31" } },
  familia: { movie: { sort_by: "popularity.desc", with_genres: "10751" },
             tv:    { sort_by: "popularity.desc", with_genres: "10751,10762" } },
  // TV no tiene género Terror en TMDB: keyword 9799, igual que lib/categories.ts.
  terror:  { movie: { sort_by: "popularity.desc", with_genres: "27" },
             tv:    { sort_by: "popularity.desc", with_keywords: "9799" } },
  comedia: { movie: { sort_by: "popularity.desc", with_genres: "35" },
             tv:    { sort_by: "popularity.desc", with_genres: "35" } },
  latam:   { movie: { sort_by: "popularity.desc", with_original_language: "es" },
             tv:    { sort_by: "popularity.desc", with_original_language: "es" } },
};

async function discover(tipo, extra) {
  const r = await tmdb(`/discover/${tipo}`, {
    language: "es-ES",                       // el idioma que usa la app hoy
    with_watch_monetization_types: "flatrate",
    include_adult: "false",
    page: "1",
    ...extra,
  });
  return (r.results ?? []).map((x) => ({
    id: x.id, tipo,
    titulo_es_es: x.title ?? x.name ?? "",
    anio: Number((x.release_date || x.first_air_date || "").slice(0, 4)) || null,
  }));
}

async function muestra() {
  // Cobertura de plataforma: la lista de CADA plataforma por separado. Es la
  // única forma de garantizar ≥2 en las chicas (OnDemandKorea, Universal+),
  // que nunca aparecen arriba en una consulta combinada por popularidad.
  const porPlataforma = {};
  await Promise.all(PLATFORMS.flatMap((p) => ["movie", "tv"].map(async (tipo) => {
    const r = await discover(tipo, { with_watch_providers: p.ids.join("|") });
    (porPlataforma[p.code] ??= {})[tipo] = r;
  })));

  // Cobertura temática: consulta combinada de las 14, una por receta y tipo.
  const porReceta = {};
  await Promise.all(Object.entries(RECETAS).flatMap(([nombre, def]) =>
    ["movie", "tv"].map(async (tipo) => {
      const r = await discover(tipo, { with_watch_providers: TODOS_IDS, ...def[tipo] });
      (porReceta[nombre] ??= {})[tipo] = r;
    })));

  const elegidos = new Map();  // "tipo:id" → fila
  const cuenta = { movie: 0, tv: 0 };
  const tomar = (fila, motivo, plataforma) => {
    const k = `${fila.tipo}:${fila.id}`;
    if (elegidos.has(k)) { elegidos.get(k).motivos.push(motivo); return false; }
    if (cuenta[fila.tipo] >= 30) return false;
    elegidos.set(k, { ...fila, motivos: [motivo], plataforma_semilla: plataforma ?? null });
    cuenta[fila.tipo]++;
    return true;
  };

  // 1. Obligatorio: el caso que disparó la auditoría.
  const mel = await tmdb("/movie/12535", { language: "es-ES" });
  tomar(
    { id: 12535, tipo: "movie", titulo_es_es: mel.title, anio: Number((mel.release_date ?? "").slice(0, 4)) || null },
    "obligatorio: caso Mel Brooks", null,
  );

  // 2. Cobertura de plataforma: 1 movie + 1 tv por plataforma. Si el primero ya
  //    estaba elegido por otra, se prueba con los siguientes.
  for (const p of PLATFORMS) {
    for (const tipo of ["movie", "tv"]) {
      const lista = porPlataforma[p.code][tipo] ?? [];
      let ok = false;
      for (const f of lista.slice(0, 6)) if (tomar(f, `cobertura ${p.name}`, p.code)) { ok = true; break; }
      if (!ok && lista.length) {
        // Todos los candidatos ya estaban: la plataforma igual queda cubierta,
        // porque `motivos` acumula. Se registra para el informe.
        (elegidos.get(`${tipo}:${lista[0].id}`) ?? {}).cubre_tambien ??= [];
      }
    }
  }

  // 3. Cobertura temática con lo que queda libre, en round-robin para que
  //    ninguna receta se coma todos los cupos.
  const recetas = Object.keys(RECETAS);
  for (let i = 0; cuenta.movie < 30 || cuenta.tv < 30; i++) {
    let algo = false;
    for (const nombre of recetas) {
      for (const tipo of ["movie", "tv"]) {
        if (cuenta[tipo] >= 30) continue;
        const lista = porReceta[nombre][tipo] ?? [];
        for (const f of lista.slice(i * 2, i * 2 + 6)) if (tomar(f, nombre, null)) { algo = true; break; }
      }
    }
    if (!algo) break;   // se agotaron las listas antes de llegar a 60
  }

  const filas = [...elegidos.values()];
  const salida = {
    generado: "2026-08-23",
    nota: "Muestra FIJA. `medir` la lee de acá, así que la medición es reproducible aunque TMDB reordene su catálogo.",
    plataformas_medidas: PLATFORMS.length,
    total: filas.length,
    movies: filas.filter((f) => f.tipo === "movie").length,
    tv: filas.filter((f) => f.tipo === "tv").length,
    requests_de_esta_fase: requests,
    titulos: filas,
  };
  writeFileSync(F_MUESTRA, JSON.stringify(salida, null, 2));
  console.log(`${F_MUESTRA}: ${salida.total} títulos (${salida.movies} movie / ${salida.tv} tv), ${requests} requests`);
  console.log(`status: ${JSON.stringify(Object.fromEntries(status))}`);
}

// ============================================================================
// medir
// ============================================================================
async function medirTitulo(f) {
  const { id, tipo } = f;
  const [esES, esAR, esMX, alt, trad, prov] = await Promise.all([
    tmdb(`/${tipo}/${id}`, { language: "es-ES" }),
    tmdb(`/${tipo}/${id}`, { language: "es-AR" }),
    tmdb(`/${tipo}/${id}`, { language: "es-MX" }),
    tmdb(`/${tipo}/${id}/alternative_titles`),
    tmdb(`/${tipo}/${id}/translations`),
    tmdb(`/${tipo}/${id}/watch/providers`),
  ]);

  // alternative_titles: en movie viene bajo `titles`, en tv bajo `results`.
  // Leer solo uno deja la mitad del catálogo sin alternativos, en silencio
  // (el mismo error que ya pasó con /keywords, ver lib/tmdb.ts).
  const alternativos = (alt.titles ?? alt.results ?? []).map((a) => ({
    pais: a.iso_3166_1, titulo: a.title, tipo: a.type || null,
  }));

  // translations: movie → data.title, tv → data.name.
  const traducciones = (trad.translations ?? [])
    .filter((t) => t.iso_639_1 === "es")
    .map((t) => ({ pais: t.iso_3166_1, titulo: t.data?.title ?? t.data?.name ?? "" }))
    .filter((t) => t.titulo);

  const flatrate = prov.results?.AR?.flatrate ?? [];
  const codigos = [...new Set(flatrate.map((p) => POR_ID.get(p.provider_id)).filter(Boolean))];

  return {
    id, tipo,
    motivos: f.motivos,
    plataforma_semilla: f.plataforma_semilla ?? null,
    anio: Number((esES.release_date || esES.first_air_date || "").slice(0, 4)) || null,
    original: esES.original_title ?? esES.original_name ?? "",
    idioma_original: esES.original_language ?? "",
    es_ES: esES.title ?? esES.name ?? "",
    es_AR: esAR.title ?? esAR.name ?? "",
    es_MX: esMX.title ?? esMX.name ?? "",
    alt_AR: alternativos.filter((a) => a.pais === "AR").map((a) => a.titulo),
    alt_MX: alternativos.filter((a) => a.pais === "MX").map((a) => a.titulo),
    alt_ES: alternativos.filter((a) => a.pais === "ES").map((a) => a.titulo),
    alt_todos: alternativos,
    traducciones_es: traducciones,
    plataformas_ar: codigos,
    proveedores_crudos: flatrate.map((p) => ({ id: p.provider_id, nombre: p.provider_name })),
    link_tmdb: prov.results?.AR?.link ?? null,
  };
}

async function medir() {
  if (!existsSync(F_MUESTRA)) { console.error(`falta ${F_MUESTRA}: correr "muestra" primero`); process.exit(1); }
  const m = JSON.parse(readFileSync(F_MUESTRA, "utf8"));
  const filas = [];
  const LOTE = 10;   // el semáforo ya limita; el lote es para ver el progreso
  for (let i = 0; i < m.titulos.length; i += LOTE) {
    const t = await Promise.all(m.titulos.slice(i, i + LOTE).map(medirTitulo));
    filas.push(...t);
    console.error(`  ${filas.length}/${m.titulos.length}`);
  }
  const salida = {
    generado: "2026-08-23",
    muestra: F_MUESTRA,
    llamadas_reales: requests,
    llamadas_por_titulo: 6,
    status: Object.fromEntries(status),
    titulos: filas,
  };
  writeFileSync(F_CRUDO, JSON.stringify(salida, null, 2));
  console.log(`${F_CRUDO}: ${filas.length} títulos, ${requests} llamadas reales a TMDB`);
  console.log(`status: ${JSON.stringify(Object.fromEntries(status))}`);
}

// ============================================================================
// informe
// ============================================================================
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }

const LATAM = new Set(["AR","MX","CL","CO","PE","UY","VE","BO","PY","EC","CR","GT","PA","DO","HN","NI","SV","CU"]);

function informe() {
  if (!existsSync(F_CRUDO)) { console.error(`falta ${F_CRUDO}: correr "medir" primero`); process.exit(1); }
  const c = JSON.parse(readFileSync(F_CRUDO, "utf8"));
  const T = c.titulos;

  const stat = (filas) => {
    const n = filas.length;
    const mxDifiere = filas.filter((f) => f.es_MX && f.es_MX !== f.es_ES);
    const arDifiere = filas.filter((f) => f.es_AR && f.es_AR !== f.es_ES);
    const conAltAR = filas.filter((f) => f.alt_AR.length);
    const altARNuevo = filas.filter((f) => f.alt_AR.some((t) => t !== f.es_ES && t !== f.es_MX));
    // "Sin ninguna alternativa latinoamericana": ni es-MX distinto, ni alt AR,
    // ni alt MX, ni traducción es-XX de un país latinoamericano distinta.
    const sinAlternativa = filas.filter((f) => {
      const cand = [
        f.es_MX, ...f.alt_AR, ...f.alt_MX,
        ...f.traducciones_es.filter((t) => LATAM.has(t.pais)).map((t) => t.titulo),
      ].filter(Boolean);
      return !cand.some((t) => t !== f.es_ES);
    });
    return {
      n,
      es_MX_difiere: mxDifiere.length, es_MX_difiere_pct: pct(mxDifiere.length, n),
      es_AR_difiere: arDifiere.length, es_AR_difiere_pct: pct(arDifiere.length, n),
      con_alternativo_AR: conAltAR.length, con_alternativo_AR_pct: pct(conAltAR.length, n),
      alternativo_AR_aporta_nuevo: altARNuevo.length,
      sin_ninguna_alternativa_latam: sinAlternativa.length,
      sin_ninguna_alternativa_latam_pct: pct(sinAlternativa.length, n),
    };
  };

  const porAntiguedad = {};
  for (const [rango, test] of [
    ["anteriores a 1980", (a) => a && a < 1980],
    ["1980-1999",         (a) => a && a >= 1980 && a <= 1999],
    ["2000-2014",         (a) => a && a >= 2000 && a <= 2014],
    ["2015 en adelante",  (a) => a && a >= 2015],
    ["sin año",           (a) => !a],
  ]) porAntiguedad[rango] = stat(T.filter((f) => test(f.anio)));

  const porPlataforma = {};
  for (const p of PLATFORMS) {
    const filas = T.filter((f) => f.plataformas_ar.includes(p.code));
    porPlataforma[p.name] = { codigo: p.code, ...stat(filas) };
  }

  // Ranking de riesgo, para armar la submuestra de 20 a verificar a mano.
  const riesgo = T.map((f) => {
    const altAR = f.alt_AR[0] ?? null;
    const variantes = [...new Set([f.es_ES, f.es_MX, altAR].filter(Boolean))];
    let p = 0;
    if (variantes.length >= 3) p += 100;                    // los tres difieren
    else if (variantes.length === 2) p += 50;
    if (f.anio && f.anio < 2000) p += 40;                   // clásicos
    if (f.anio && f.anio < 1980) p += 20;
    if (f.motivos.includes("familia")) p += 25;             // infantil/familiar
    if (f.es_MX && f.es_MX !== f.es_ES) p += 30;
    p += Math.min(f.plataformas_ar.length, 3) * 5;
    return { ...f, riesgo: p, variantes };
  }).sort((a, b) => b.riesgo - a.riesgo || a.id - b.id);

  const salida = {
    generado: "2026-08-23",
    fuente: F_CRUDO,
    llamadas_reales: c.llamadas_reales,
    total: stat(T),
    movies: stat(T.filter((f) => f.tipo === "movie")),
    series: stat(T.filter((f) => f.tipo === "tv")),
    por_antiguedad: porAntiguedad,
    por_plataforma: porPlataforma,
    tabla: T.map((f) => ({
      ref: `${f.tipo}:${f.id}`, anio: f.anio,
      original: f.original,
      es_ES: f.es_ES, es_AR: f.es_AR, es_MX: f.es_MX,
      alt_AR: f.alt_AR.join(" | "),
      plataformas: f.plataformas_ar.join(","),
      mx_difiere: f.es_MX !== f.es_ES,
      ar_difiere: f.es_AR !== f.es_ES,
    })),
    submuestra_riesgo_20: riesgo.slice(0, 20).map((f) => ({
      ref: `${f.tipo}:${f.id}`, riesgo: f.riesgo, anio: f.anio,
      original: f.original, es_ES: f.es_ES, es_MX: f.es_MX,
      alt_AR: f.alt_AR.join(" | "),
      plataformas: f.plataformas_ar.join(","),
      link_tmdb: f.link_tmdb,
    })),
    // La comparación de estrategias NO se calcula acá: sin el nombre real de la
    // plataforma no hay contra qué comparar, y TMDB no es esa fuente.
    nota_estrategias: "Ver docs/medidas/2026-08-23-idioma-verificacion.md",
  };
  writeFileSync(F_INFORME, JSON.stringify(salida, null, 2));
  console.log(JSON.stringify({
    total: salida.total, movies: salida.movies, series: salida.series,
    por_antiguedad: porAntiguedad,
  }, null, 2));
  console.log(`\n${F_INFORME} escrito.`);
}

// ============================================================================
// sinopsis
// ============================================================================
// El costo escondido del cambio global. Cuando TMDB no tiene traducción MX de un
// título NO cae a es-ES: cae al ORIGINAL. Eso se ve en el título (`런닝맨`) pero
// sobre todo en la sinopsis, que queda VACÍA. Sin esta medición el cambio se
// evalúa solo por los títulos y la regresión aparece en producción.
const F_SINOPSIS = `${DIR}/2026-08-23-idioma-sinopsis.json`;

async function sinopsis() {
  if (!existsSync(F_MUESTRA)) { console.error(`falta ${F_MUESTRA}`); process.exit(1); }
  const m = JSON.parse(readFileSync(F_MUESTRA, "utf8"));
  const filas = [];
  for (let i = 0; i < m.titulos.length; i += 10) {
    const lote = await Promise.all(m.titulos.slice(i, i + 10).map(async (t) => {
      const [a, b] = await Promise.all([
        tmdb(`/${t.tipo}/${t.id}`, { language: "es-ES" }),
        tmdb(`/${t.tipo}/${t.id}`, { language: "es-MX" }),
      ]);
      return {
        ref: `${t.tipo}:${t.id}`,
        es: (a.overview || "").length, mx: (b.overview || "").length,
        tit_es: a.title || a.name, tit_mx: b.title || b.name,
      };
    }));
    filas.push(...lote);
  }
  const resumen = {
    n: filas.length,
    sinopsis_vacia_es_ES: filas.filter((f) => !f.es).length,
    sinopsis_vacia_es_MX: filas.filter((f) => !f.mx).length,
    regresion_tenia_y_pierde: filas.filter((f) => f.es && !f.mx).map((f) => f.ref),
    mejora_no_tenia_y_gana: filas.filter((f) => !f.es && f.mx).map((f) => f.ref),
    largo_promedio_es_ES: Math.round(filas.reduce((a, f) => a + f.es, 0) / filas.length),
    largo_promedio_es_MX: Math.round(filas.reduce((a, f) => a + f.mx, 0) / filas.length),
  };
  writeFileSync(F_SINOPSIS, JSON.stringify({ generado: "2026-08-23", llamadas: requests, resumen, filas }, null, 2));
  console.log(JSON.stringify({ llamadas: requests, ...resumen }, null, 2));
}

// ============================================================================
// estrategias
// ============================================================================
// Compara las estrategias por ENCONTRABILIDAD REAL, no por parecido textual.
// La distancia textual resultó no predecir nada: "La Boca del Diablo" (nombre
// completamente distinto al publicado) sale primer resultado en Prime Video, y
// "Amos del Universo" (el nombre exacto publicado) sale como relacionado.
//
// Tres estados, con el del medio SIN colapsar a "sí": `relacionados` es
// fricción real — la plataforma dice que no encontró el título antes de mostrarlo.
//
// `no_verificado` y `no_probado` NO cuentan como fallo de ninguna estrategia:
// se informan aparte.
const F_VERIF = `${DIR}/2026-08-23-idioma-verificado.json`;
const VARIANTES = ["es_ES", "es_MX", "alt_AR", "original"];

function estrategias() {
  if (!existsSync(F_VERIF)) { console.error(`falta ${F_VERIF}`); process.exit(1); }
  const v = JSON.parse(readFileSync(F_VERIF, "utf8"));

  const vacio = () => ({ directo: 0, relacionados: 0, no: 0, no_probado: 0, no_verificado: 0 });
  const contar = (casos) => {
    const acc = {};
    for (const k of VARIANTES) acc[k] = vacio();
    for (const c of casos) for (const k of VARIANTES) {
      acc[k][c.encontrabilidad?.[k]?.estado ?? "no_probado"]++;
    }
    // La UNION: encuentra si CUALQUIERA de las dos variantes encuentra. Es lo
    // que ve un usuario al que la ficha le ofrece las dos consultas.
    acc["union_mx_original"] = vacio();
    for (const c of casos) {
      const e = c.encontrabilidad ?? {};
      const est = [e.es_MX?.estado, e.original?.estado];
      const cat = est.includes("directo") ? "directo"
        : est.includes("relacionados") ? "relacionados"
        : est.includes("no") ? "no" : "no_probado";
      acc["union_mx_original"][cat]++;
    }
    // "encuentra" = directo + relacionados. "probados" excluye lo no medido.
    for (const k of [...VARIANTES, "union_mx_original"]) {
      const a = acc[k];
      a.probados = a.directo + a.relacionados + a.no;
      a.encuentra = a.directo + a.relacionados;
    }
    return acc;
  };

  const medible = (c) => !c.instrumento_degradado
    && Object.values(c.encontrabilidad).some((e) => ["directo", "relacionados", "no"].includes(e.estado));
  const utiles = v.casos.filter(medible);
  const porMuestra = {};
  for (const c of utiles) (porMuestra[c.muestra ?? "sin-muestra"] ??= []).push(c);
  const degradados = v.casos.filter((c) => c.instrumento_degradado);
  const sinAcceso = v.casos.filter((c) => Object.values(c.encontrabilidad)
    .every((e) => e.estado === "no_verificado" || e.estado === "no_probado"));

  const porPlataforma = {};
  for (const c of utiles) (porPlataforma[c.plataforma] ??= []).push(c);

  console.log(JSON.stringify({
    casos_utiles: utiles.length,
    casos_con_instrumento_degradado: degradados.map((c) => c.ref),
    casos_sin_acceso: sinAcceso.map((c) => `${c.ref} (${c.plataforma})`),
    total: contar(utiles),
    por_muestra: Object.fromEntries(
      Object.entries(porMuestra).map(([k, cs]) => [k, { n: cs.length, ...contar(cs) }])),
    por_plataforma: Object.fromEntries(
      Object.entries(porPlataforma).map(([k, cs]) => [k, { n: cs.length, ...contar(cs) }])),
    detalle: utiles.map((c) => ({
      ref: c.ref, plataforma: c.plataforma,
      ...Object.fromEntries(VARIANTES.map((k) => [k, c.encontrabilidad[k]?.estado ?? "no_probado"])),
    })),
  }, null, 2));
}

// ============================================================================
const cmd = process.argv[2];
const cmds = { instrumento, muestra, medir, sinopsis, informe, estrategias };
// El subcomando se valida ANTES que el token: sin esto, correr el script sin
// argumentos contesta "falta TMDB_READ_TOKEN", que manda a buscar el problema
// al lado equivocado.
if (!cmds[cmd]) { console.error("subcomandos: instrumento | muestra | medir | sinopsis | informe | estrategias"); process.exit(1); }
// `informe` y `estrategias` solo leen JSON del disco: no necesitan token.
if (!TOKEN && cmd !== "informe" && cmd !== "estrategias") { console.error("falta TMDB_READ_TOKEN"); process.exit(1); }
await cmds[cmd]();
