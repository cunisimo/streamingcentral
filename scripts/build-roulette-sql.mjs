#!/usr/bin/env node
/**
 * Genera el SQL de carga de la ruleta, partido en archivos.
 *
 * Carga el pool ENTERO (1811), tenga texto o no. Los que no tienen quedan
 * con razon NULL y la función los ignora; las pasadas futuras de generación
 * son un UPDATE sobre filas que ya existen.
 *
 * La disponibilidad va a title_availability, la misma tabla que usa navidad.
 *
 * Uso:
 *   node scripts/build-roulette-sql.mjs
 *   node scripts/build-roulette-sql.mjs --chunk 300
 *   node scripts/build-roulette-sql.mjs --solo-datos
 *
 * `--solo-datos`: refresco de disponibilidad y metadata SIN tocar los textos
 * editoriales. El `insert … on conflict` no menciona razon, advertencia ni
 * atencion, así que ni un texto presente en data/copy-ruleta.json puede pisar
 * el de la base. Existe porque el modo normal hace
 * `coalesce(excluded.razon, roulette_titles.razon)`: un NULL no borra, pero un
 * texto SÍ sobrescribe, y una corrección hecha a mano en Supabase se perdería
 * al recargar. Ver docs/MANTENIMIENTO.md §2 y el plan de salas (Tarea 0.3).
 *
 * Entrada: data/pool-ruleta.json + data/copy-ruleta.json
 * Salida:  data/carga-ruleta-N.sql
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v));
const arr = (l) => (l?.length ? `ARRAY[${l.map(q).join(", ")}]::text[]` : "'{}'::text[]");

/** ¿Vino `--solo-datos`? Por defecto no: el modo de siempre no cambia. */
export function esSoloDatos(argv) {
  return argv.includes("--solo-datos");
}

/**
 * El `insert … on conflict` de roulette_titles para un trozo del pool.
 *
 * `textos` es un Map tmdb_id → { razon, advertencia, atencion }. Con
 * `soloDatos` el mapa no se lee: las tres columnas editoriales no aparecen ni
 * en la lista ni en el `do update`.
 */
export function armarUpsert(trozo, textos, { soloDatos = false } = {}) {
  const columnas = "tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average"
    + (soloDatos ? "" : ", razon, advertencia, atencion");
  const filas = trozo.map((t) => {
    const base =
      `  (${num(t.tmdb_id)}, 'movie', ${q(t.title)}, ${num(t.year)}, ${num(t.runtime)}, ` +
      `${arr(t.genres)}, ${q(t.edad ?? "desconocido")}, ${t.apto_chicos ? "true" : "false"}, ` +
      `${num(t.vote_count)}, ${num(t.vote_average)}`;
    if (soloDatos) return `${base})`;
    const c = textos.get(t.tmdb_id);
    return `${base}, ${q(c?.razon ?? null)}, ${q(c?.advertencia ?? null)}, ${q(c?.atencion ?? null)})`;
  });
  const p = [];
  p.push(`insert into roulette_titles (${columnas}) values`);
  p.push(filas.join(",\n"));
  p.push("on conflict (tmdb_id, media_type) do update set");
  p.push("  title = excluded.title, year = excluded.year, runtime = excluded.runtime,");
  p.push("  genres = excluded.genres, edad = excluded.edad,");
  p.push("  apto_chicos = excluded.apto_chicos, vote_count = excluded.vote_count,");
  if (soloDatos) {
    p.push("  vote_average = excluded.vote_average;");
  } else {
    p.push("  vote_average = excluded.vote_average,");
    // El texto nuevo sólo pisa si viene con contenido: una recarga del pool
    // sin regenerar textos no debe borrar lo ya escrito.
    p.push("  razon = coalesce(excluded.razon, roulette_titles.razon),");
    p.push("  advertencia = coalesce(excluded.advertencia, roulette_titles.advertencia),");
    p.push("  atencion = coalesce(excluded.atencion, roulette_titles.atencion);");
  }
  return p.join("\n");
}

/** El upsert de title_availability. Igual en los dos modos. */
export function armarDisponibilidad(trozo, region) {
  const p = [];
  p.push("insert into title_availability (tmdb_id, media_type, region, providers, rent_only, checked_at) values");
  p.push(
    trozo
      .map((t) => `  (${num(t.tmdb_id)}, 'movie', ${q(region)}, ${arr(t.providers)}, false, now())`)
      .join(",\n"),
  );
  p.push("on conflict (tmdb_id, media_type, region) do update set");
  p.push("  providers = excluded.providers, checked_at = excluded.checked_at;");
  return p.join("\n");
}

/** ¿Vino `--textos-nuevos`? */
export function esTextosNuevos(argv) {
  return argv.includes("--textos-nuevos");
}

/**
 * `--textos-nuevos`: lleva a la base los textos y el contexto de saga de los
 * títulos que TODAVÍA NO LOS TIENEN, y nada más. Es el paso que sigue a
 * `actualizar-ruleta.mjs` + `generate-copy.mjs` + `classify-context.mjs`.
 *
 * Por qué no alcanza el modo normal: hace `coalesce(excluded.razon, …)`, así
 * que un texto del JSON local PISA el de la base, y en la base hay
 * correcciones hechas a mano que el JSON no tiene (las dos `razon` del
 * 23/08). Y `carga-contexto.sql` pone `requiere_contexto = false` a TODAS las
 * filas antes de aplicar su lista, lo que se lleva puestas las excepciones
 * manuales (Harry Potter, Star Wars).
 *
 * Las guardas van en el WHERE, contra lo que la base tiene en ese momento:
 *   - textos:  `razon is null`. Una fila con texto, sea del LLM o corregido a
 *     mano, no se toca.
 *   - saga:    `collection_name is null`. Toda secuela ya procesada tiene
 *     nombre de saga; una nueva todavía no. El contexto sólo se marca `true`
 *     (nunca se apaga uno existente).
 */
export function armarTextosNuevos(textos, contexto, colecciones) {
  const p = [];
  const filasTexto = [...textos.values()].filter((r) => r.razon);
  if (filasTexto.length) {
    p.push("update roulette_titles rt set razon = v.razon, advertencia = v.advertencia, atencion = v.atencion");
    p.push("from (values");
    p.push(filasTexto.map((r) => `  (${num(r.tmdb_id)}, ${q(r.razon)}, ${q(r.advertencia ?? null)}, ${q(r.atencion ?? null)})`).join(",\n"));
    p.push(") as v(tmdb_id, razon, advertencia, atencion)");
    p.push("where rt.tmdb_id = v.tmdb_id and rt.media_type = 'movie' and rt.razon is null;");
    p.push("");
  }
  const requieren = (contexto ?? []).filter((r) => r.requiere_contexto).map((r) => r.tmdb_id);
  if (requieren.length) {
    // Va ANTES que collection_name: la guarda es justamente que todavía no lo tenga.
    p.push("update roulette_titles set requiere_contexto = true");
    p.push(`where media_type = 'movie' and collection_name is null and tmdb_id in (${requieren.join(", ")});`);
    p.push("");
  }
  const conSaga = (colecciones ?? []).filter((f) => f.collection_name);
  if (conSaga.length) {
    p.push("update roulette_titles rt set collection_name = v.nombre");
    p.push("from (values");
    p.push(conSaga.map((f) => `  (${num(f.tmdb_id)}, ${q(f.collection_name)})`).join(",\n"));
    p.push(") as v(id, nombre) where rt.tmdb_id = v.id and rt.media_type = 'movie' and rt.collection_name is null;");
    p.push("");
  }
  return p.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (f) => {
    const i = args.indexOf(f);
    return i !== -1 ? (args[i + 1] ?? null) : null;
  };
  const CHUNK = arg("--chunk") ? Number(arg("--chunk")) : 400;
  const soloDatos = esSoloDatos(args);

  const pool = JSON.parse(await readFile(resolve("data/pool-ruleta.json"), "utf8"));
  const copy = JSON.parse(await readFile(resolve("data/copy-ruleta.json"), "utf8"));

  if (esTextosNuevos(args)) {
    const leerSi = async (p) => { try { return JSON.parse(await readFile(resolve(p), "utf8")); } catch { return null; } };
    const textosTodos = new Map((copy.rows ?? []).filter((r) => r.conoce).map((r) => [r.tmdb_id, r]));
    const contexto = (await leerSi("data/contexto-ruleta.json"))?.rows ?? [];
    const colecciones = (await leerSi("data/colecciones-ruleta.json"))?.rows ?? [];
    const cuerpo = armarTextosNuevos(textosTodos, contexto, colecciones);
    const path = resolve("data/carga-textos-nuevos.sql");
    await writeFile(path, [
      "-- Textos, contexto y saga SÓLO donde la base no los tiene todavía.",
      "-- Ninguna fila con razon o collection_name existente se modifica.",
      "", "begin;", "", cuerpo, "commit;", "",
    ].join("\n"), "utf8");
    console.log(`\n  ✔ ${path}`);
    console.log(`  textos candidatos: ${textosTodos.size} (sólo se aplican donde razon is null)`);
    return;
  }

  const region = pool.region ?? "AR";
  const textos = new Map(
    (copy.rows ?? []).filter((r) => r.conoce).map((r) => [r.tmdb_id, r]),
  );
  const titulos = pool.titles ?? [];

  console.log(`\n  pool        : ${titulos.length}`);
  console.log(`  con texto   : ${textos.size}`);
  console.log(`  sin texto   : ${titulos.length - textos.size}  (razon NULL, no servibles)`);
  if (soloDatos) console.log(`  modo        : --solo-datos (razon/advertencia/atencion NO se escriben)`);

  await mkdir(resolve("data"), { recursive: true });

  const trozos = [];
  for (let i = 0; i < titulos.length; i += CHUNK) trozos.push(titulos.slice(i, i + CHUNK));

  for (const [i, trozo] of trozos.entries()) {
    const p = [];
    p.push(`-- Carga de la ruleta — parte ${i + 1} de ${trozos.length}`);
    p.push(`-- ${trozo.length} títulos · región ${region}${soloDatos ? " · sólo datos (sin textos editoriales)" : ""}`);
    p.push("");
    p.push("begin;");
    p.push("");
    p.push(armarUpsert(trozo, textos, { soloDatos }));
    p.push("");
    p.push(armarDisponibilidad(trozo, region));
    p.push("");
    p.push("commit;");
    p.push("");

    const path = resolve(`data/carga-ruleta-${i + 1}.sql`);
    await writeFile(path, p.join("\n"), "utf8");
    console.log(`  ✔ parte ${i + 1}: ${trozo.length} filas → ${path}`);
  }

  console.log(`\n  Pegá las ${trozos.length} partes en orden en el SQL Editor.`);
  console.log(`\n  Verificación:`);
  console.log(`    select count(*) from roulette_titles;`);
  console.log(`    select count(*) from roulette_titles where razon is not null;`);
}

// Sólo corre como programa: el test lo importa para probar las funciones puras.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error("Falló:", err);
    process.exit(1);
  });
}
