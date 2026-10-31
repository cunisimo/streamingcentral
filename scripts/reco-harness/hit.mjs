// HIT del riel con la huella corregida (auditoría de Codex sobre 43ed967), sobre
// `recomendaciones()` real, caché en memoria:
//   1. entrada 1 en frío            → arma (paga TMDB una vez);
//   2. entrada 1 idéntica           → HIT: 0 llamadas a TMDB, 1 operación de caché
//                                     (ninguna lectura de perfil ni MMR);
//   3. entrada 1 en otro orden      → HIT igual;
//   4. entrada 2 (mismos títulos y pesos, otros rangos) → MISS: no recibe el riel
//                                     de la entrada 1, y sus orígenes difieren.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs scripts/reco-harness/hit.mjs
import { readFileSync } from "node:fs";
import { recomendaciones } from "../../lib/reco.ts";
import { withMetricas } from "../../lib/metricas.ts";

const FX = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
const P6 = FX.perfiles.find((p) => p.id === "P6").senales.map(({ tipo, id, peso, rango }) => ({ tipo, id, peso, rango }));
const e1 = [...P6, ...P6.slice(0, 4).map((s, i) => ({ ...s, peso: 1, rango: 12 + i }))];
const e2 = [...P6.map((s) => ({ ...s, rango: s.rango >= 4 ? s.rango + 4 : s.rango })),
  ...P6.slice(0, 4).map((s, i) => ({ ...s, peso: 1, rango: 4 + i }))];
const excluir = P6.map((s) => `${s.tipo}:${s.id}`);

const origenes = (items) => [...new Set(items.map((t) => t.porque.titulo))].sort().join(", ");
console.log("| paso | tarjetas | llamadas TMDB | operaciones de caché | hits/misses | orígenes del riel |");
console.log("|---|---|---|---|---|---|");
for (const [nombre, senales] of [
  ["1. entrada 1, en frío", e1], ["2. entrada 1 idéntica", e1],
  ["3. entrada 1 en otro orden", [...e1].reverse()], ["4. entrada 2 (otros rangos)", e2],
]) {
  const { res, metricas: m } = await withMetricas(() => recomendaciones({ senales, excluir, providers: ["n", "d", "m"] }));
  console.log(`| ${nombre} | ${res.items.length} | ${m.tmdb.llamadas} | ${m.redis.llamadasLogicas} | ` +
    `${m.redis.hits}/${m.redis.misses} | ${origenes(res.items)} |`);
}
