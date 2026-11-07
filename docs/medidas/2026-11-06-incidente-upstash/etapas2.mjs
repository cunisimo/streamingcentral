// Casos que faltaban: vencimiento de 5 min, sin tráiler, simultáneas repetidas. node etapas2.mjs <etiqueta>
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const et = process.argv[2];
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const vencer5min = () => fetch("http://127.0.0.1:4804/__borrar?p=disp,ed");
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const huella = async (r) => { const b = await r.text(); return createHash("sha256").update(JSON.stringify(canon(JSON.parse(b)))).digest("hex").slice(0, 8); };
const q = "?providers=n,d,m";
const ficha = async (id) => { await (await fetch(`${APP}/titulo/movie/${id}`)).text(); return huella(await fetch(`${APP}/api/title/movie/${id}${q}`)); };
const persona = async (id) => { await (await fetch(`${APP}/persona/${id}`)).text(); return huella(await fetch(`${APP}/api/person/${id}?filmografia=v2`)); };
const bloque = (base) => Array.from({ length: 24 }, (_, i) => `${i % 3 ? "movie" : "tv"}:${base + 12 + i}`);
const items = (c) => fetch(`${APP}/api/person/1?filmografia=v2&items=${c.join(",")}`).then(huella);
const filas = [];
async function medir(caso, fn) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const h = await fn(); await dormir(800);
  const r = await t(4804), m = await t(4805);
  const f = { et, caso, cmd: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, tmdb: m.total, h: [...new Set(h)].join("+") };
  filas.push(f);
  console.log(`${et.padEnd(14)} ${caso.padEnd(40)} cmd=${String(f.cmd).padEnd(4)} MGET=${String(f.MGET).padEnd(4)} SET=${String(f.SET).padEnd(4)} tmdb=${String(f.tmdb).padEnd(4)} ${f.h}`);
}
for (const [n, fn] of [["ficha con AR", () => ficha(20001)], ["ficha sin AR", () => ficha(905001)], ["persona con AR", () => persona(30000)], ["persona sin AR", () => persona(906001)]]) {
  await vaciar(); await fn(); await dormir(300); await vencer5min();
  await medir(`${n} · tibia (5 min vencidos)`, async () => [await fn()]);
  await medir(`${n} · caliente tras tibia`, async () => [await fn()]);
}
await vaciar(); await persona(906001); await dormir(300); await vencer5min();
await medir("persona sin AR · Ver más, 5 min vencidos", async () => [await items(bloque(900200))]);
for (const [n, id] of [["sin tráiler con AR", 20002], ["sin tráiler sin AR", 905002]]) {
  await vaciar();
  await medir(`${n} · primera`, async () => [await ficha(id)]);
  await medir(`${n} · segunda`, async () => [await ficha(id)]);
  await medir(`${n} · tercera`, async () => [await ficha(id)]);
}
for (const [n, fn] of [["ficha con AR", () => ficha(20001)], ["ficha sin AR", () => ficha(905001)], ["persona sin AR", () => persona(906001)]]) {
  for (let i = 0; i < 5; i++) {
    await vaciar();
    await medir(`${n} · 5 simultáneas r${i + 1}`, () => Promise.all(Array.from({ length: 5 }, fn)));
  }
}
for (let i = 0; i < 3; i++) { await vaciar(); await medir(`persona sin AR · primera r${i + 1}`, async () => [await persona(906001)]); }
writeFileSync(new URL(`./etapas2-${et}.json`, import.meta.url), JSON.stringify(filas, null, 1));
