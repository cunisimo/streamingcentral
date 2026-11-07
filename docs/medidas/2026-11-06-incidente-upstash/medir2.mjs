// Segunda tanda: Home, Home con cuota agotada y CPU por tipo de pedido (relativa, local).
import { execSync } from "node:child_process";
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function medir(nombre, url, headers = {}) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const t0 = Date.now();
  const res = await fetch(APP + url, { headers });
  const b = await res.text();
  const ms = Date.now() - t0;
  await dormir(1500);
  const r = await t(4804), m = await t(4805);
  console.log(`${nombre.padEnd(40)} ${res.status} ${String(ms).padStart(6)}ms ${String(b.length).padStart(7)}B cmd=${r.comandos} ${JSON.stringify(r.porComando)} rech=${r.rechazadosComandos} tmdb=${m.total}`);
}
const q = "?providers=n,d,m&t=";
await medir("api/home frío", `/api/home${q}`);
await medir("api/home repetido", `/api/home${q}`);
await fetch("http://127.0.0.1:4804/__agotada?v=1");
await medir("AGOTADA api/home", `/api/home${q}`);
await medir("AGOTADA api/home (2)", `/api/home${q}`);
await fetch("http://127.0.0.1:4804/__agotada?v=0");

// CPU: tiempo de procesador de los procesos de next start, por tipo de pedido.
const pid = execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3140 -State Listen).OwningProcess"`).toString().trim();
const cpu = () => Number(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid}).CPU"`).toString().trim().replace(",", "."));
const N = 150;
async function tanda(nombre, gen, headers = {}) {
  const a = cpu(); let base = 0;
  for (let i = 0; i < N; i++) { const r = await fetch(APP + gen(i), { headers }); await r.text(); }
  const b = cpu(); base = b - a;
  console.log(`${nombre.padEnd(40)} ${(base * 1000 / N).toFixed(1).padStart(6)} ms de CPU por pedido (${N} pedidos)`);
}
const PREF = { RSC: "1", "Next-Router-Prefetch": "1" };
await tanda("control /top", () => "/top");
await tanda("titulo prefetch", (i) => `/titulo/movie/${40000 + i}`, PREF);
await tanda("persona prefetch", (i) => `/persona/${40000 + i}`, PREF);
await tanda("titulo HTML repetido", () => "/titulo/movie/1001");
await tanda("persona HTML", (i) => `/persona/${41000 + i}`);
await tanda("titulo HTML frío", (i) => `/titulo/movie/${42000 + i}`);
await tanda("api/title repetida", () => "/api/title/movie/2001?providers=n,d,m");
await tanda("api/title fría", (i) => `/api/title/movie/${43000 + i * 41}?providers=n,d,m`);
await tanda("control /top (2)", () => "/top");
