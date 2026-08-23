#!/usr/bin/env node
// Corrige los DOS textos editoriales de la ruleta que nombran al personaje con
// su nombre europeo, y que quedarían contradiciendo el título de la tarjeta al
// pasar la app a es-MX. Ver docs/medidas/2026-08-23-idioma-plan.md §6.
//
//   node --env-file=.env.local scripts/corregir-ruleta-idioma.mjs           (dry-run)
//   node --env-file=.env.local scripts/corregir-ruleta-idioma.mjs --aplicar
//
// Textos aprobados por el dueño el 2026-08-23.
//
// GARANTÍAS:
//   - Dry-run por default. Sin --aplicar no escribe nada.
//   - Snapshot ANTES en docs/medidas/. Si no se pudo escribir, no toca la base.
//   - Cada UPDATE va acotado por (media_type, tmdb_id): una fila exacta.
//   - Marca de tiempo antes de escribir + conteo después: `roulette_titles`
//     tiene el trigger `roulette_titles_touch`, así que cualquier fila tocada
//     mueve su `updated_at`. Si el conteo no da 2, el script termina con error.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, existsSync } from "node:fs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const APLICAR = process.argv.includes("--aplicar");
const ANTES   = "docs/medidas/2026-08-23-ruleta-antes.json";
const DESPUES = "docs/medidas/2026-08-23-ruleta-despues.json";

// Reemplazos aprobados. `buscar` tiene que aparecer EXACTAMENTE una vez.
const CAMBIOS = [
  {
    ref: "movie:277834", campo: "razon",
    buscar: "Vaiana no depende de un romance para moverse",
    poner:  "Moana no depende de un romance para moverse",
    motivo: "La tarjeta pasa a decir «Moana: Un mar de aventuras»; el texto nombraba al personaje con el nombre europeo.",
  },
  {
    ref: "movie:13179", campo: "razon",
    buscar: "centrada en la inseguridad de Campanilla por no encontrarle sentido a su propio talento",
    poner:  "centrada en la inseguridad de su protagonista por no encontrarle sentido a su propio talento",
    motivo: "Alternativa neutral: no vuelve a romperse si el título cambia otra vez.",
  },
];

const leer = async (ref) => {
  const [tipo, id] = ref.split(":");
  const { data, error } = await sb.from("roulette_titles")
    .select("tmdb_id, media_type, title, razon, advertencia, updated_at")
    .eq("media_type", tipo).eq("tmdb_id", Number(id)).single();
  if (error) throw new Error(`${ref}: ${error.message}`);
  return data;
};

async function main() {
  // --- 1. Leer y validar ----------------------------------------------------
  const antes = [];
  for (const c of CAMBIOS) {
    const fila = await leer(c.ref);
    const texto = fila[c.campo] ?? "";
    const veces = texto.split(c.buscar).length - 1;
    if (veces !== 1) {
      console.error(`ABORTA — ${c.ref}: la cadena a reemplazar aparece ${veces} veces, se esperaba 1.`);
      console.error(`  buscar: «${c.buscar}»`);
      process.exit(2);
    }
    antes.push({ ...fila, campo: c.campo, texto_actual: texto, texto_nuevo: texto.replace(c.buscar, c.poner) });
  }

  console.log("=".repeat(74));
  for (const a of antes) {
    console.log(`\n${a.media_type}:${a.tmdb_id}  «${a.title}»`);
    console.log(`  ANTES : ${a.texto_actual}`);
    console.log(`  DESPUÉS: ${a.texto_nuevo}`);
  }
  console.log("\n" + "=".repeat(74));

  if (!APLICAR) {
    console.log("\nDRY-RUN. Nada se escribió. Volvé a correr con --aplicar.");
    return;
  }

  // --- 2. Snapshot ANTES, obligatorio --------------------------------------
  writeFileSync(ANTES, JSON.stringify({ generado: "2026-08-23", filas: antes }, null, 2));
  if (!existsSync(ANTES)) { console.error("ABORTA: no se pudo escribir el snapshot."); process.exit(2); }
  console.log(`snapshot: ${ANTES}`);

  // --- 3. Marca de tiempo ---------------------------------------------------
  // Un segundo antes, para no perder una escritura por redondeo del reloj.
  const marca = new Date(Date.now() - 1000).toISOString();

  // --- 4. UPDATE acotado por (media_type, tmdb_id) --------------------------
  for (const a of antes) {
    const { error } = await sb.from("roulette_titles")
      .update({ [a.campo]: a.texto_nuevo })
      .eq("media_type", a.media_type).eq("tmdb_id", a.tmdb_id);
    if (error) { console.error(`ABORTA — update ${a.media_type}:${a.tmdb_id}: ${error.message}`); process.exit(2); }
    console.log(`  actualizado ${a.media_type}:${a.tmdb_id}`);
  }

  // --- 5. Verificación ------------------------------------------------------
  const despues = [];
  for (const c of CAMBIOS) despues.push(await leer(c.ref));

  const okTexto = despues.every((d, i) => d[antes[i].campo] === antes[i].texto_nuevo);
  const noQuedaViejo = despues.every((d, i) => !(d[antes[i].campo] ?? "").includes(CAMBIOS[i].buscar));

  // El trigger roulette_titles_touch mueve updated_at en CUALQUIER fila tocada.
  const { data: tocadas, error: e2 } = await sb.from("roulette_titles")
    .select("tmdb_id, media_type, updated_at").gte("updated_at", marca);
  if (e2) { console.error(`no se pudo contar las filas tocadas: ${e2.message}`); process.exit(2); }

  writeFileSync(DESPUES, JSON.stringify({
    generado: "2026-08-23", filas: despues,
    filas_tocadas: (tocadas ?? []).map((t) => `${t.media_type}:${t.tmdb_id}`),
  }, null, 2));

  console.log(`\ntexto nuevo aplicado en las dos filas : ${okTexto}`);
  console.log(`no queda rastro del texto viejo       : ${noQuedaViejo}`);
  console.log(`filas con updated_at >= la marca      : ${tocadas?.length ?? 0}`);
  console.log(`cuáles                                : ${(tocadas ?? []).map((t) => `${t.media_type}:${t.tmdb_id}`).join(", ")}`);

  if (!okTexto || !noQuedaViejo || (tocadas?.length ?? 0) !== 2) {
    console.error("\nVERIFICACIÓN FALLIDA. Revisar contra el snapshot antes de seguir.");
    process.exit(3);
  }
  console.log(`\nOK: exactamente 2 filas modificadas. ${DESPUES} escrito.`);
}

await main();
