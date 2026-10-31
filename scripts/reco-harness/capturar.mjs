// Congela los CANDIDATOS de cada perfil para comparar algoritmos sin que el
// catálogo de TMDB se mueva entre corridas (la trampa de docs/MANTENIMIENTO.md §8.c).
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/reco-harness/capturar.mjs
//
// Usa las MISMAS fuentes que la ruta (`perfilDe`, `recomendadosDe`,
// `cruzadosDe`, `enrichRaw`). Sin Upstash configurado, el caché es de memoria
// y no se escribe nada compartido. Escribe scripts/reco-harness/fixture.json.
import { writeFileSync } from "node:fs";
import { perfilDe, recomendadosDe, cruzadosDe } from "../../lib/reco.ts";
import { enrichRaw } from "../../lib/enrich.ts";
import { exclusionesCruce } from "../../lib/reco-seleccion.ts";
import { PERFILES, PLATAFORMAS } from "./perfiles.mjs";

const TOKEN = process.env.TMDB_READ_TOKEN;
const k = (t, id) => `${t}:${id}`;
const minimo = (r) => ({
  id: r.id, title: r.title, name: r.name, genre_ids: r.genre_ids ?? [],
  original_language: r.original_language ?? "", media_type: r.media_type,
});

async function resolver({ tipo, q, anio }) {
  const u = new URL(`https://api.themoviedb.org/3/search/${tipo}`);
  u.searchParams.set("query", q);
  u.searchParams.set(tipo === "movie" ? "year" : "first_air_date_year", String(anio));
  const j = await (await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const r = j.results?.[0];
  if (!r) throw new Error(`no encontré ${tipo} "${q}" (${anio})`);
  return r.id;
}

const fuentes = {};       // `tipo:id` → { perfil, mismos, cruce: { "<plats>|<sin>": raw[] } }
const disponibles = {};   // "<plats>" → { "tipo:id": título }
const perfiles = [];

for (const p of PERFILES) {
  const senales = [];
  for (const [rango, s] of p.senales.entries()) {
    senales.push({ tipo: s.tipo, id: await resolver(s), peso: s.peso, rango, q: s.q });
  }
  perfiles.push({ ...p, senales });
  console.log(p.id, senales.map((s) => `${s.q}=${s.tipo}:${s.id}`).join(", "));
}

const todas = new Map();
for (const p of perfiles) for (const s of p.senales) todas.set(k(s.tipo, s.id), s);

for (const s of todas.values()) {
  const perfil = await perfilDe(s.tipo, s.id);
  const mismos = (await recomendadosDe(s.tipo, s.id)).map(minimo);
  const variantes = new Set([
    "", // algoritmo anterior
    exclusionesCruce({ tipo: s.tipo, generos: perfil.generosPropios }, false).join("."),
    exclusionesCruce({ tipo: s.tipo, generos: perfil.generosPropios }, true).join("."),
  ]);
  const cruce = {};
  for (const plats of PLATAFORMAS) {
    for (const v of variantes) {
      const sin = v ? v.split(".").map(Number) : [];
      cruce[`${plats.join(",")}|${v}`] = (await cruzadosDe(s.tipo, s.id, plats, sin)).items.map(minimo);
    }
  }
  fuentes[k(s.tipo, s.id)] = { perfil, mismos, cruce };
  console.log("fuentes", s.q, "mismos", mismos.length, "variantes", [...variantes].map((v) => v || "-").join(" "));
}

// Disponibilidad de TODOS los candidatos, por combinación de plataformas.
for (const plats of PLATAFORMAS) {
  const clavePl = plats.join(",");
  const porTipo = { movie: new Map(), tv: new Map() };
  for (const [ko, f] of Object.entries(fuentes)) {
    const tipo = ko.split(":")[0];
    const otro = tipo === "movie" ? "tv" : "movie";
    for (const r of f.mismos) porTipo[tipo].set(r.id, r);
    for (const [kc, xs] of Object.entries(f.cruce)) if (kc.startsWith(`${clavePl}|`)) for (const r of xs) porTipo[otro].set(r.id, r);
  }
  disponibles[clavePl] = {};
  for (const tipo of ["movie", "tv"]) {
    const ok = await enrichRaw([...porTipo[tipo].values()], tipo, plats);
    for (const t of ok) disponibles[clavePl][k(tipo, t.id)] = t.title;
    console.log("disponibles", clavePl, tipo, `${ok.length}/${porTipo[tipo].size}`);
  }
}

const fecha = new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
writeFileSync(new URL("./fixture.json", import.meta.url), JSON.stringify({ capturado: fecha, perfiles, fuentes, disponibles }));
console.log("fixture.json escrito", fecha);
