// Lo que produce una corrida completa: el estado, los archivos que leen los
// pasos siguientes del pipeline (generate-copy, classify-context), el SQL de
// carga INCREMENTAL y el informe.
//
// 🔴 El SQL de esta corrida NUNCA menciona razon, advertencia, atencion,
// requiere_contexto ni collection_name. Esas columnas son trabajo editorial
// (o de LLM revisado) y en la base hay correcciones hechas a mano que no están
// en los JSON locales (dos `razon` del 23/08, seis `requiere_contexto` de
// Harry Potter y Star Wars). Los textos de los títulos NUEVOS se cargan
// después, con `build-roulette-sql.mjs --textos-nuevos`, que sólo escribe
// donde la base todavía no tiene nada.

import { escribirAtomico, archivos } from "./estado.mjs";
import { fechaAR } from "./nucleo.mjs";
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v));
const arr = (l) => (l?.length ? `ARRAY[${l.map(q).join(", ")}]::text[]` : "'{}'::text[]");

/** Títulos nuevos: sólo columnas de datos; si ya existiera la fila, no se toca. */
export function sqlNuevos(titulos) {
  if (!titulos.length) return "";
  return [
    "insert into roulette_titles (tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average) values",
    titulos.map((t) =>
      `  (${num(t.tmdb_id)}, 'movie', ${q(t.title)}, ${num(t.year)}, ${num(t.runtime)}, ${arr(t.genres)}, ` +
      `${q(t.edad ?? "desconocido")}, ${t.apto_chicos ? "true" : "false"}, ${num(t.vote_count)}, ${num(t.vote_average)})`,
    ).join(",\n"),
    "on conflict (tmdb_id, media_type) do nothing;",
  ].join("\n");
}

/** Metadatos que cambiaron (votos, o datos completados): sólo columnas de datos. */
export function sqlMetadatos(titulos) {
  if (!titulos.length) return "";
  return [
    "update roulette_titles rt set",
    "  runtime = v.runtime, year = v.year, vote_count = v.vote_count, vote_average = v.vote_average",
    "from (values",
    titulos.map((t) => `  (${num(t.tmdb_id)}, ${num(t.runtime)}, ${num(t.year)}, ${num(t.vote_count)}, ${num(t.vote_average)}::numeric)`).join(",\n"),
    ") as v(tmdb_id, runtime, year, vote_count, vote_average)",
    "where rt.tmdb_id = v.tmdb_id and rt.media_type = 'movie';",
  ].join("\n");
}

/**
 * Disponibilidad SÓLO de lo que se consultó en esta corrida, con la fecha REAL
 * de la consulta. El generador anterior ponía `now()` a las 2401 filas aunque
 * no se hubieran vuelto a mirar.
 */
export function sqlDisponibilidad(filas, region = "AR") {
  if (!filas.length) return "";
  return [
    "insert into title_availability (tmdb_id, media_type, region, providers, rent_only, checked_at) values",
    filas.map((f) => `  (${num(f.tmdb_id)}, 'movie', ${q(region)}, ${arr(f.providers)}, false, ${q(f.at)}::timestamptz)`).join(",\n"),
    "on conflict (tmdb_id, media_type, region) do update set",
    "  providers = excluded.providers, checked_at = excluded.checked_at;",
  ].join("\n");
}

/** Partes de ≤ `trozo` filas por sentencia, cada una en su transacción. */
export function armarCargaIncremental({ nuevos, metadatos, disponibilidad }, { trozo = 400, region = "AR" } = {}) {
  const partes = [];
  const cortar = (l) => { const out = []; for (let i = 0; i < l.length; i += trozo) out.push(l.slice(i, i + trozo)); return out; };
  for (const t of cortar(nuevos)) partes.push(sqlNuevos(t));
  for (const t of cortar(metadatos)) partes.push(sqlMetadatos(t));
  for (const t of cortar(disponibilidad)) partes.push(sqlDisponibilidad(t, region));
  return partes.map((cuerpo, i) => [
    `-- Ruleta — carga incremental, parte ${i + 1} de ${partes.length}`,
    "-- Sólo columnas de datos: ningún texto editorial ni marca de saga se toca.",
    "", "begin;", "", cuerpo, "", "commit;", "",
  ].join("\n"));
}

// --- Archivos del pipeline ------------------------------------------------------

/** Lo que leen generate-copy y build-roulette-sql: misma forma de siempre. */
export function poolLegado(estado, poolAnterior, ahoraIso) {
  const titles = Object.values(estado.titulos)
    .map(({ con_texto, meta_at, disp_at, coleccion, es_secuela, coleccion_at, familia, release_date, ...t }) => t)
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0) || a.tmdb_id - b.tmdb_id);
  return { ...(poolAnterior ?? {}), region: estado.region, generated_at: ahoraIso, incremental: true, total: titles.length, titles };
}

/** colecciones-ruleta.json: se AGREGAN los nuevos; las filas existentes no cambian. */
export function coleccionesLegado(anterior, incorporados, estado, ahoraIso) {
  const rows = [...(anterior?.rows ?? [])];
  const ya = new Set(rows.map((r) => r.tmdb_id));
  for (const i of incorporados) {
    if (ya.has(i.tmdb_id)) continue;
    const t = estado.titulos[i.tmdb_id];
    rows.push({
      tmdb_id: t.tmdb_id, title: t.title, year: t.year,
      collection_id: t.coleccion?.id ?? null, collection_name: t.coleccion?.name ?? null,
      es_secuela: !!t.es_secuela,
    });
  }
  return { ...(anterior ?? {}), fetched_at: anterior?.fetched_at ?? ahoraIso, actualizado_at: ahoraIso, total: rows.length, rows };
}

/**
 * Qué archivos escribiría (o escribió) una corrida completa. Separado de la
 * escritura para que el plan pueda listarlos sin escribir nada.
 */
export function archivosDeSalida(dir, fecha) {
  const a = archivos(dir);
  return {
    estado: a.estado,
    pool: a.pool,
    poolRespaldo: join(dir, `pool-ruleta.antes-${fecha}.json`),
    colecciones: a.colecciones,
    sql: (n) => join(dir, `carga-ruleta-incremental-${fecha}-${n}.sql`),
    informeJson: join(dir, `ruleta-informe-${fecha}.json`),
    informeMd: join(dir, `ruleta-informe-${fecha}.md`),
  };
}

export function escribirSalidas(dir, { estado, diferencias, dispActualizada, estadoAnterior }, ahoraIso) {
  const fecha = fechaAR(Date.parse(ahoraIso));
  const s = archivosDeSalida(dir, fecha);
  const leer = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

  const poolAnterior = leer(s.pool);
  if (poolAnterior) copyFileSync(s.pool, s.poolRespaldo);

  const incorporados = diferencias.incorporados.map((i) => estado.titulos[i.tmdb_id]);
  const cambiaronMeta = Object.values(estado.titulos).filter((t) => {
    const a = estadoAnterior.titulos[t.tmdb_id];
    return a && (a.vote_count !== t.vote_count || a.vote_average !== t.vote_average || a.runtime !== t.runtime || a.year !== t.year);
  });
  const disponibilidad = [
    ...incorporados.map((t) => ({ tmdb_id: t.tmdb_id, providers: t.providers, at: t.disp_at })),
    ...Object.entries(dispActualizada).map(([id, r]) => ({ tmdb_id: Number(id), providers: r.providers, at: r.at })),
  ];
  const sql = armarCargaIncremental({ nuevos: incorporados, metadatos: cambiaronMeta, disponibilidad }, { region: estado.region });

  const escritos = [];
  sql.forEach((contenido, i) => { escribirAtomico(s.sql(i + 1), contenido); escritos.push(s.sql(i + 1)); });
  escribirAtomico(s.pool, JSON.stringify(poolLegado(estado, poolAnterior, ahoraIso), null, 2)); escritos.push(s.pool);
  escribirAtomico(s.colecciones, JSON.stringify(coleccionesLegado(leer(s.colecciones), diferencias.incorporados, estado, ahoraIso), null, 2)); escritos.push(s.colecciones);
  // El estado va ÚLTIMO: si algo de arriba falla, la próxima corrida retoma del diario.
  escribirAtomico(s.estado, JSON.stringify(estado)); escritos.push(s.estado);
  if (poolAnterior) escritos.push(s.poolRespaldo);
  return { escritos, filasSql: { nuevos: incorporados.length, metadatos: cambiaronMeta.length, disponibilidad: disponibilidad.length, partes: sql.length } };
}

// --- Informe ----------------------------------------------------------------------

export function informeMarkdown(inf) {
  const l = [];
  const fila = (k, v) => l.push(`| ${k} | ${v} |`);
  l.push(`# Ruleta — ${inf.modo === "plan" ? "plan" : "corrida"} ${inf.fecha}`, "");
  if (inf.modo !== "plan") l.push(`**Resultado:** ${inf.completo ? "completa" : `INCOMPLETA (${inf.motivo})`} · duración ${(inf.duracionMs / 1000).toFixed(1)} s`, "");
  if (inf.plan) {
    const p = inf.plan;
    l.push("## Inventario", "", "| | |", "|---|---|");
    fila("Títulos actuales", p.actuales);
    fila("Con texto editorial", p.conTexto);
    fila("Candidatos conocidos", p.candidatos.conocidos + (p.candidatos.descubrimientoCompleto ? "" : " (descubrimiento pendiente)"));
    fila("Títulos nuevos", p.nuevos.exacto ? p.nuevos.cantidad : "se conocen después de descubrir");
    fila("Con datos faltantes", p.datosFaltantes);
    fila(`Disponibilidad vencida (> ${p.disponibilidad.ttlDias} d)`, `${p.disponibilidad.vencidas} (objetivo de esta corrida: ${p.disponibilidad.objetivo})`);
    fila("Disponibilidad vigente (se reutiliza)", p.disponibilidad.vigentes);
    l.push("", "## Se reutiliza sin consultar TMDB", "", "| | |", "|---|---|");
    for (const [k, v] of Object.entries(p.reutilizados)) fila(k, v);
    l.push("", "## Llamadas previstas", "", "| Operación | Ahora | Proceso anterior |", "|---|---|---|");
    const ops = new Set([...Object.keys(p.llamadas.porOperacion), ...Object.keys(p.anterior.porOperacion)]);
    for (const o of ops) fila(o, `${p.llamadas.porOperacion[o] ?? 0} | ${p.anterior.porOperacion[o] ?? 0}`);
    fila("**Total**", `**${p.llamadas.total}** | **${p.anterior.total}**`);
    l.push("", `Llamadas evitadas frente al proceso anterior: **${p.evitadas}**.`);
    if (p.llamadas.coleccionEsEstimada) l.push("", "`coleccion` es una estimación: las sagas de los títulos nuevos se conocen con su detalle.");
  }
  if (inf.metricas) {
    const m = inf.metricas;
    l.push("", "## Medición real", "", "| | |", "|---|---|");
    fila("Intentos HTTP", m.intentos); fila("Éxitos", m.exitos); fila("Fallos", m.fallos);
    fila("Reintentos", m.reintentos); fila("Respuestas 429", m.r429);
    fila("Espera por ritmo", `${(m.esperaRitmoMs / 1000).toFixed(1)} s`); fila("Espera por Retry-After", `${(m.esperaRetryAfterMs / 1000).toFixed(1)} s`);
    l.push("", "| Operación | Intentos | Éxitos | Fallos | Reintentos | 429 |", "|---|---|---|---|---|---|");
    for (const [o, v] of Object.entries(m.porOperacion)) l.push(`| ${o} | ${v.intentos} | ${v.exitos} | ${v.fallos} | ${v.reintentos} | ${v.r429} |`);
  }
  if (inf.progreso) l.push("", "## Progreso", "", "```json", JSON.stringify(inf.progreso, null, 2), "```");
  if (inf.pendiente) l.push("", "## Pendiente", "", "```json", JSON.stringify(inf.pendiente, null, 2), "```");
  if (inf.diferencias) {
    const d = inf.diferencias;
    l.push("", "## Diferencias", "", "| | |", "|---|---|");
    fila("Títulos incorporados", d.incorporados.length); fila("Datos completados", d.datosCompletados.length);
    fila("Metadatos actualizados desde discover (sin llamada extra)", d.metadatosDesdeDescubrir);
    fila("Disponibilidad cambiada", d.disponibilidad.cambiadas.length); fila("Quedaron sin plataforma", d.disponibilidad.sinPlataforma.length);
    fila("Disponibilidad sin cambios", d.disponibilidad.sinCambios); fila("Descartados nuevos", d.descartados);
    fila("Existentes que no reaparecen en discover (se conservan)", d.noReaparecen);
  }
  if (inf.fallos?.length) l.push("", "## Fallos", "", ...inf.fallos.map((f) => `- ${f.clave}: ${f.error}`));
  if (inf.archivos?.length) l.push("", "## Archivos", "", ...inf.archivos.map((a) => `- ${a}`));
  return l.join("\n") + "\n";
}
