// Redis y TMDB por etapa de una visita real. node etapas.mjs <etiqueta> [puertos,separados]
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const et = process.argv[2];
const PUERTOS = (process.argv[3] ?? "3140").split(",");
const app = (i = 0) => `http://127.0.0.1:${PUERTOS[i % PUERTOS.length]}`;
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const q = "?providers=n,d,m";

// Etapa de cada clave de Redis, según sea del título principal o de otro.
const etapaClave = (k, id) => {
  const propio = new RegExp(`:(movie|tv):${id}$`).test(k);
  if (k.startsWith("pv3:")) return propio ? "proveedores principal" : "relacionados: proveedores";
  if (k === "disp:top-manual") return "disp:top-manual";
  if (k.startsWith("disp:")) return propio ? "disp: principal" : "relacionados: disp:";
  if (k.startsWith("oficial:")) return propio ? "oficial: principal" : "relacionados: oficial:";
  if (k.startsWith("videos:")) return "tráiler videos:";
  if (k.startsWith("card:")) return "metadata card:";
  if (k.startsWith("ed:")) return "editorial ed:";
  return "otros: " + k.split(":")[0];
};
const etapaTmdb = (c, id) => {
  const m = c.p.match(/^\/(movie|tv)\/(\d+)(\/.*)?$/);
  if (!m) return c.p.includes("combined_credits") ? "filmografía créditos" : c.p.startsWith("/person") ? "filmografía persona" : "otros";
  const propio = Number(m[2]) === id;
  if (m[3] === "/watch/providers") return propio ? "proveedores principal" : "relacionados: proveedores";
  if (m[3] === "/videos") return "tráiler videos:";
  if (c.append && c.lang === "es-ES") return propio ? "oficial: principal" : "relacionados: oficial:";
  return propio ? "titleDetails" : "otros detalle";
};
function porEtapa(r, m, id) {
  const e = {};
  const fila = (n) => (e[n] ??= { lecturas: 0, clavesLeidas: 0, unicasL: new Set(), escrituras: 0, unicasE: new Set(), tmdb: 0 });
  for (const op of r.ops) {
    if (op.op === "MGET") {
      const et2 = new Set(op.claves.map((k) => etapaClave(k, id)));
      for (const n of et2) fila(n).lecturas += 1 / et2.size; // un MGET mixto se reparte
      for (const k of op.claves) { const f = fila(etapaClave(k, id)); f.clavesLeidas++; f.unicasL.add(k); }
    } else if (op.op === "SET") { const f = fila(etapaClave(op.claves[0], id)); f.escrituras++; f.unicasE.add(op.claves[0]); }
    else fila("control (PTTL y otros)").lecturas++;
  }
  for (const c of m.llamadas) fila(etapaTmdb(c, id)).tmdb++;
  const out = {};
  for (const [n, f] of Object.entries(e)) out[n] = { MGET: Math.round(f.lecturas * 10) / 10, clavesLeidas: f.clavesLeidas, unicasLeidas: f.unicasL.size, repetidasLeidas: f.clavesLeidas - f.unicasL.size, SET: f.escrituras, unicasEscritas: f.unicasE.size, repetidasEscritas: f.escrituras - f.unicasE.size, tmdb: f.tmdb };
  return out;
}
const filas = [];
async function medir(caso, id, fn) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const hashes = await fn(); await dormir(1200);
  const r = await t(4804), m = await t(4805);
  const f = { et, caso, comandos: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, tmdb: m.total, claves: r.clavesMget.reduce((a, b) => a + b, 0), hashes, etapas: porEtapa(r, m, id) };
  filas.push(f);
  console.log(`${et.padEnd(10)} ${caso.padEnd(34)} cmd=${String(f.comandos).padEnd(5)} MGET=${String(f.MGET).padEnd(4)} claves=${String(f.claves).padEnd(4)} SET=${String(f.SET).padEnd(4)} tmdb=${String(f.tmdb).padEnd(4)} ${hashes.join(" ")}`);
}
const huella = async (r) => { const b = await r.text(); try { const j = JSON.parse(b); return createHash("sha256").update(JSON.stringify(canon(j))).digest("hex").slice(0, 8); } catch { return r.status === 200 ? "html" : String(r.status); } };
const ficha = async (tipo, id, i = 0) => { const d = await fetch(`${app(i)}/titulo/${tipo}/${id}`); await d.text(); return huella(await fetch(`${app(i)}/api/title/${tipo}/${id}${q}`)); };
const persona = async (id, i = 0) => { const d = await fetch(`${app(i)}/persona/${id}`); await d.text(); await (await fetch(`${app(i)}/api/providers`)).text(); return huella(await fetch(`${app(i)}/api/person/${id}?filmografia=v2`)); };
const items = async (claves) => huella(await fetch(`${app()}/api/person/1?filmografia=v2&items=${claves.join(",")}`));

const N = 5;
const casos = [["ficha con AR", 20001, (i) => ficha("movie", 20001, i)], ["ficha sin AR", 905001, (i) => ficha("movie", 905001, i)], ["persona con AR", 30000, (i) => persona(30000, i)], ["persona sin AR", 906001, (i) => persona(906001, i)]];
for (const [n, id, fn] of casos) {
  await vaciar();
  await medir(`${n} · primera`, id, async () => [await fn(0)]);
  await medir(`${n} · segunda`, id, async () => [await fn(0)]);
  await vaciar();
  await medir(`${n} · ${N} simultáneas`, id, () => Promise.all(Array.from({ length: N }, () => fn(0))));
  if (PUERTOS.length > 1) {
    await vaciar();
    await medir(`${n} · ${PUERTOS.length} procesos`, id, () => Promise.all(PUERTOS.map((_, i) => fn(i))));
  }
}
// «Ver más»: sólo al pulsar, un bloque de 24, después de abrir la persona.
const bloque = (base) => Array.from({ length: 24 }, (_, i) => `${i % 3 ? "movie" : "tv"}:${base + 12 + i}`);
await vaciar(); await persona(30000); await medir("persona con AR · Ver más", 30000, async () => [await items(bloque(106000 % 1000 * 0 + 100000))]);
await vaciar(); await persona(906001); await medir("persona sin AR · Ver más", 906001, async () => [await items(bloque(900200))]);
await medir("persona sin AR · Ver más repetido", 906001, async () => [await items(bloque(900200))]);
writeFileSync(new URL(`./etapas-${et}.json`, import.meta.url), JSON.stringify(filas, null, 1));
