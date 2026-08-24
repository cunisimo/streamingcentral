#!/usr/bin/env node
// Backfill de idioma de `upcoming_content`. Tanda 3 del plan.
//
//   node --env-file=.env.local scripts/backfill-upcoming-idioma.mjs [flags]
//
//   --aplicar            escribe. SIN ESTO NO ESCRIBE NADA (dry-run es el default)
//   --ensayo             trabaja contra la tabla espejo ensayo.upcoming_content
//   --sembrar            (solo con --ensayo) siembra los dos títulos reales de prueba
//   --desde=<archivo>    ROLLBACK: restaura `antes` desde un snapshot
//   --fallar-en=<n>      (solo con --ensayo) inyecta una fila inválida en la
//                        posición n para comprobar que NO queda nada a medias
//   --idioma=es-MX       idioma destino (default es-MX)
//
// ============================================================================
// LAS CINCO REGLAS, y por qué
// ============================================================================
//
// 1. ELEGIBILIDAD POR CAMPO, NO POR FILA. Si el `episode_name` guardado ya no
//    coincide con el es-ES de hoy, ese CAMPO se conserva y se reporta; el
//    `title` y el `overview` de la misma fila igual pasan a es-MX. La regla por
//    fila tiraba 3 campos de idioma perfectamente sanos para proteger 4.
//
// 2. EL EPISODIO SE PIDE POR COORDENADAS EXACTAS
//    (/tv/{id}/season/{n}/episode/{m}), NUNCA `next_episode_to_air`. El sync usa
//    "el próximo" porque escribe en el momento; el backfill corre días después y
//    "el próximo" ya avanzó: escribiría el nombre de OTRO episodio. Sería
//    corrupción de datos disfrazada de arreglo de idioma.
//
// 3. NUNCA SE PISA UN VALOR EXISTENTE CON VACÍO O NULL. Si el es-MX no trae
//    sinopsis y el respaldo tampoco, se conserva lo que había.
//
// 4. NO SE COLA FRESCURA. Un campo solo es elegible si lo guardado es idéntico
//    al es-ES de HOY. Si difiere, la fila cambió por otro motivo (TMDB completó
//    el título de un episodio, por ejemplo) y eso está fuera de alcance.
//
// 5. EL ESTADO POSTERIOR NO SE RECALCULA. El snapshot guarda `antes` Y `después`,
//    y tanto la aplicación como el rollback usan esos valores. Volver a
//    preguntarle a TMDB en el rollback restauraría "lo que TMDB dice hoy", que
//    no es lo mismo que "lo que había".
//
// El fallback usa el MISMO núcleo que la app y que la Edge Function
// (supabase/functions/_shared/idioma-nucleo.ts). Acá no se reimplementa nada.
import { readFileSync, writeFileSync } from "node:fs";
import { filaDePayload, planificarFila } from "../lib/backfill-upcoming.ts";

// --- Flags ------------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const APLICAR = args.aplicar === true;
const ENSAYO = args.ensayo === true;
const SEMBRAR = args.sembrar === true;
const DESDE = typeof args.desde === "string" ? args.desde : null;
const FALLAR_EN = args["fallar-en"] !== undefined ? Number(args["fallar-en"]) : null;
const IDIOMA = typeof args.idioma === "string" ? args.idioma : "es-MX";
const IDIOMA_FALLBACK = "es-ES";

if (FALLAR_EN !== null && !ENSAYO) {
  console.error("--fallar-en SOLO se permite con --ensayo. No se ensaya un fallo contra la tabla real.");
  process.exit(2);
}
if (SEMBRAR && !ENSAYO) {
  console.error("--sembrar SOLO se permite con --ensayo.");
  process.exit(2);
}

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN ?? "";
if (!URL_SB || !ANON || !TMDB_TOKEN) {
  console.error("faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o TMDB_READ_TOKEN");
  process.exit(2);
}
if (APLICAR && !SERVICE) {
  console.error("--aplicar necesita SUPABASE_SERVICE_ROLE_KEY: la RPC solo la puede ejecutar service_role");
  process.exit(2);
}

// --- Clientes ---------------------------------------------------------------
const TMDB = "https://api.themoviedb.org/3";
let llamadasTmdb = 0;
let enVuelo = 0; const cola = [];
const adq = () => (enVuelo < 8 ? (enVuelo++, Promise.resolve()) : new Promise((r) => cola.push(r)));
const lib = () => { const n = cola.shift(); if (n) n(); else enVuelo--; };

async function tmdb(path, language) {
  await adq();
  try {
    llamadasTmdb++;
    const r = await fetch(`${TMDB}${path}?language=${language}`, {
      headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`TMDB ${r.status} en ${path}`);
    return await r.json();
  } finally { lib(); }
}

async function rpc(fn, body, key = SERVICE) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

// --- Lectura del estado actual ---------------------------------------------
const COLS = "tmdb_id,media_type,title,overview,episode_name,season_number,episode_number";

async function leerFilas() {
  if (ENSAYO) {
    // El espejo no tiene endpoint: se lee por función. Pero para planificar
    // hacen falta también las coordenadas del episodio, que `ensayo_leer` no
    // devuelve; se toman de la tabla real, que es de donde salió la copia.
    const espejo = await rpc("ensayo_leer", {}, SERVICE || ANON);
    const reales = await leerTablaReal();
    const coords = new Map(reales.map((f) => [clave(f), f]));
    return espejo.map((e) => ({
      ...e,
      season_number: coords.get(clave(e))?.season_number ?? e.season_number ?? null,
      episode_number: coords.get(clave(e))?.episode_number ?? e.episode_number ?? null,
    }));
  }
  return leerTablaReal();
}

async function leerTablaReal() {
  const r = await fetch(`${URL_SB}/rest/v1/upcoming_content?select=${COLS}&order=media_type,tmdb_id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`lectura: ${r.status} ${await r.text()}`);
  return r.json();
}

const clave = (f) => `${f.media_type}:${f.tmdb_id}`;
const vacio = (s) => !(s ?? "").trim();
const igual = (a, b) => (a ?? "") === (b ?? "");

// --- Planificación ----------------------------------------------------------
// La DECISIÓN vive en lib/backfill-upcoming.ts y es pura: acá solo se hacen los
// pedidos. El test llama a esa misma función con respuestas controladas, así que
// lo que se prueba es lo que corre.
async function planificar(filas) {
  const plan = [];
  await Promise.all(filas.map(async (f) => {
    const esSerie = f.media_type === "tv";
    const ruta = esSerie ? `/tv/${f.tmdb_id}` : `/movie/${f.tmdb_id}`;
    const [mx, es] = await Promise.all([tmdb(ruta, IDIOMA), tmdb(ruta, IDIOMA_FALLBACK)]);

    // El episodio, por COORDENADAS EXACTAS. Ver la regla 2 del encabezado.
    let epMx = null, epEs = null;
    if (esSerie && f.season_number != null && f.episode_number != null) {
      const rutaEp = `${ruta}/season/${f.season_number}/episode/${f.episode_number}`;
      [epMx, epEs] = await Promise.all([tmdb(rutaEp, IDIOMA), tmdb(rutaEp, IDIOMA_FALLBACK)]);
    }
    plan.push(planificarFila({ fila: f, mx, es, epMx, epEs }));
  }));
  plan.sort((a, b) => (a.clave < b.clave ? -1 : 1));
  return plan;
}

// --- Snapshot ---------------------------------------------------------------
function rutaSnapshot() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  return `docs/medidas/snapshot-upcoming-${hoy}-${IDIOMA}${ENSAYO ? "-ensayo" : ""}.json`;
}

// Se escribe, se RELEE DEL DISCO y se compara. Escribirlo no alcanza: lo que
// tiene que estar garantizado es que se puede LEER para restaurar.
function escribirSnapshot(plan) {
  const ruta = rutaSnapshot();
  const doc = {
    generado: new Date().toISOString(),
    idioma_destino: IDIOMA,
    tabla: ENSAYO ? "ensayo.upcoming_content" : "public.upcoming_content",
    filas: plan.length,
    filas_que_cambian: plan.filter((p) => p.cambia.length).length,
    campos_que_cambian: plan.reduce((a, p) => a + p.cambia.length, 0),
    entradas: plan.map((p) => ({
      clave: p.clave, tmdb_id: p.tmdb_id, media_type: p.media_type,
      antes: p.antes, despues: p.despues, omitidos: p.omitidos, cambia: p.cambia,
    })),
  };
  writeFileSync(ruta, JSON.stringify(doc, null, 1));
  const releido = JSON.parse(readFileSync(ruta, "utf8"));
  if (JSON.stringify(releido) !== JSON.stringify(doc)) {
    throw new Error(`el snapshot ${ruta} no se releyó igual que como se escribió: NO se escribe en la base`);
  }
  return { ruta, doc };
}

// --- Escritura --------------------------------------------------------------
// El payload describe la fila COMPLETA: en un campo que no cambia, `nuevo_` es
// igual a `esperado_`. La RPC compara los tres `esperado_` con el estado actual.
const payload = (entradas, direccion) => entradas.map((e) => filaDePayload(e, direccion));

async function escribir(entradas, direccion) {
  let filas = payload(entradas, direccion);
  if (FALLAR_EN !== null) {
    if (FALLAR_EN < 0 || FALLAR_EN >= filas.length) {
      throw new Error(`--fallar-en=${FALLAR_EN} fuera de rango (0..${filas.length - 1})`);
    }
    // `title` es NOT NULL en la tabla: esto revienta la sentencia entera. Es la
    // prueba de que no queda nada a medias, y por eso el espejo TIENE que
    // conservar el NOT NULL (ver supabase/ensayo/upcoming-idioma.sql).
    filas = filas.map((f, i) => (i === FALLAR_EN ? { ...f, nuevo_title: null } : f));
    console.log(`  [--fallar-en] fila ${FALLAR_EN} (${filas[FALLAR_EN].tmdb_id}) con title=null a propósito`);
  }
  return rpc("backfill_upcoming_idioma", {
    p_filas: filas, p_esperadas: filas.length, p_ensayo: ENSAYO,
  });
}

// --- Verificación -----------------------------------------------------------
async function verificar(entradas, esperado) {
  const actual = new Map((await leerFilas()).map((f) => [clave(f), f]));
  const malas = [];
  for (const e of entradas) {
    const f = actual.get(e.clave);
    if (!f) { malas.push(`${e.clave}: desapareció`); continue; }
    for (const c of ["title", "overview", "episode_name"]) {
      if (!igual(f[c], e[esperado][c])) {
        malas.push(`${e.clave}.${c}: ${JSON.stringify(f[c])} != ${JSON.stringify(e[esperado][c])}`);
      }
    }
  }
  return malas;
}

// --- Siembra del ensayo -----------------------------------------------------
// Dos títulos REALES de TMDB que no están en la tabla: una película (el camino
// que producción no puede ejercitar, porque hoy no hay ni una) y una serie con
// coordenadas de episodio válidas. Se siembran con los valores es-ES de HOY,
// así el espejo arranca coherente y el backfill tiene algo real que traducir.
const SINTETICOS = [
  { tmdb_id: 278, media_type: "movie", season_number: null, episode_number: null },
  { tmdb_id: 1399, media_type: "tv", season_number: 1, episode_number: 1 },
];

async function sembrar() {
  const filas = [];
  for (const s of SINTETICOS) {
    const ruta = s.media_type === "tv" ? `/tv/${s.tmdb_id}` : `/movie/${s.tmdb_id}`;
    const es = await tmdb(ruta, IDIOMA_FALLBACK);
    if (!es) throw new Error(`el título sintético ${clave(s)} no existe en TMDB`);
    let epNombre = null;
    if (s.media_type === "tv") {
      const ep = await tmdb(`${ruta}/season/${s.season_number}/episode/${s.episode_number}`, IDIOMA_FALLBACK);
      epNombre = ep?.name ?? null;
    }
    filas.push({
      tmdb_id: s.tmdb_id, media_type: s.media_type,
      title: es.title ?? es.name, original_title: es.original_title ?? es.original_name ?? null,
      overview: es.overview ?? null,
      release_date: es.release_date || es.first_air_date || "2030-01-01",
      season_number: s.season_number, episode_number: s.episode_number, episode_name: epNombre,
    });
  }
  const n = await rpc("ensayo_sembrar", { p_filas: filas });
  console.log(`sembrados ${n} títulos sintéticos:`, filas.map((f) => `${f.media_type}:${f.tmdb_id} ${JSON.stringify(f.title)}`).join("  "));
}

// --- Main -------------------------------------------------------------------
async function main() {
  console.log(`tabla:   ${ENSAYO ? "ensayo.upcoming_content (ESPEJO)" : "public.upcoming_content (REAL)"}`);
  console.log(`idioma:  ${IDIOMA}  (respaldo ${IDIOMA_FALLBACK})`);
  console.log(`modo:    ${DESDE ? "ROLLBACK desde " + DESDE : APLICAR ? "APLICAR" : "DRY-RUN"}\n`);

  if (SEMBRAR) { await sembrar(); console.log(); }

  // ----- Rollback -----
  if (DESDE) {
    const doc = JSON.parse(readFileSync(DESDE, "utf8"));
    const entradas = doc.entradas.filter((e) => e.cambia.length);
    console.log(`snapshot: ${doc.filas} filas, ${entradas.length} para revertir`);
    if (!APLICAR) {
      console.log("DRY-RUN: no se revierte nada. Agregar --aplicar.");
      return 0;
    }
    const n = await escribir(entradas, "revertir");
    console.log(`revertidas ${n} filas`);
    const malas = await verificar(entradas, "antes");
    if (malas.length) { console.error("LA REVERSIÓN NO COINCIDE:\n  " + malas.join("\n  ")); return 1; }
    console.log(`verificado: las ${entradas.length} filas coinciden byte a byte con \`antes\``);
    return 0;
  }

  // ----- Planificación -----
  const filas = await leerFilas();
  console.log(`filas leídas: ${filas.length}`);
  const plan = await planificar(filas);
  const cambian = plan.filter((p) => p.cambia.length);
  const porCampo = (c) => plan.filter((p) => p.cambia.includes(c)).length;
  const omitidos = (m) => plan.reduce((a, p) => a + Object.values(p.omitidos).filter((x) => x === m).length, 0);

  console.log(`\ncampo          cambia   omitido-frescura   omitido-404   omitido-vacio`);
  for (const c of ["title", "overview", "episode_name"]) {
    const om = (m) => plan.filter((p) => p.omitidos[c] === m).length;
    console.log(c.padEnd(14), String(porCampo(c)).padStart(6), String(om("frescura")).padStart(18),
      String(om("episodio-404")).padStart(13), String(om("vacio")).padStart(15));
  }
  console.log(`\nfilas que cambian: ${cambian.length} de ${plan.length}`);
  console.log(`campos que cambian: ${plan.reduce((a, p) => a + p.cambia.length, 0)}`);
  console.log(`omitidos: ${omitidos("frescura")} por frescura, ${omitidos("episodio-404")} por 404, ${omitidos("vacio")} por vacío`);

  // El fallback se informa APARTE, y no como parte del diff: cuando repara bien,
  // el valor queda IGUAL al guardado y desaparece del diff. Contarlo solo por el
  // diff haría parecer que nunca corrió.
  const fbT = plan.filter((p) => p.fallback.tituloOSinopsis);
  const fbE = plan.filter((p) => p.fallback.episodio);
  console.log(`fallback: actuó en ${fbT.length} título/sinopsis y ${fbE.length} episodio(s)` +
    (fbT.length ? ` → ${fbT.map((p) => p.clave).join(" ")}` : ""));
  console.log(`llamadas a TMDB: ${llamadasTmdb}`);

  for (const p of plan) for (const [c, m] of Object.entries(p.omitidos)) {
    console.log(`  omitido ${p.clave}.${c} (${m}): se conserva ${JSON.stringify(p.antes[c])}`);
  }
  console.log("\nprimeros cambios:");
  for (const p of cambian.slice(0, 8)) {
    for (const c of p.cambia) {
      console.log(`  ${p.clave}.${c}: ${JSON.stringify((p.antes[c] ?? "").slice(0, 45))} -> ${JSON.stringify((p.despues[c] ?? "").slice(0, 45))}`);
    }
  }

  if (!APLICAR) {
    console.log(`\nDRY-RUN: no se escribió nada. Agregar --aplicar.`);
    const { ruta } = escribirSnapshot(plan);
    console.log(`snapshot de referencia escrito y releído: ${ruta}`);
    return 0;
  }

  // ----- Aplicación -----
  const { ruta } = escribirSnapshot(plan);
  console.log(`\nsnapshot escrito y releído OK: ${ruta}`);
  const n = await escribir(cambian, "aplicar");
  console.log(`actualizadas ${n} filas`);
  const malas = await verificar(cambian, "despues");
  if (malas.length) { console.error("LA VERIFICACIÓN FALLÓ:\n  " + malas.join("\n  ")); return 1; }
  console.log(`verificado: las ${cambian.length} filas coinciden byte a byte con \`después\``);
  return 0;
}

try {
  process.exit(await main());
} catch (e) {
  console.error("\nABORTADO:", e.message);
  console.error("Si el error viene de la RPC, la transacción se deshizo entera: no quedó nada a medias.");
  process.exit(1);
}
