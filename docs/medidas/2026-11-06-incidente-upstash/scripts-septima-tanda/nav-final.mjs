// Recorridos de usuario en Chrome sin ventana, sólo contra localhost y con perfil temporal. node nav-final.mjs <etiqueta>
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const et = process.argv[2];
const DIR = new URL(`./nav-final/${et}/`, import.meta.url); mkdirSync(DIR, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const perfil = mkdtempSync(join(tmpdir(), "yump-nav-"));
const PUERTO = 9334;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, "--window-size=412,900", "about:blank"], { stdio: "ignore" });
let pagina;
for (let i = 0; i < 40 && !pagina; i++) { await dormir(250); try { pagina = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()).find((x) => x.type === "page"); } catch {} }
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let n = 0; const pend = new Map(); const errores = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails?.text); };
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem("sc:platforms",JSON.stringify(["n","d","m"]));localStorage.setItem("yump:onboarding","1")}catch{}` });
await cdp("Emulation.setDeviceMetricsOverride", { width: 412, height: 900, deviceScaleFactor: 1, mobile: false });
const esperar = (sel, ms = 25000) => ev(`(async()=>{const f=Date.now()+${ms};while(Date.now()<f&&!document.querySelector(${JSON.stringify(sel)}))await new Promise(r=>setTimeout(r,150));return !!document.querySelector(${JSON.stringify(sel)})})()`);
const bajarTodo = () => ev(`(async()=>{for(let i=0;i<30;i++){window.scrollBy(0,500);await new Promise(r=>setTimeout(r,120))}return scrollY})()`);
const BASE = "http://127.0.0.1:3141";
const ir = async (u, sel) => { await cdp("Page.navigate", { url: BASE + u }); const ok = await esperar(sel); await dormir(1800); return ok; };
const foto = async (nombre) => { const r = await cdp("Page.captureScreenshot", { format: "png" }); writeFileSync(new URL(`${nombre}.png`, DIR), Buffer.from(r.result.data, "base64")); };
const estado = () => ev(`(()=>{const q=(s)=>document.querySelectorAll(s).length;const txt=(document.querySelector("main")||document.body).innerText.replace(/\\s+/g," ").trim();
  return {ruta:location.pathname+location.search,scrollY:Math.round(scrollY),tarjetas:q("a.card-link"),obras:q(".filmo-obra"),reparto:q("a.cast-card"),logos:q("img[alt],svg.platform-logo,[class*=platform]"),trailer:q("iframe[src*=youtube],[class*=trailer]"),ver:[...document.querySelectorAll("a[href*=themoviedb]")].length,verMas:q(".filmo-mas button"),error:/No pudimos|Algo salió mal|Reintentar/.test(txt),txt,orden:[...document.querySelectorAll("a.card-link")].map(a=>a.getAttribute("href"))}})()`);
const filas = [];
async function paso(nombre, fn, sel) {
  await t(3141, "?reset"); await t(4804, "?reset"); await t(4805, "?reset");
  const t0 = performance.now(); const extra = await fn(); const ms = Math.round(performance.now() - t0);
  await dormir(1500);
  const l = await t(3141), r = await t(4804), m = await t(4805);
  const api = {}; for (const x of l) if (x.p.startsWith("/api/")) { const k = x.p.split("?")[0].replace(/\/\d+/g, "/#"); api[k] = (api[k] ?? 0) + 1; }
  const e = await estado();
  const h = createHash("sha256").update(e.txt + "|" + e.orden.join(",")).digest("hex").slice(0, 10);
  writeFileSync(new URL(`${nombre.replace(/[^a-zA-Z0-9]+/g, "_")}.txt`, DIR), e.txt + "\n" + e.orden.join("\n"));
  const f = { et, paso: nombre, ruta: e.ruta, scrollY: e.scrollY, tarjetas: e.tarjetas, obras: e.obras, reparto: e.reparto, trailer: e.trailer, ver: e.ver, verMas: e.verMas, error: e.error, api, home: api["/api/home"] ?? 0, cmd: r.comandos, tmdb: m.total, h, extra };
  filas.push(f); console.log(`${et.padEnd(11)} ${nombre.padEnd(36)} tarj=${String(e.tarjetas).padEnd(4)} obras=${String(e.obras).padEnd(3)} trailer=${e.trailer} ver=${e.ver} err=${e.error} /api/home=${f.home} cmd=${String(r.comandos).padEnd(5)} tmdb=${String(m.total).padEnd(5)} scroll=${e.scrollY} ${h}`);
}
await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
// Home → ficha → volver: el recorrido del síntoma, por separado.
await paso("Home, primera carga", () => ir("/", "a.card-link"));
await foto("home");
await ev("window.scrollTo(0,1400)"); await dormir(800);
await paso("Home → abrir ficha", async () => { const h = await ev(`(()=>{const a=[...document.querySelectorAll("a.card-link")].find(a=>{const r=a.getBoundingClientRect();return r.top>0&&r.top<800&&a.getAttribute("href").startsWith("/titulo")});const h=a?.getAttribute("href");a?.click();return h})()`); await esperar("a.cast-card"); return h; });
await paso("ficha → volver al Home", async () => { await ev("history.back()"); await esperar("a.card-link"); });
await paso("Home → abrir ficha, 2.ª vez", async () => { const h = await ev(`(()=>{const a=[...document.querySelectorAll("a.card-link")].find(a=>a.getAttribute("href").startsWith("/titulo"));const h=a?.getAttribute("href");a?.click();return h})()`); await esperar("a.cast-card"); return h; });
await paso("ficha → volver al Home, 2.ª vez", async () => { await ev("history.back()"); await esperar("a.card-link"); });
// Fichas.
for (const [n, u] of [["ficha con AR", "/titulo/movie/20001"], ["ficha sin AR con evidencia", "/titulo/movie/905001"], ["ficha sin AR ni tráiler", "/titulo/movie/905002"], ["ficha mezclada", "/titulo/movie/40001"], ["ficha serie sin AR", "/titulo/tv/905003"]]) {
  await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
  await paso(`${n}, fría`, async () => { await ir(u, "a.cast-card"); await bajarTodo(); });
  await paso(`${n}, caliente`, async () => { await ir(u, "a.cast-card"); await bajarTodo(); });
  if (n === "ficha sin AR con evidencia") { await ev("window.scrollTo(0,0)"); await dormir(200); await foto("ficha-sin-ar"); }
  await fetch("http://127.0.0.1:4813/__banco/redis", { method: "POST", body: JSON.stringify({ accion: "borrar", patron: "^(disp|ed):" }) });
  await paso(`${n}, 5 min vencidos`, async () => { await ir(u, "a.cast-card"); await bajarTodo(); });
}
// Fallo parcial de TMDB en la ficha.
await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
await fetch(`http://127.0.0.1:4805/__falla?re=${encodeURIComponent("^/movie/90004[15]/watch/providers$")}&status=500`);
await paso("ficha sin AR, fallo parcial TMDB", async () => { await ir("/titulo/movie/905001", "a.cast-card"); await bajarTodo(); });
await fetch("http://127.0.0.1:4805/__falla?limpiar=1");
await paso("ficha sin AR, recuperada", async () => { await ir("/titulo/movie/905001", "a.cast-card"); await bajarTodo(); });
// Persona y «Ver más».
for (const [n, id] of [["persona sin AR", 906001], ["persona con AR", 30000]]) {
  await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
  await paso(`${n}, abrir`, async () => { await ir(`/persona/${id}`, ".filmo-obra"); await bajarTodo(); });
  await foto(n.replace(/ /g, "-"));
  await paso(`${n}, Ver más 1`, async () => { await ev(`document.querySelector(".filmo-mas button")?.click()`); await dormir(2500); await bajarTodo(); });
  await paso(`${n}, Ver más 2`, async () => { await ev(`document.querySelector(".filmo-mas button")?.click()`); await dormir(2500); await bajarTodo(); });
}
// Listas y búsqueda.
for (const [n, u] of [["últimos", "/lista/ultimos"], ["miniseries", "/lista/miniseries"], ["categoría", "/categoria/accion"]]) {
  await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
  await paso(`${n}, fría`, async () => { await ir(u, "a.card-link"); await bajarTodo(); });
  await paso(`${n}, caliente`, async () => { await ir(u, "a.card-link"); await bajarTodo(); });
}
await fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
await paso("búsqueda", async () => { await cdp("Page.navigate", { url: `${BASE}/buscar` }); await esperar("input"); await dormir(800); await ev(`document.querySelector("input").focus()`); await cdp("Input.insertText", { text: "accion" }); await esperar("a.card-link"); await dormir(2000); });
await foto("busqueda");
writeFileSync(new URL(`./nav-final-${et}.json`, import.meta.url), JSON.stringify({ filas, errores }, null, 1));
console.log("excepciones JS:", errores.length, errores.slice(0, 3));
ws.close(); chrome.kill(); await dormir(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
process.exit(0);
