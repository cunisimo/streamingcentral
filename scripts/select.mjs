#!/usr/bin/env node
/**
 * Fase 4 — Selección final del chip.
 *
 * Toma los aprobados y aplica, en este orden:
 *   1. piso de calidad por puntaje (no por popularidad)
 *   2. agrupamiento por saga (colección de TMDB + grupos manuales del config)
 *   3. tope de títulos por grupo
 *   4. cálculo de priority para el orden de servido
 *
 * Uso:
 *   node scripts/select.mjs --chip magica-navidad
 *   node scripts/select.mjs --chip magica-navidad --min-nota 5.15
 *   node scripts/select.mjs --chip magica-navidad --tope 3
 *
 * Entrada: chips/<slug>.json + data/clasificado-<slug>.json + data/colecciones-<slug>.json
 * Salida:  data/seleccion-<slug>.json
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
  console.error("Uso: node scripts/select.mjs --chip <slug>");
  process.exit(1);
}

const CONFIG_PATH = resolve(`chips/${slug}.json`);
const CLASIF_PATH = resolve(`data/clasificado-${slug}.json`);
const COLEC_PATH = resolve(`data/colecciones-${slug}.json`);
const OUTPUT_PATH = resolve(`data/seleccion-${slug}.json`);

/**
 * Score editorial: mezcla calidad percibida con reconocibilidad.
 * La nota manda; los votos desempatan en escala logarítmica para que
 * un clásico con 12.000 votos no aplaste a una polaca con 155.
 * @param {{vote_average: number, vote_count: number}} t
 */
const score = (t) =>
  (t.vote_average ?? 0) + Math.log10((t.vote_count ?? 0) + 1) / 2;

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const clasif = JSON.parse(await readFile(CLASIF_PATH, "utf8"));

  let colecciones = { rows: [] };
  try {
    colecciones = JSON.parse(await readFile(COLEC_PATH, "utf8"));
  } catch {
    console.warn("! Sin data/colecciones — el tope por saga sólo usará grupos manuales.\n");
  }

  const sel = config.seleccion ?? {};
  const tope = arg("--tope") ? Number(arg("--tope")) : (sel.tope_por_grupo ?? 2);
  const minNota = arg("--min-nota") ? Number(arg("--min-nota")) : (sel.min_vote_average ?? 0);
  const minVotos = sel.min_votos_para_evaluar_nota ?? 50;
  const objetivo = sel.objetivo ?? 100;

  const colPorId = new Map(colecciones.rows?.map((r) => [r.tmdb_id, r]) ?? []);

  // Título exacto → nombre de grupo manual
  const grupoPorTitulo = new Map();
  for (const g of sel.grupos_manuales ?? []) {
    for (const titulo of g.titulos ?? []) grupoPorTitulo.set(titulo, g.nombre);
  }

  const aprobados = (clasif.titles ?? []).filter((t) => t.califica === true);
  console.log(`\n═══ SELECCIÓN · ${config.nombre ?? slug} ═══\n`);
  console.log("── Embudo ──");
  console.log(`  ${String(aprobados.length).padStart(4)}  aprobados por el clasificador`);

  // ── 1. Piso de calidad ────────────────────────────────────────────────────
  // Las excepciones se saltean el piso. Van por título exacto en el config,
  // para que la razón de cada rescate quede documentada.
  const excepciones = new Set(sel.excepciones_calidad ?? []);
  const descartadosNota = [];
  const rescatados = [];
  const conCalidad = aprobados.filter((t) => {
    const evaluable = (t.vote_count ?? 0) >= minVotos;
    const bajoPiso = evaluable && (t.vote_average ?? 0) < minNota;
    if (bajoPiso && excepciones.has(t.title)) {
      rescatados.push(t);
      return true;
    }
    if (bajoPiso) {
      descartadosNota.push(t);
      return false;
    }
    return true;
  });
  console.log(`  ${String(conCalidad.length).padStart(4)}  nota ≥ ${minNota} (−${descartadosNota.length})`);
  for (const t of rescatados) {
    console.log(`        excepción: ${t.title} (${t.vote_average})`);
  }
  // ── 2. Agrupamiento ───────────────────────────────────────────────────────
  /** @param {object} t @returns {string|null} */
  const claveGrupo = (t) => {
    const manual = grupoPorTitulo.get(t.title);
    if (manual) return `manual:${manual}`;
    const col = colPorId.get(t.tmdb_id);
    return col?.collection_id ? `col:${col.collection_id}` : null;
  };

  const grupos = new Map();
  const sueltos = [];
  for (const t of conCalidad) {
    const clave = claveGrupo(t);
    if (!clave) {
      sueltos.push(t);
      continue;
    }
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(t);
  }

  // ── 3. Tope por grupo ─────────────────────────────────────────────────────
  const recortes = [];
  const deGrupos = [];
  for (const [clave, miembros] of grupos) {
    miembros.sort((a, b) => score(b) - score(a));
    const nombre = clave.startsWith("manual:")
      ? clave.slice(7)
      : (colPorId.get(miembros[0].tmdb_id)?.collection_name ?? clave);
    deGrupos.push(...miembros.slice(0, tope));
    for (const fuera of miembros.slice(tope)) recortes.push({ nombre, t: fuera });
  }

  const finales = [...deGrupos, ...sueltos].sort((a, b) => score(b) - score(a));
  console.log(`  ${String(finales.length).padStart(4)}  tope de ${tope} por saga (−${recortes.length})`);

  // ── 4. Informes ───────────────────────────────────────────────────────────
  if (descartadosNota.length) {
    console.log(`\n── Fuera por puntaje ──`);
    for (const t of descartadosNota.sort((a, b) => a.vote_average - b.vote_average)) {
      console.log(`  ${t.vote_average} · ${t.year} · ${t.title}`);
    }
  }

  if (recortes.length) {
    console.log(`\n── Fuera por tope de saga ──`);
    for (const { nombre, t } of recortes) {
      console.log(`  [${nombre}] ${t.year} · ${t.title}`);
    }
  }

  const decadas = new Map();
  for (const t of finales) {
    if (!t.year) continue;
    const d = `${Math.floor(t.year / 10) * 10}s`;
    decadas.set(d, (decadas.get(d) ?? 0) + 1);
  }
  console.log(`\n── Décadas de la selección ──`);
  for (const [d, c] of [...decadas].sort()) console.log(`  ${d}  ${c}`);

  const sinRevisar = finales.filter((t) => t.confianza !== "alta" && !t.revisado);
  if (sinRevisar.length) {
    console.log(`\n! ${sinRevisar.length} títulos seleccionados NO tienen confianza alta`);
    console.log(`  y todavía no pasaron por revisión humana.`);
    console.log(`  node scripts/review.mjs --chip ${slug} --solo revisar`);
  }

  console.log(`\n── Resultado ──`);
  console.log(`  seleccionados : ${finales.length}`);
  console.log(`  objetivo      : ${objetivo}`);

  // ── Salida: lista lista para cargar ───────────────────────────────────────
  const filas = finales.map((t, i) => ({
    chip_slug: slug,
    tmdb_id: t.tmdb_id,
    media_type: t.media_type,
    title: t.title,
    year: t.year,
    priority: i + 1,
    source: "curated",
    confianza: t.confianza,
    revisado: t.revisado ?? false,
  }));

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        chip_slug: slug,
        selected_at: new Date().toISOString(),
        reglas: { tope, minNota, minVotos },
        total: filas.length,
        rows: filas,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n✔ ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló la selección:", err);
  process.exit(1);
});
