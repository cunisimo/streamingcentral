#!/usr/bin/env node
// Backfill de idioma de `upcoming_content`. Tanda 3 del plan.
//
//   node --env-file=.env.local scripts/backfill-upcoming-idioma.mjs [flags]
//
//   (sin flags)              DRY-RUN: planifica y ESCRIBE UN SNAPSHOT NUEVO
//   --aplicar --desde-plan=<f>   aplica EXACTAMENTE ese snapshot aprobado
//   --aplicar --desde=<f>        ROLLBACK: restaura `antes` desde ese snapshot
//   --ensayo                 trabaja contra la tabla espejo ensayo.upcoming_content
//   --sembrar                (solo con --ensayo) siembra los dos títulos reales
//   --fallar-en=<n>          (solo con --ensayo) inyecta una fila inválida en la
//                            posición n para comprobar que no queda nada a medias
//   --idioma=es-MX           idioma destino (default es-MX)
//
// APLICAR NO CONSULTA TMDB. Se aplica el plan que se aprobó y nada más: si
// `--aplicar` volviera a planificar, el catálogo puede haberse movido entre la
// revisión y la ejecución y se aplicaría un plan distinto del revisado. El
// snapshot es el contrato, y este script no lo puede reescribir.
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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  filaDePayload, planificarFila, validarSnapshot,
} from "../lib/backfill-upcoming.ts";

// --- Flags ------------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const APLICAR = args.aplicar === true;
const ENSAYO = args.ensayo === true;
const SEMBRAR = args.sembrar === true;
const DESDE = typeof args.desde === "string" ? args.desde : null;
const DESDE_PLAN = typeof args["desde-plan"] === "string" ? args["desde-plan"] : null;
const FALLAR_EN = args["fallar-en"] !== undefined ? Number(args["fallar-en"]) : null;
const IDIOMA = typeof args.idioma === "string" ? args.idioma : "es-MX";
const IDIOMA_FALLBACK = "es-ES";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN ?? "";

// Los guards de argumentos devuelven el motivo en vez de llamar a
// `process.exit()`. Ver la nota del final del archivo: en Windows, salir con
// escrituras a stdout en vuelo tumba a libuv y el proceso termina con 127 en vez
// de con el codigo pedido.
function motivoDeRechazo() {
  if (FALLAR_EN !== null && !ENSAYO) {
    return "--fallar-en SOLO se permite con --ensayo. No se ensaya un fallo contra la tabla real.";
  }
  if (SEMBRAR && !ENSAYO) return "--sembrar SOLO se permite con --ensayo.";
  if (DESDE && DESDE_PLAN) {
    return "--desde (rollback) y --desde-plan (aplicación) son excluyentes.";
  }
  if (APLICAR && !DESDE && !DESDE_PLAN) {
    return "--aplicar exige --desde-plan=<snapshot aprobado> (o --desde=<snapshot> para revertir).\n"
      + "Se aplica el plan revisado, no uno recalculado en el momento.";
  }
  if (!URL_SB || !ANON || !TMDB_TOKEN) {
    return "faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o TMDB_READ_TOKEN";
  }
  if (APLICAR && !SERVICE) {
    return "--aplicar necesita SUPABASE_SERVICE_ROLE_KEY: la RPC solo la puede ejecutar service_role";
  }
  return null;
}

// --- Clientes ---------------------------------------------------------------
const TMDB = "https://api.themoviedb.org/3";
let llamadasTmdb = 0;
// Cada ruta pedida, con su idioma. Es lo que permite DEMOSTRAR que el episodio
// se pidio por coordenadas exactas y no inferirlo del resultado.
const rutasPedidas = new Set();
let enVuelo = 0; const cola = [];
const adq = () => (enVuelo < 8 ? (enVuelo++, Promise.resolve()) : new Promise((r) => cola.push(r)));
const lib = () => { const n = cola.shift(); if (n) n(); else enVuelo--; };

async function tmdb(path, language) {
  await adq();
  try {
    llamadasTmdb++;
    rutasPedidas.add(`${path}?language=${language}`);
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
  // El espejo no tiene endpoint (el esquema `ensayo` no está expuesto): se lee
  // por función, y esa función devuelve las COORDENADAS del episodio. Antes se
  // completaban cruzando con la tabla real, y eso dejaba los títulos sintéticos
  // —que por definición no están en la tabla real— con `season_number: null`:
  // el ensayo terminaba probando el camino del 404 en vez del episodio exacto.
  if (ENSAYO) return rpc("ensayo_leer", {}, SERVICE || ANON);
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

// DOS igualdades distintas, y mezclarlas fue un bug real.
//
// La igualdad SEMÁNTICA —null y "" son lo mismo— vive en el planificador
// (lib/backfill-upcoming.ts) y sirve para DECIDIR si vale la pena escribir un
// campo: pasar de null a "" no es un cambio que justifique un UPDATE.
//
// Acá solo se usa la EXACTA, porque acá se VERIFICA. Si la verificación usara la
// semántica, escribir "" donde el snapshot decía null pasaría como correcto y
// "byte a byte" sería una frase en vez de una comprobación.
const identico = (a, b) => a === b;

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
// Fecha Y HORA en el nombre, y nunca se pisa uno existente. Un snapshot es el
// contrato de una aplicación concreta: si dos corridas comparten archivo, el que
// se revisó deja de existir y no queda cómo revertir.
function rutaSnapshot() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const hora = ahora.toLocaleTimeString("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires", hour12: false,
  }).replace(/:/g, "");
  return `docs/medidas/snapshot-upcoming-${fecha}T${hora}-${IDIOMA}${ENSAYO ? "-ensayo" : ""}.json`;
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
  if (existsSync(ruta)) {
    throw new Error(`el snapshot ${ruta} ya existe: no se sobrescribe (sería tirar el plan que alguien aprobó)`);
  }
  writeFileSync(ruta, JSON.stringify(doc, null, 1));
  const releido = JSON.parse(readFileSync(ruta, "utf8"));
  if (JSON.stringify(releido) !== JSON.stringify(doc)) {
    throw new Error(`el snapshot ${ruta} no se releyó igual que como se escribió: NO se escribe en la base`);
  }
  return { ruta, doc };
}

// --- Validación de un snapshot ----------------------------------------------
// Un snapshot es un archivo de disco que alguien pudo editar, mover o generar
// contra otra tabla. Antes de que su contenido llegue a la RPC hay que
// comprobar que es lo que dice ser. La validación vive en
// lib/backfill-upcoming.ts para poder probarla; acá solo se carga el archivo.
const TABLA_DESTINO = () => (ENSAYO ? "ensayo.upcoming_content" : "public.upcoming_content");

function cargarSnapshot(ruta) {
  const doc = JSON.parse(readFileSync(ruta, "utf8"));
  const errores = validarSnapshot(doc, { tabla: TABLA_DESTINO(), idioma: IDIOMA });
  if (errores.length) {
    throw new Error(`el snapshot ${ruta} no es válido para este destino:\n  - ${errores.join("\n  - ")}`);
  }
  return doc;
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
// Verificación EXACTA: `===`, no equivalencia. null y "" son distintos acá.
async function verificar(entradas, esperado) {
  const actual = new Map((await leerFilas()).map((f) => [clave(f), f]));
  const malas = [];
  for (const e of entradas) {
    const f = actual.get(e.clave);
    if (!f) { malas.push(`${e.clave}: desapareció`); continue; }
    for (const c of ["title", "overview", "episode_name"]) {
      const enBase = f[c] ?? null;          // PostgREST omite las columnas null
      const enPlan = e[esperado][c] ?? null;
      if (!identico(enBase, enPlan)) {
        malas.push(`${e.clave}.${c}: base=${JSON.stringify(enBase)} plan=${JSON.stringify(enPlan)}`);
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
  const rechazo = motivoDeRechazo();
  if (rechazo) { console.error(rechazo); return 2; }

  console.log(`tabla:   ${ENSAYO ? "ensayo.upcoming_content (ESPEJO)" : "public.upcoming_content (REAL)"}`);
  console.log(`idioma:  ${IDIOMA}  (respaldo ${IDIOMA_FALLBACK})`);
  const modo = DESDE ? "ROLLBACK desde " + DESDE
    : DESDE_PLAN ? "APLICAR el plan " + DESDE_PLAN
    : "DRY-RUN";
  console.log(`modo:    ${modo}\n`);

  if (SEMBRAR) { await sembrar(); console.log(); }

  // ----- Rollback: `después` esperado, `antes` escrito -----
  if (DESDE) {
    const doc = cargarSnapshot(DESDE);
    const entradas = doc.entradas.filter((e) => e.cambia.length);
    console.log(`snapshot validado: ${doc.filas} filas, ${entradas.length} para revertir`);
    if (!APLICAR) {
      console.log("DRY-RUN: no se revierte nada. Agregar --aplicar.");
      return 0;
    }
    const n = await escribir(entradas, "revertir");
    console.log(`revertidas ${n} filas`);
    const malas = await verificar(entradas, "antes");
    if (malas.length) { console.error("LA REVERSIÓN NO COINCIDE:\n  " + malas.join("\n  ")); return 1; }
    console.log(`verificado (===): las ${entradas.length} filas coinciden exactamente con \`antes\``);
    return 0;
  }

  // ----- Aplicación: SOLO desde un plan aprobado, sin tocar TMDB -----
  if (DESDE_PLAN) {
    const doc = cargarSnapshot(DESDE_PLAN);
    const entradas = doc.entradas.filter((e) => e.cambia.length);
    console.log(`snapshot validado: ${doc.filas} filas, ${entradas.length} con cambios, ` +
      `${doc.campos_que_cambian} campos`);
    console.log("no se consulta TMDB: se aplica exactamente lo que dice el archivo.");
    if (!APLICAR) {
      console.log("DRY-RUN: no se aplica nada. Agregar --aplicar.");
      return 0;
    }
    const n = await escribir(entradas, "aplicar");
    console.log(`actualizadas ${n} filas`);
    const malas = await verificar(entradas, "despues");
    if (malas.length) { console.error("LA VERIFICACIÓN FALLÓ:\n  " + malas.join("\n  ")); return 1; }
    console.log(`verificado (===): las ${entradas.length} filas coinciden exactamente con \`después\``);
    return 0;
  }

  // ----- Planificación -----
  const filas = await leerFilas();
  console.log(`filas leídas: ${filas.length}`);
  const plan = await planificar(filas);
  const cambian = plan.filter((p) => p.cambia.length);
  const porCampo = (c) => plan.filter((p) => p.cambia.includes(c)).length;
  const omitidos = (m) => plan.reduce((a, p) => a + Object.values(p.omitidos).filter((x) => x === m).length, 0);

  console.log(`\ncampo          cambia   ya-en-es-MX   frescura   404   vacio`);
  for (const c of ["title", "overview", "episode_name"]) {
    const om = (m) => plan.filter((p) => p.omitidos[c] === m).length;
    console.log(c.padEnd(14), String(porCampo(c)).padStart(6), String(om("ya-en-destino")).padStart(12),
      String(om("frescura")).padStart(10), String(om("episodio-404")).padStart(5),
      String(om("vacio")).padStart(7));
  }
  console.log(`\nfilas que cambian: ${cambian.length} de ${plan.length}`);
  console.log(`campos que cambian: ${plan.reduce((a, p) => a + p.cambia.length, 0)}`);
  console.log(`omitidos: ${omitidos("ya-en-destino")} ya en es-MX (nada que hacer), ` +
    `${omitidos("frescura")} por frescura, ${omitidos("episodio-404")} por 404, ` +
    `${omitidos("vacio")} por vacío`);

  // El fallback se informa APARTE, y no como parte del diff: cuando repara bien,
  // el valor queda IGUAL al guardado y desaparece del diff. Contarlo solo por el
  // diff haría parecer que nunca corrió.
  const fbT = plan.filter((p) => p.fallback.tituloOSinopsis);
  const fbE = plan.filter((p) => p.fallback.episodio);
  console.log(`fallback: actuó en ${fbT.length} título/sinopsis y ${fbE.length} episodio(s)` +
    (fbT.length ? ` → ${fbT.map((p) => p.clave).join(" ")}` : ""));
  console.log(`llamadas a TMDB: ${llamadasTmdb}`);

  // --- Comprobacion del ensayo integral -----------------------------------
  // El ensayo tiene que ejercitar la consulta del EPISODIO EXACTO, no el camino
  // del 404. Con las coordenadas perdidas eso pasaba en silencio: la serie
  // sintetica se planificaba como si no tuviera episodio y el camino real nunca
  // se probaba. Aca se exige la evidencia.
  if (ENSAYO) {
    const faltan = SINTETICOS
      .filter((x) => x.media_type === "tv")
      .flatMap((x) => [IDIOMA, IDIOMA_FALLBACK].map((l) =>
        `/tv/${x.tmdb_id}/season/${x.season_number}/episode/${x.episode_number}?language=${l}`))
      .filter((r) => !rutasPedidas.has(r));
    if (faltan.length) {
      throw new Error("el ensayo NO pidio el episodio por coordenadas exactas:\n  - " + faltan.join("\n  - "));
    }
    console.log("ensayo: verificado que se pidio el episodio por coordenadas exactas en los dos idiomas");
    const sinteticos = plan.filter((p) => SINTETICOS.some((x) => `${x.media_type}:${x.tmdb_id}` === p.clave));
    for (const p of sinteticos) {
      console.log(`  ${p.clave}: cambia [${p.cambia}] omitidos ${JSON.stringify(p.omitidos)}`);
    }
    if (sinteticos.length !== SINTETICOS.length) {
      throw new Error(`el ensayo esperaba ${SINTETICOS.length} titulos sinteticos en el plan y hay ${sinteticos.length}: sembraste?`);
    }
  }

  // Los "ya-en-destino" no se listan de a uno: son decenas y no hay nada que
  // revisar en ellos. Lo que hay que mirar caso por caso son los otros tres.
  for (const p of plan) for (const [c, m] of Object.entries(p.omitidos)) {
    if (m === "ya-en-destino") continue;
    console.log(`  omitido ${p.clave}.${c} (${m}): se conserva ${JSON.stringify((p.antes[c] ?? "").slice(0, 60))}`);
  }
  console.log("\nprimeros cambios:");
  for (const p of cambian.slice(0, 8)) {
    for (const c of p.cambia) {
      console.log(`  ${p.clave}.${c}: ${JSON.stringify((p.antes[c] ?? "").slice(0, 45))} -> ${JSON.stringify((p.despues[c] ?? "").slice(0, 45))}`);
    }
  }

  // El dry-run NO escribe en la base y su único producto es el snapshot, que es
  // lo que se revisa y lo que después se aplica con --desde-plan.
  const { ruta } = escribirSnapshot(plan);
  console.log(`\nDRY-RUN: no se escribió nada en la base.`);
  console.log(`plan escrito y releído: ${ruta}`);
  console.log(`para aplicarlo, después de revisarlo:`);
  console.log(`  node --env-file=.env.local scripts/backfill-upcoming-idioma.mjs --aplicar --desde-plan=${ruta}${ENSAYO ? " --ensayo" : ""}`);
  return 0;
}

// `process.exitCode` y NO `process.exit()`.
//
// En Windows, `process.exit()` con escrituras a stdout todavia en vuelo tumba a
// libuv con `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` y el
// proceso termina con 127 —"command not found"— en vez de con el codigo que se
// quiso devolver. Un script cuyo trabajo es avisar "esto fallo, no sigas" no
// puede comunicarlo con un crash: el 127 es distinto de cero por accidente y no
// por diseno, y el mensaje que queda en pantalla habla de un handle de libuv en
// lugar del error real.
//
// Con `exitCode`, Node vacia stdout y sale limpio con el codigo pedido.
try {
  process.exitCode = await main();
} catch (e) {
  console.error("");
  console.error("ABORTADO:", e.message);
  console.error("Si el error viene de la RPC, la transaccion se deshizo entera: no quedo nada a medias.");
  process.exitCode = 1;
}
