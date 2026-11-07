// La misma navegación en un Chrome sin ventana, sólo contra localhost y con perfil temporal.
// node nav.mjs <etiqueta> <ancho> [ua]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [etiqueta, ancho = "412", ua] = process.argv.slice(2);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const perfil = mkdtempSync(join(tmpdir(), "yump-nav-"));
const PUERTO = 9333;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, `--window-size=${ancho},900`, "--no-first-run", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: "ignore" });
let pagina;
for (let i = 0; i < 40 && !pagina; i++) { await dormir(250); try { pagina = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()).find((x) => x.type === "page"); } catch {} }
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let n = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp("Page.enable"); await cdp("Runtime.enable");
if (ua) await cdp("Emulation.setUserAgentOverride", { userAgent: ua });
await cdp("Emulation.setDeviceMetricsOverride", { width: Number(ancho), height: 900, deviceScaleFactor: 1, mobile: false });
const esperar = (sel) => ev(`(async()=>{for(let i=0;i<60&&!document.querySelector(${JSON.stringify(sel)});i++)await new Promise(r=>setTimeout(r,250));return !!document.querySelector(${JSON.stringify(sel)})})()`);
const bajar = () => ev(`(async()=>{for(let i=0;i<14;i++){window.scrollBy(0,350);await new Promise(r=>setTimeout(r,250))}return scrollY})()`);
const clic = (sel) => ev(`(()=>{const a=document.querySelector(${JSON.stringify(sel)});if(!a)return null;const h=a.getAttribute("href");a.click();return h})()`);
const ruta = (p) => p.replace(/\/\d+/g, "/#").replace(/\/(movie|tv)\//, "/{t}/");
async function paso(nombre, fn) {
  await t(3141, "?reset"); await t(4804, "?reset"); await t(4805, "?reset");
  const extra = await fn(); await dormir(2200);
  const l = await t(3141), r = await t(4804), m = await t(4805);
  const c = {};
  for (const x of l) { const k = `${ruta(x.p)}${x.prefetch ? "[PRE]" : x.rsc ? "[NAV]" : ""}`; c[k] = (c[k] ?? 0) + 1; }
  const fila = { sha: etiqueta, ancho, ua: ua ? "bot" : "chrome", paso: nombre, extra, ejecuciones: l.length, porRuta: c, comandos: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, tmdb: m.total };
  appendFileSync(new URL("./nav.jsonl", import.meta.url), JSON.stringify(fila) + "\n");
  console.log(`${etiqueta} ${ancho}${ua ? " bot" : ""} ${nombre.padEnd(16)} ejec=${String(l.length).padEnd(3)} cmd=${String(r.comandos).padEnd(4)} tmdb=${String(m.total).padEnd(4)} ${JSON.stringify(c)}`);
}
await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const BASE = "http://127.0.0.1:3141";
await paso("abrir ficha", async () => { await cdp("Page.navigate", { url: `${BASE}/titulo/movie/2666` }); await esperar("a.cast-card"); await dormir(1500); });
await paso("bajar ficha", bajar);
await paso("ir a persona", async () => { await ev("window.scrollTo(0,0)"); await dormir(400); const h = await clic("a.cast-card"); await esperar("a.card-link"); await dormir(1500); return h; });
await paso("bajar persona", bajar);
await paso("ir a otra ficha", async () => { await ev("window.scrollTo(0,0)"); await dormir(400); const h = await clic("a.card-link"); await esperar("a.cast-card"); await dormir(1500); return h; });
await paso("bajar ficha 2", bajar);
ws.close(); chrome.kill();
await dormir(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
process.exit(0);
