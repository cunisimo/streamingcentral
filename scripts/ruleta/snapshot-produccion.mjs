#!/usr/bin/env node
// Foto de SÓLO LECTURA de lo que la ruleta tiene en Producción, para
// reconciliar el estado local (actualizar-ruleta.mjs --reconciliar <foto>).
// Hace únicamente GET contra PostgREST: no escribe nada, no llama funciones.
//
//   node --env-file=.env.local scripts/ruleta/snapshot-produccion.mjs data/produccion-foto-AAAA-MM-DD.json
//
// Usa la service role porque roulette_titles no se puede leer con la anon key
// (a propósito). La salida no contiene claves; va a data/ (ignorado por git).
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const salida = process.argv[2];
if (!url || !key) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
if (!salida) throw new Error("uso: snapshot-produccion.mjs <salida.json>");

async function leerTodo(tabla, columnas, filtro) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${url}/rest/v1/${tabla}?select=${columnas}&${filtro}&order=tmdb_id.asc,media_type.asc`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${desde}-${desde + 999}` },
    });
    if (!r.ok) throw new Error(`${tabla}: HTTP ${r.status}`);
    const pagina = await r.json();
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
  }
}

const rt = await leerTodo("roulette_titles", "tmdb_id,media_type,razon,advertencia,requiere_contexto,excluido_motivo", "tmdb_id=not.is.null");
const ta = await leerTodo("title_availability", "tmdb_id,media_type,providers,checked_at", "region=eq.AR");
const foto = {
  at: new Date().toISOString(),
  region: "AR",
  rt: rt.map((r) => ({ id: r.tmdb_id, mt: r.media_type, razon: !!r.razon, pero: !!r.advertencia, ctx: !!r.requiere_contexto, excl: r.excluido_motivo ?? null })),
  ta: ta.map((r) => ({ id: r.tmdb_id, mt: r.media_type, p: r.providers, at: r.checked_at })),
};
writeFileSync(salida, JSON.stringify(foto));
console.log(JSON.stringify({ roulette_titles: rt.length, title_availability_ar: ta.length, salida }));
