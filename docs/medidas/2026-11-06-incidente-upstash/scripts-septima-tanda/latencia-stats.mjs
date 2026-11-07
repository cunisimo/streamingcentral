// Mediana, dispersión y diferencia pareada con intervalo bootstrap del 95 %. node latencia-stats.mjs <archivo> <base> [comparadas...]
import { readFileSync } from "node:fs";
const [archivo, base, ...otras] = process.argv.slice(2);
const filas = JSON.parse(readFileSync(archivo, "utf8"));
const orden = (a) => [...a].sort((x, y) => x - y);
const cuantil = (a, q) => { const s = orden(a); const p = (s.length - 1) * q; const i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
let semilla = 7;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 2 ** 32; };
const boot = (d) => { const m = []; for (let i = 0; i < 4000; i++) m.push(cuantil(Array.from({ length: d.length }, () => d[Math.floor(azar() * d.length)]), 0.5)); return [cuantil(m, 0.025), cuantil(m, 0.975)]; };
const R = Math.round;
for (const f of filas) {
  console.log(`\n${f.n} (n=${f.rondas})${Object.keys(f.noOk ?? {}).length ? " NO-200 " + JSON.stringify(f.noOk) : ""}`);
  for (const [n, v] of Object.entries(f.r)) console.log(`  ${n.padEnd(16)} mediana=${String(R(cuantil(v, .5))).padStart(5)} RIC=${R(cuantil(v, .25))}–${R(cuantil(v, .75))} p10–p90=${R(cuantil(v, .1))}–${R(cuantil(v, .9))}`);
  for (const n of otras.length ? otras : Object.keys(f.r).filter((x) => x !== base)) {
    if (!f.r[n] || !f.r[base]) continue;
    const d = f.r[n].map((x, i) => x - f.r[base][i]); const [a, b] = boot(d);
    const positivas = d.filter((x) => x > 0).length;
    console.log(`  ${n} − ${base}: mediana ${R(cuantil(d, .5))} ms, IC95 ${R(a)}…${R(b)}, ${positivas}/${d.length} rondas más lentas${a > 0 || b < 0 ? "  ◄ distinto de 0" : ""}`);
  }
}
