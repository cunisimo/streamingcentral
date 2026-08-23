#!/usr/bin/env node
// Coste del fallback es-MX → es-ES atravesando un Home FRÍO completo.
//
//   node --env-file=.env.local scripts/medir-fallback-idioma.mjs [n,d,m]
//
// La pregunta que contesta: si el título viaja en es-MX, ¿cuántos títulos del
// Home quedan rotos (sin sinopsis, o con el título en el idioma original) y
// cuánto cuesta repararlos?
//
// Por qué hace falta medirlo y no razonarlo: la reparación por título parece
// más barata que pedir el discover dos veces, pero UN discover repara 20
// títulos de una. Cuál gana depende de la tasa de rotos, que es justo lo que
// esto mide.
//
// Replica el perfil de pedidos de un Home frío (lib/home.ts): 6 rieles de
// género × FETCH_BUFFER páginas × plataforma, más el hero. NO usa Redis ni
// Supabase — pega directo contra TMDB, así que no contamina ningún cache.
import { writeFileSync } from "node:fs";

const TOKEN = process.env.TMDB_READ_TOKEN;
if (!TOKEN) { console.error("falta TMDB_READ_TOKEN"); process.exit(1); }

const BASE = "https://api.themoviedb.org/3";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, accept: "application/json" };
const SALIDA = "docs/medidas/2026-08-23-idioma-fallback.json";

const MAX = 16;
let enVuelo = 0; const cola = [];
const adq = () => (enVuelo < MAX ? (enVuelo++, Promise.resolve()) : new Promise((r) => cola.push(r)));
const liberar = () => { const n = cola.shift(); if (n) n(); else enVuelo--; };

const status = new Map();
let requests = 0;

async function tmdb(path, params = {}) {
  const q = new URLSearchParams({ watch_region: "AR", ...params });
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

// --- Copia del perfil del Home ----------------------------------------------
// lib/providers-ar.ts, components/data.ts (HOME_GENRES, defaultTypeFor) y
// lib/categories.ts. Va a mano porque esto es .mjs; si cambian allá, acá también.
const IDS = { n: [8], d: [337], m: [1899, 384], at: [350, 2243], p: [119, 9], cr: [283, 1968] };
const FETCH_BUFFER = 3;                       // lib/home.ts:59
const HOME_GENRES = ["accion", "scifi", "terror", "drama", "comedia", "documental"];
const defaultTypeFor = (g) => HOME_GENRES.indexOf(g) % 2 === 0 ? "movie" : "tv";
const GENERO = {
  accion:     { movie: { with_genres: "28" },  tv: { with_genres: "10759" } },
  scifi:      { movie: { with_genres: "878" }, tv: { with_genres: "10765" } },
  terror:     { movie: { with_genres: "27" },  tv: { with_keywords: "315058" } },
  drama:      { movie: { with_genres: "18" },  tv: { with_genres: "18" } },
  comedia:    { movie: { with_genres: "35" },  tv: { with_genres: "35" } },
  documental: { movie: { with_genres: "99" },  tv: { with_genres: "99" } },
};

async function discover(tipo, lang, extra) {
  const r = await tmdb(`/discover/${tipo}`, {
    language: lang,
    with_watch_monetization_types: "flatrate",
    include_adult: "false",
    sort_by: "popularity.desc",
    ...extra,
  });
  return r.results ?? [];
}

// --- Detección de "roto", sobre el objeto que YA volvió ----------------------
// Ninguna de las tres cuesta una llamada: son campos del mismo discover.
const NO_LATINO = /[^\u0000-\u024F\u2000-\u206F\u20A0-\u20BF\s]/;

function diagnostico(mx, es) {
  const tMx = mx.title ?? mx.name ?? "";
  const tEs = es?.title ?? es?.name ?? "";
  const orig = mx.original_title ?? mx.original_name ?? "";
  const lang = mx.original_language ?? "";
  return {
    // 1. Título en alfabeto no latino: el caso 런닝맨. Detectable sin comparar.
    no_latino: NO_LATINO.test(tMx),
    // 2. Sin sinopsis en es-MX. Detectable sin comparar.
    sin_sinopsis: !(mx.overview ?? "").trim(),
    // 3. El título es el ORIGINAL y el idioma original no es español ni inglés:
    //    señal fuerte de que no hay traducción MX. Detectable sin comparar.
    cayo_al_original: tMx === orig && lang !== "es" && lang !== "en" && !!orig,
    // --- Lo de abajo NO es detectable sin la segunda llamada. Sirve para saber
    //     si las tres señales alcanzan, o si se escapan casos.
    //
    //     OJO: la primera versión de esto era TAUTOLÓGICA — preguntaba por la
    //     misma condición que ya marca el título como roto, así que daba 0
    //     escapes por construcción y no medía nada. El escape REAL es el
    //     "pasaje al inglés": es-MX devuelve el original en inglés y es-ES tenía
    //     una traducción al español. La señal 3 NO lo marca A PROPÓSITO (en AR
    //     "Game of Thrones" y "Zootopia 2" son los nombres correctos), pero hay
    //     que contarlos para saber cuántos son y revisarlos a mano.
    pasaje_al_ingles: tMx === orig && lang === "en" && !!tEs && tEs !== tMx,
    titulo_mx: tMx, titulo_es: tEs, original: orig, idioma: lang,
  };
}

async function main() {
  const plataformas = (process.argv[2] || "n,d,m").split(",");
  const paginas = [];   // { superficie, tipo, extra, pagina }

  // 6 rieles de género: FETCH_BUFFER páginas por plataforma. Es el grueso.
  for (const g of HOME_GENRES) {
    const tipo = defaultTypeFor(g);
    for (const p of plataformas) {
      for (let i = 1; i <= FETCH_BUFFER; i++) {
        paginas.push({ superficie: `riel-${g}`, tipo, pagina: i,
          extra: { ...GENERO[g][tipo], with_watch_providers: IDS[p].join("|") } });
      }
    }
  }
  // Hero: 3 páginas por plataforma y por tipo (lib/enrich.ts, candidatosDePools).
  for (const tipo of ["movie", "tv"]) {
    for (const p of plataformas) {
      for (let i = 1; i <= 3; i++) {
        paginas.push({ superficie: "hero", tipo, pagina: i,
          extra: { with_watch_providers: IDS[p].join("|") } });
      }
    }
  }

  console.error(`páginas de discover en un Home frío (${plataformas.join(",")}): ${paginas.length}`);
  console.error(`llamadas si se pide en UN idioma: ${paginas.length}`);
  console.error(`llamadas si se pide en DOS idiomas: ${paginas.length * 2}\n`);

  const porTitulo = new Map();     // id → diagnóstico (dedup: el Home dedupea)
  const porPagina = [];
  const LOTE = 6;
  for (let i = 0; i < paginas.length; i += LOTE) {
    await Promise.all(paginas.slice(i, i + LOTE).map(async (pg) => {
      const [mx, es] = await Promise.all([
        discover(pg.tipo, "es-MX", { ...pg.extra, page: String(pg.pagina) }),
        discover(pg.tipo, "es-ES", { ...pg.extra, page: String(pg.pagina) }),
      ]);
      const esPorId = new Map(es.map((x) => [x.id, x]));
      let rotosEnPagina = 0;
      for (const t of mx) {
        const d = diagnostico(t, esPorId.get(t.id));
        const roto = d.no_latino || d.sin_sinopsis || d.cayo_al_original;
        if (roto) rotosEnPagina++;
        if (!porTitulo.has(t.id)) porTitulo.set(t.id, { id: t.id, tipo: pg.tipo, roto, ...d });
      }
      porPagina.push({ superficie: pg.superficie, tipo: pg.tipo, pagina: pg.pagina,
        titulos: mx.length, rotos: rotosEnPagina });
    }));
    console.error(`  ${porPagina.length}/${paginas.length} páginas`);
  }

  const titulos = [...porTitulo.values()];
  const rotos = titulos.filter((t) => t.roto);
  const paginasConAlgunRoto = porPagina.filter((p) => p.rotos > 0).length;

  // Escapes: casos donde es-ES repara algo que las tres señales NO detectan.
  // Escapes reales: el pasaje al inglés, que las tres señales dejan pasar aposta.
  const pasajes = titulos.filter((t) => !t.roto && t.pasaje_al_ingles);

  const N = paginas.length;
  const resumen = {
    plataformas: plataformas.join(","),
    paginas_de_discover_en_un_home_frio: N,
    titulos_unicos_tocados: titulos.length,
    titulos_rotos: rotos.length,
    titulos_rotos_pct: Math.round(rotos.length / titulos.length * 1000) / 10,
    desglose_rotos: {
      titulo_no_latino: rotos.filter((t) => t.no_latino).length,
      sin_sinopsis: rotos.filter((t) => t.sin_sinopsis).length,
      cayo_al_original: rotos.filter((t) => t.cayo_al_original).length,
    },
    paginas_con_al_menos_un_roto: paginasConAlgunRoto,
    paginas_con_al_menos_un_roto_pct: Math.round(paginasConAlgunRoto / N * 1000) / 10,
    pasaje_al_ingles_no_reparado: pasajes.length,
    pasaje_al_ingles_pct: Math.round(pasajes.length / titulos.length * 1000) / 10,
    muestra_pasaje_al_ingles: pasajes.slice(0, 15).map((t) => `${t.titulo_es}  ->  ${t.titulo_mx}`),
    coste: {
      "A_doble_discover_siempre":       { llamadas_extra: N,   nota: "1 extra por página, repara 20 títulos de una" },
      "B_reparar_titulo_por_titulo":    { llamadas_extra: rotos.length, nota: "1 extra por título roto" },
      "C_doble_discover_solo_si_hay_roto": { llamadas_extra: paginasConAlgunRoto, nota: "requiere pedir es-MX primero: es A cuando casi toda página tiene un roto" },
    },
    llamadas_reales_de_esta_medicion: requests,
    status: Object.fromEntries(status),
  };

  writeFileSync(SALIDA, JSON.stringify({ generado: "2026-08-23", resumen, por_pagina: porPagina, rotos, pasajes }, null, 2));
  console.log(JSON.stringify(resumen, null, 2));
  console.log(`\n${SALIDA} escrito.`);
}

await main();
