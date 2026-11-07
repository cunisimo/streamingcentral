// Tabla compacta: producción contra código final. Sólo lee resultados.
import { readFileSync, existsSync } from "node:fs";
const J = (f) => JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url)));
const p = J("flujos-produccion.json"), f = new Map(J("flujos-finalTM.json").map((x) => [x.caso, x]));
const col = (x) => [x.cmd, x.MGET, x.SET, x.claves, x.loteMax, x.tmdb, x.supabase].join("/");
console.log("caso | cmd/MGET/SET/claves/loteMax/tmdb/supabase prod | final");
for (const x of p) { const y = f.get(x.caso); if (x.cmd !== y.cmd || /Home|lista|búsqueda|últimos|categor/.test(x.caso)) console.log(x.caso.slice(0, 48).padEnd(48), col(x).padEnd(26), col(y)); }
const t = p.reduce((a, x) => a + x.tmdb, 0), t2 = p.reduce((a, x) => a + f.get(x.caso).tmdb, 0);
console.log("TMDB total", t, t2, "casos con TMDB distinto:", p.filter((x) => x.tmdb !== f.get(x.caso).tmdb).map((x) => `${x.caso} ${x.tmdb}->${f.get(x.caso).tmdb}`).join("; "));
const iguales = p.filter((x) => x.cmd === f.get(x.caso).cmd).length; console.log("casos con cmd igual", iguales, "de", p.length);
console.log("\nsimultáneos");
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
for (const e of ["produccion", "finalTM", "finalTMB"]) for (const s of J(`simult-${e}.json`)) console.log(e.padEnd(11), s.n.padEnd(15), s.modo.padEnd(18), "cmd", s.cmd, JSON.stringify(s.rangoCmd), "MGET", s.MGET, "SET", s.SET, "tmdb", s.tmdb, "ms", s.ms, "h", s.h.join(","));
console.log("\nescalonado/disperso");
for (const e of ["produccion", "finalTM", "finalTMB"]) { const n = `disperso-${e}.json`; console.log(e, existsSync(new URL(`./${n}`, import.meta.url)) ? JSON.stringify(J(n)).slice(0, 400) : "sin archivo"); }
console.log("\nnavegador");
const a = J("nav-final-produccion.json"), b = J("nav-final-finalTM.json");
console.log("errores", a.errores?.length, b.errores?.length, JSON.stringify(b.errores ?? []).slice(0, 300));
console.log("campos", Object.keys(a.filas[0]).join(","));
console.log("pasos", a.filas.length, b.filas.length);
let dif = 0;
a.filas.forEach((x, i) => { const y = b.filas[i]; const hx = x.hash ?? x.h, hy = y?.hash ?? y?.h; if (hx !== hy) { dif++; console.log("DIF", JSON.stringify(x).slice(0, 200), "||", JSON.stringify(y).slice(0, 200)); } });
console.log("pasos con hash distinto", dif);
for (const y of b.filas) console.log(JSON.stringify(y).slice(0, 190));
