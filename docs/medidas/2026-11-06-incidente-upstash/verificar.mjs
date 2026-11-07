// ¿La respuesta cambió? JSON canónico (claves ordenadas): el orden de las claves de
// `disponibilidad` depende de quién termina primero y no es parte del contrato.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const et = process.argv[2];
const APP = "http://127.0.0.1:3140";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const cfg = (o) => fetch("http://127.0.0.1:4811/__banco/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const q = "?providers=n,d,m";
const out = {};
async function caso(n, u) {
  const r = await fetch(APP + u); const b = await r.text(); await dormir(500);
  let j = null; try { j = JSON.parse(b); } catch {}
  const d = j?.disponibilidad ?? {};
  out[n] = { status: r.status, hash: createHash("sha256").update(JSON.stringify(canon(j))).digest("hex").slice(0, 12), plataformas: j?.platforms, trailer: j?.trailer ?? null, relacionados: j?.related?.length, relConPlataforma: j?.related?.filter((x) => x.platforms?.length).length, degradacion: j?.degradacion ?? null, obras: Object.keys(d).length, obrasConPlataforma: Object.values(d).filter((x) => x.length).length, sinDisponibilidad: j?.sinDisponibilidad?.length };
}
await cfg({ modo: "ok", latenciaMs: 0 });
for (const [n, u] of [
  ["title AR con tráiler", `/api/title/movie/20001${q}`], ["title AR sin tráiler", `/api/title/movie/20002${q}`], ["title serie AR", `/api/title/tv/20003${q}`],
  ["title sinAR con evidencia", `/api/title/movie/905001${q}`], ["title sinAR propia", `/api/title/movie/905004${q}`], ["title serie sinAR", `/api/title/tv/905003${q}`],
  ["title sin plataformas de usuario", "/api/title/movie/905001"],
  ["person AR", "/api/person/30000?filmografia=v2"], ["person sinAR con evidencia", "/api/person/906001?filmografia=v2"],
  ["person v1 sinAR", "/api/person/906001?providers=n,d,m"],
  ["person items", `/api/person/906001?filmografia=v2&items=${Array.from({ length: 24 }, (_, i) => `movie:${900201 + i}`).join(",")}`],
]) { await vaciar(); await caso(n, u); await caso(`${n} (caliente)`, u); }
// Fallos: 429 en una parte de los proveedores. Cada título falla solo; el resto sigue.
await vaciar();
await cfg({ modo: "429-parcial", parcialP: 0.25, familiaParcial: "/watch/providers" });
await caso("429 parcial title", `/api/title/movie/20001${q}`);
await vaciar();
await caso("429 parcial person", "/api/person/30000?filmografia=v2");
await cfg({ modo: "ok" });
await dormir(6000); // la pausa local por 429 vence
// Cuota agotada.
await vaciar();
await fetch("http://127.0.0.1:4804/__agotada?v=1");
await caso("agotada title sinAR", `/api/title/movie/905001${q}`);
await caso("agotada person", "/api/person/906001?filmografia=v2");
await fetch("http://127.0.0.1:4804/__agotada?v=0");
writeFileSync(new URL(`./verif-${et}.json`, import.meta.url), JSON.stringify(out, null, 1));
const otro = new URL("./verif-antes.json", import.meta.url);
if (et !== "antes" && existsSync(otro)) {
  const a = JSON.parse(readFileSync(otro, "utf8"));
  let dif = 0;
  for (const k of Object.keys(out)) {
    const igual = JSON.stringify(a[k]) === JSON.stringify(out[k]);
    if (!igual) dif++;
    console.log(`${igual ? "igual" : "DIFIERE"} ${k.padEnd(40)} ${out[k].status} plat=${out[k].plataformas ?? ""} tr=${out[k].trailer ?? "-"} rel=${out[k].relacionados ?? "-"}/${out[k].relConPlataforma ?? "-"} obras=${out[k].obras}/${out[k].obrasConPlataforma} sinDisp=${out[k].sinDisponibilidad ?? "-"} degr=${JSON.stringify(out[k].degradacion)}`);
    if (!igual) console.log("   antes:", JSON.stringify(a[k]), "\n   despues:", JSON.stringify(out[k]));
  }
  console.log("diferencias:", dif, "de", Object.keys(out).length);
}
