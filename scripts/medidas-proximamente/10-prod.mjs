// Solo GET de lectura contra produccion. Frio vs caliente.
const B = "https://app.yump.ar";
async function medir(nombre, ruta, veces) {
  const ms = [];
  let bytes = 0, n = null, st = 0;
  for (let i = 0; i < veces; i++) {
    const t = performance.now();
    const r = await fetch(B + ruta, { cache: "no-store" });
    const txt = await r.text();
    ms.push(performance.now() - t);
    bytes = txt.length; st = r.status;
    try { n = JSON.parse(txt).items?.length; } catch {}
  }
  const s = [...ms].sort((a, b) => a - b);
  console.log(`${nombre.padEnd(34)} 1ra=${ms[0].toFixed(0).padStart(5)}ms  luego: mediana=${s[Math.floor(s.length/2)].toFixed(0).padStart(4)}  min=${s[0].toFixed(0).padStart(4)}  max=${s.at(-1).toFixed(0).padStart(5)}  [${st}] items=${n} ${(bytes/1024).toFixed(1)}KB`);
  console.log(`   todas: ${ms.map(x=>x.toFixed(0)).join(", ")}`);
}
console.log("=== PRODUCCION (solo lectura) ===\n");
await medir("upcoming mix=1 limit=15", "/api/upcoming?mix=1&limit=15", 8);
console.log();
await medir("upcoming limit=100 (proximamente)", "/api/upcoming?limit=100", 5);
console.log();
await medir("upcoming mediaType=movie limit=100", "/api/upcoming?mediaType=movie&limit=100", 4);
console.log();
await medir("health (referencia de cold start)", "/api/health", 4);
console.log();
await medir("home (el resto de los rieles)", "/api/home", 3);
