import { parseEnv } from "node:util";
import fs from "node:fs";
const env = parseEnv(fs.readFileSync(".env.local", "utf8"));
export const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
export const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const TMDB = env.TMDB_READ_TOKEN;
export const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export function hoyAR() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

// El mapa de providers de la app (lib/providers-ar.ts), leído del propio archivo.
export async function mapaProviders() {
  const src = fs.readFileSync("lib/providers-ar.ts", "utf8");
  const out = new Map();
  const re = /code:\s*"([a-z]+)"[\s\S]{0,400}?tmdbIds:\s*\[([0-9,\s]+)\]/g;
  let m;
  while ((m = re.exec(src))) {
    for (const id of m[2].split(",").map((s) => Number(s.trim())).filter(Boolean)) out.set(id, m[1]);
  }
  return out;
}

/** Toda la agenda vigente, con sus providers, tal como la lee la app. */
export async function agenda() {
  const sel = "tmdb_id,media_type,title,original_title,release_date,season_number,episode_number,"
    + "is_season_premiere,genre_ids,popularity,vote_average,tv_status,"
    + "upcoming_content_providers(provider_id)";
  const url = `${URL_SB}/rest/v1/upcoming_content?select=${sel}`
    + `&release_date=gte.${hoyAR()}&order=release_date.asc&limit=1000`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const filas = await r.json();
  const mapa = await mapaProviders();
  for (const f of filas) {
    const cods = [];
    for (const l of f.upcoming_content_providers ?? []) {
      const c = mapa.get(l.provider_id);
      if (c && !cods.includes(c)) cods.push(c);
    }
    f.plataformas = cods;
    f.providerIds = (f.upcoming_content_providers ?? []).map((l) => l.provider_id);
  }
  return filas;
}
