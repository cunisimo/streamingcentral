// Dos preguntas sobre reco: ¿el riel se rearma si cambian las exclusiones que manda el
// Home? ¿Y cuánto cuesta frío? Con RECO_DIVERSIDAD=0 (env del proceso) mide el camino viejo.
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
async function medir(nombre, body, token = "banco.10000.8.6") {
  await t(4804, "?reset"); await t(4805, "?reset");
  const res = await fetch(APP + "/api/te-va-a-gustar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await res.json(); await dormir(900);
  const r = await t(4804), m = await t(4805);
  console.log(`${nombre.padEnd(38)} ${res.status} cmd=${String(r.comandos).padEnd(4)} MGET=${String(r.porComando.MGET ?? 0).padEnd(3)} SET=${String(r.porComando.SET ?? 0).padEnd(4)} tmdb=${String(m.total).padEnd(4)} items=${j.items?.length} ${JSON.stringify(r.setPorPrefijo)}`);
}
const base = { senales: [], providers: ["n", "d", "m"] };
const home = (d) => Array.from({ length: 274 }, (_, i) => `movie:${d + i}`);
await vaciar();
await medir("reco fría, exclusiones del Home A", { ...base, excluir: home(500000) });
await medir("reco caliente, mismas exclusiones", { ...base, excluir: home(500000) });
await medir("reco, Home B (otro día o selector)", { ...base, excluir: home(510000) });
await medir("reco, Home C", { ...base, excluir: home(520000) });
await vaciar();
await medir("reco sin AR fría", { ...base, excluir: [] }, "banco.900000.8.6");
