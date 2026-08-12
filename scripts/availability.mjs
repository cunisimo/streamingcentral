#!/usr/bin/env node
/**
 * Fase 5 — Disponibilidad real en plataformas argentinas.
 *
 * Responde la pregunta que decide todo: de los N curados, ¿cuántos puede
 * ver efectivamente un usuario con sus 2 o 3 suscripciones?
 *
 * OJO — estacionalidad: medir un chip navideño fuera de temporada da un
 * piso pesimista. Las plataformas rotan catálogo estacional.
 *
 * Uso:
 *   node --env-file=.env.local scripts/availability.mjs --chip magica-navidad
 *   node --env-file=.env.local scripts/availability.mjs --chip magica-navidad --plataformas "Netflix,Disney Plus"
 *
 * Entrada: data/seleccion-<slug>.json
 * Salida:  data/disponibilidad-<slug>.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const slug = arg("--chip");
if (!slug) {
  console.error("Uso: node scripts/availability.mjs --chip <slug>");
  process.exit(1);
}

const REGION = arg("--region") ?? "AR";
const plataformasArg = arg("--plataformas");

const BASE = "https://api.themoviedb.org/3";
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_READ_TOKEN ?? null;
const API_KEY = process.env.TMDB_API_KEY ?? null;

if (!ACCESS_TOKEN && !API_KEY) {
  console.error("Falta TMDB_ACCESS_TOKEN / TMDB_READ_TOKEN / TMDB_API_KEY.");
  process.exit(1);
}

const INPUT_PATH = resolve(`data/seleccion-${slug}.json`);
const OUTPUT_PATH = resolve(`data/disponibilidad-${slug}.json`);
const CONCURRENCY = 8;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function tmdb(path, attempt = 0) {
  const url = new URL(BASE + path);
  if (!ACCESS_TOKEN && API_KEY) url.searchParams.set("api_key", API_KEY);
  const headers = { accept: "application/json" };
  if (ACCESS_TOKEN) headers.authorization = `Bearer ${ACCESS_TOKEN}`;

  try {
    const res = await fetch(url, { headers });
    if (res.status === 429 && attempt < 5) {
      await sleep((Number(res.headers.get("retry-after") ?? 1) + 1) * 1000);
      return tmdb(path, attempt + 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    if (attempt < 3) {
      await sleep(2 ** attempt * 500);
      return tmdb(path, attempt + 1);
    }
    return null;
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

async function main() {
  const sel = JSON.parse(await readFile(INPUT_PATH, "utf8"));
  const filas = sel.rows ?? [];

  console.log(`\nConsultando disponibilidad en ${REGION} de ${filas.length} títulos…`);

  const resultados = await mapLimit(filas, CONCURRENCY, async (f) => {
    const tipo = f.media_type === "tv" ? "tv" : "movie";
    const data = await tmdb(`/${tipo}/${f.tmdb_id}/watch/providers`);
    const region = data?.results?.[REGION] ?? null;

    // flatrate = incluido en suscripción. rent/buy son alquiler/compra:
    // no cuentan como "lo tengo en mi plataforma".
    const suscripcion = (region?.flatrate ?? []).map((p) => p.provider_name);
    const gratis = [...(region?.free ?? []), ...(region?.ads ?? [])].map((p) => p.provider_name);
    const alquiler = (region?.rent ?? []).map((p) => p.provider_name);

    return { ...f, suscripcion, gratis, alquiler };
  });

  // ── Cobertura por proveedor ───────────────────────────────────────────────
  const porProveedor = new Map();
  for (const r of resultados) {
    for (const p of [...r.suscripcion, ...r.gratis]) {
      porProveedor.set(p, (porProveedor.get(p) ?? 0) + 1);
    }
  }
  const ranking = [...porProveedor].sort((a, b) => b[1] - a[1]);

  console.log(`\n── Proveedores en ${REGION} (suscripción o gratis) ──`);
  for (const [nombre, n] of ranking.slice(0, 15)) {
    console.log(`  ${String(n).padStart(4)}  ${nombre}`);
  }

  // ── Cobertura acumulada de las combinaciones más probables ────────────────

  /** Normaliza para comparar: sin mayúsculas, sin acentos, sin signos. */
  const norm = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  /**
   * Un proveedor cuenta si su nombre normalizado contiene el del usuario
   * o viceversa. "movistar" matchea "MovistarTV"; "Max" matchea "HBO Max".
   * @param {string[]} plats
   */
  const matchear = (plats) => {
    const buscados = plats.map(norm).filter(Boolean);
    return (proveedor) => {
      const p = norm(proveedor);
      return buscados.some((b) => p.includes(b) || b.includes(p));
    };
  };

  const cubiertos = (plats) => {
    const coincide = matchear(plats);
    return resultados.filter((r) => [...r.suscripcion, ...r.gratis].some(coincide)).length;
  };

  console.log(`\n── Cobertura acumulada (los N más grandes juntos) ──`);
  for (const n of [1, 2, 3, 4, 5]) {
    const plats = ranking.slice(0, n).map(([nombre]) => nombre);
    if (plats.length < n) break;
    const c = cubiertos(plats);
    const pct = Math.round((c / resultados.length) * 100);
    console.log(`  top ${n}: ${String(c).padStart(4)} de ${resultados.length} (${pct}%)  — ${plats.join(" + ")}`);
  }

  if (plataformasArg) {
    const plats = plataformasArg.split(",").map((s) => s.trim()).filter(Boolean);
    const coincide = matchear(plats);

    const reconocidos = [...porProveedor.keys()].filter(coincide);
    const sinMatch = plats.filter((p) => {
      const c = matchear([p]);
      return ![...porProveedor.keys()].some(c);
    });

    console.log(`\n── Tu combinación ──`);
    console.log(`  ${cubiertos(plats)} de ${resultados.length}`);
    console.log(`\n  proveedores reconocidos: ${reconocidos.join(", ") || "ninguno"}`);
    if (sinMatch.length) {
      console.log(`  sin coincidencia en el catálogo: ${sinMatch.join(", ")}`);
    }
  }

  // ── Los que no están en ningún lado ───────────────────────────────────────
  const sinNada = resultados.filter(
    (r) => r.suscripcion.length === 0 && r.gratis.length === 0 && r.alquiler.length === 0,
  );
  const soloAlquiler = resultados.filter(
    (r) => r.suscripcion.length === 0 && r.gratis.length === 0 && r.alquiler.length > 0,
  );

  console.log(`\n── Sin disponibilidad en ${REGION} ──`);
  console.log(`  sin nada        : ${sinNada.length}`);
  console.log(`  sólo alquiler   : ${soloAlquiler.length}`);
  console.log(`  en suscripción  : ${resultados.length - sinNada.length - soloAlquiler.length}`);

  if (sinNada.length) {
    console.log(`\n  Peso muerto en el catálogo curado:`);
    for (const r of sinNada) console.log(`    ${r.year} · ${r.title}`);
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        chip_slug: slug,
        region: REGION,
        checked_at: new Date().toISOString(),
        aviso: "Disponibilidad estacional: medida fuera de temporada da un piso pesimista.",
        total: resultados.length,
        rows: resultados,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n✔ ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
