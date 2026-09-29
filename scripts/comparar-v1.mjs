#!/usr/bin/env node
// Compatibilidad del contrato v1 de filmografía (issue #25): QUÉ obras evalúa y
// QUÉ títulos muestra cada variante, contra el código anterior (2af1a37).
// "Misma cantidad" no es "compatibilidad": acá se comparan CONJUNTOS.
//
//   node --env-file=<.env.local> --import ./scripts/cargar-lib.mjs \
//        scripts/comparar-v1.mjs <personId> <providers> [--json=<archivo>]
//
// Lee créditos y disponibilidad reales (TMDB) una vez, y con ESOS datos arma
// todas las variantes, así la comparación no la mueve la deriva del catálogo.
// Con `--json=` guarda la foto (créditos recortados + disponibilidad) para
// usarla como fixture de los tests, que no tocan TMDB.
// Cuenta las peticiones reales a TMDB interceptando `fetch`.
import { writeFileSync } from "node:fs";

const [idArg, provArg = "", ...resto] = process.argv.slice(2);
if (!idArg) throw new Error("uso: comparar-v1.mjs <personId> <providers> [--json=archivo]");
const providers = provArg.split(",").filter(Boolean);
const salida = (resto.find((a) => a.startsWith("--json=")) ?? "").slice(7);

let peticiones = 0;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url instanceof Request ? url.url : url).includes("api.themoviedb.org")) peticiones++;
  return fetchOriginal(url, init);
};

const { personCombinedCredits } = await import("../lib/tmdb.ts");
const { disponibilidadFilmografia } = await import("../lib/enrich.ts");
const F = await import("../lib/filmografia.ts");

const crudos = await personCombinedCredits(Number(idArg));
const CAMPOS = ["id", "media_type", "job", "character", "genre_ids", "vote_count", "release_date", "first_air_date", "title", "name"];
const recortar = (c) => Object.fromEntries(CAMPOS.filter((k) => k in c).map((k) => [k, c[k]]));
const credits = { cast: crudos.cast.map(recortar), crew: crudos.crew.map(recortar) };

const variantes = F.variantesV1 ? F.variantesV1(credits) : null;
if (!variantes) throw new Error("lib/filmografia.ts no exporta variantesV1");
const universo = [...new Set(Object.values(variantes).flat())];
const disponibilidad = {};
for (let i = 0; i < universo.length; i += 24) {
  const r = await disponibilidadFilmografia(universo.slice(i, i + 24));
  Object.assign(disponibilidad, r.disponibilidad);
}
const visible = (claves) => claves.filter((k) => (disponibilidad[k] ?? []).some((p) => providers.includes(p)));
const nombre = new Map([...credits.cast, ...credits.crew].map((c) => [`${c.media_type}:${c.id}`, c.title ?? c.name]));
const rotular = (ks) => ks.map((k) => `${nombre.get(k)} (${k})`);

const antes = visible(variantes.antes);
const informe = { persona: idArg, providers: providers.join(","), presupuesto: variantes.antes.length, variantes: {} };
for (const [n, claves] of Object.entries(variantes)) {
  const vis = visible(claves);
  informe.variantes[n] = {
    evaluadas: claves.length,
    visibles: vis.length,
    ganados: rotular(vis.filter((k) => !antes.includes(k))),
    perdidos: rotular(antes.filter((k) => !vis.includes(k))),
  };
}
informe.visiblesAntes = rotular(antes);
informe.peticionesTmdbDelAnalisis = peticiones;
console.log(JSON.stringify(informe, null, 1));
if (salida) writeFileSync(salida, JSON.stringify({ persona: Number(idArg), providers, credits, disponibilidad }, null, 0));
