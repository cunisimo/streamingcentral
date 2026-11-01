// Costo REAL de `recomendaciones()` (la función que llama la ruta), con caché en
// memoria y TMDB de verdad. Un proceso por algoritmo, para que no se presten
// caché entre sí:
//
//   RECO_DIVERSIDAD=0 node --env-file=.env.local --import ./scripts/cargar-lib.mjs scripts/reco-harness/costos.mjs
//   RECO_DIVERSIDAD=1 node --env-file=.env.local --import ./scripts/cargar-lib.mjs scripts/reco-harness/costos.mjs
//
// Cuenta llamadas LÓGICAS a TMDB y operaciones de caché (GET/MGET/SET) por
// pedido. Lo que NO cuenta: las consultas a Supabase de la ruta (validar el
// token, descartes y —con el algoritmo nuevo— señales), que necesitan una
// sesión real; salen del código: 2 hoy, 3 con el nuevo, en paralelo.
import { readFileSync } from "node:fs";
import { recomendaciones } from "../../lib/reco.ts";
import { withMetricas } from "../../lib/metricas.ts";

const FX = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
const nuevo = process.env.RECO_DIVERSIDAD !== "0";
const prov = ["n", "d", "m"];

// Con el algoritmo nuevo las señales llegan con rango (las lee el servidor);
// con el anterior, como las manda el cliente: sin rango, por peso y recencia.
const senalesDe = (id) => FX.perfiles.find((p) => p.id === id).senales
  .map(({ tipo, id: i, peso, rango }) => (nuevo ? { tipo, id: i, peso, rango } : { tipo, id: i, peso }));
const excluirDe = (s) => s.map((x) => `${x.tipo}:${x.id}`);

async function medir(nombre, senales, extra = []) {
  const { res, metricas: m } = await withMetricas(() =>
    recomendaciones({ senales, excluir: [...excluirDe(senales), ...extra], providers: prov }));
  console.log(`| ${nuevo ? "nuevo" : "actual"} | ${nombre} | ${res.items.length} | ${m.tmdb.llamadas} | ` +
    `${m.redis.llamadasLogicas} | ${m.redis.hits}/${m.redis.misses} |`);
}

console.log("| algoritmo | caso | tarjetas | llamadas TMDB | operaciones de caché | hits/misses |");
console.log("|---|---|---|---|---|---|");
const p6 = senalesDe("P6"), p6b = senalesDe("P6b"), p4 = senalesDe("P4");
await medir("P6 en frío (todo vacío)", p6);
await medir("P6 otra vez (riel en caché)", p6);
await medir("P6 + 1 descarte (riel nuevo, fuentes calientes)", p6, ["movie:1"]);
await medir("P6b voto nuevo (riel nuevo)", p6b);
await medir("P6b otra vez (riel en caché)", p6b);
await medir("P4 en frío de riel (fuentes en parte calientes)", p4);
await medir("P4 otra vez (riel en caché)", p4);
