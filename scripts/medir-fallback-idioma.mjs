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
//
// DOS REGLAS DE MEDICIÓN, las dos aprendidas rompiéndolas:
//
//   1. La identidad de un título es `tipo:id`, nunca `id`. TMDB reutiliza los
//      números entre tipos.
//   2. El resultado no puede depender de qué promesa resuelve antes. Las
//      observaciones se acumulan y se reducen con una regla explícita al final,
//      en vez de "el primero que llega gana" sobre seis páginas concurrentes.
//
// Corriéndolo dos veces seguidas tiene que dar el MISMO resumen. Si no, alguna
// de las dos reglas se rompió otra vez.
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

  // --- Identidad: `tipo:id`, NUNCA `id` -------------------------------------
  // TMDB reutiliza los números entre tipos: la película 1399 y la serie 1399
  // existen las dos. Deduplicar por `id` pelado hacía desaparecer una de las
  // dos de las estadísticas, en silencio. Es el mismo motivo por el que
  // `lib/idioma.ts` tiene `claveMixta`.
  const ref = (tipo, id) => `${tipo}:${id}`;

  // --- Orden: se acumulan TODAS las observaciones y se reducen al final -----
  // La versión anterior hacía "el primero que llega gana" sobre 6 páginas
  // concurrentes, y eso NO es inocuo: `titulo_es` —y con él
  // `pasaje_al_ingles`— dependen de si el es-ES de esa página trajo al mismo
  // título, y el reparto por página no coincide entre los dos idiomas. O sea
  // que el número publicado dependía de qué promesa resolvía antes.
  //
  // Las tres señales de `roto` NO dependen del respaldo (miran solo el objeto
  // es-MX), así que el conteo de rotos siempre fue estable; lo que se movía era
  // el de pasajes al inglés.
  const observaciones = new Map();  // "tipo:id" → [observación, …]
  const porPagina = [];
  const LOTE = 6;
  for (let i = 0; i < paginas.length; i += LOTE) {
    await Promise.all(paginas.slice(i, i + LOTE).map(async (pg) => {
      const [mx, es] = await Promise.all([
        discover(pg.tipo, "es-MX", { ...pg.extra, page: String(pg.pagina) }),
        discover(pg.tipo, "es-ES", { ...pg.extra, page: String(pg.pagina) }),
      ]);
      // Dentro de una página el tipo es uno solo, así que acá el id alcanza.
      const esPorId = new Map(es.map((x) => [x.id, x]));
      let rotosEnPagina = 0;
      for (const t of mx) {
        const d = diagnostico(t, esPorId.get(t.id));
        const roto = d.no_latino || d.sin_sinopsis || d.cayo_al_original;
        if (roto) rotosEnPagina++;
        const k = ref(pg.tipo, t.id);
        if (!observaciones.has(k)) observaciones.set(k, []);
        observaciones.get(k).push({
          ref: k, id: t.id, tipo: pg.tipo, roto, ...d,
          superficie: pg.superficie, pagina: pg.pagina,
        });
      }
      porPagina.push({ superficie: pg.superficie, tipo: pg.tipo, pagina: pg.pagina,
        titulos: mx.length, rotos: rotosEnPagina });
    }));
    console.error(`  ${porPagina.length}/${paginas.length} páginas`);
  }

  // Reducción DETERMINÍSTICA: gana la observación que SÍ vio el respaldo —es la
  // que tiene más información— y entre esas, la de la superficie y página más
  // chicas. No queda ningún empate que resuelva el orden de llegada.
  const desacuerdos = [];
  const titulos = [...observaciones.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, obs]) => {
      if (new Set(obs.map((o) => o.roto)).size > 1) {
        desacuerdos.push({ ref: k, campo: "roto", valores: obs.map((o) => o.roto) });
      }
      const orden = [...obs].sort((x, y) =>
        (y.titulo_es ? 1 : 0) - (x.titulo_es ? 1 : 0)
        || (x.superficie < y.superficie ? -1 : x.superficie > y.superficie ? 1 : 0)
        || x.pagina - y.pagina);
      const { superficie, pagina, ...limpio } = orden[0];
      return { ...limpio, visto_en: obs.length };
    });
  const rotos = titulos.filter((t) => t.roto);
  const paginasConAlgunRoto = porPagina.filter((p) => p.rotos > 0).length;

  // Escapes: casos donde es-ES repara algo que las tres señales NO detectan.
  // Escapes reales: el pasaje al inglés, que las tres señales dejan pasar aposta.
  const pasajes = titulos.filter((t) => !t.roto && t.pasaje_al_ingles);

  // Colisiones reales de id entre tipos, en ESTA muestra.
  const tiposPorId = new Map();
  for (const t of titulos) {
    if (!tiposPorId.has(t.id)) tiposPorId.set(t.id, new Set());
    tiposPorId.get(t.id).add(t.tipo);
  }
  const idsCompartidos = [...tiposPorId.values()].filter((s) => s.size > 1).length;

  const N = paginas.length;
  const resumen = {
    plataformas: plataformas.join(","),
    paginas_de_discover_en_un_home_frio: N,
    // La unidad es `tipo:id`. Con dedup por `id` pelado este número salía de
    // menos: dos títulos de distinto tipo con el mismo número contaban como uno.
    titulos_unicos_tocados: titulos.length,
    // Si alguna vez sale distinto de vacío, dos observaciones del MISMO título
    // se contradicen y el número de rotos dejó de ser una propiedad del título.
    desacuerdos_entre_observaciones: desacuerdos,
    // Cuántos números de id aparecen como película Y como serie. Es lo que el
    // dedup por `id` pelado fusionaba en uno, y por eso está publicado: sin este
    // número, "cambié la clave y subió el total" no se distingue de la deriva
    // del catálogo de TMDB entre dos corridas.
    ids_compartidos_entre_tipos: idsCompartidos,
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
    muestra_pasaje_al_ingles: pasajes.slice(0, 15).map((t) => `${t.ref}  ${t.titulo_es}  ->  ${t.titulo_mx}`),
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
