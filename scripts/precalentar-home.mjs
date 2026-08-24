#!/usr/bin/env node
// Precalentamiento DELIBERADO del Home en el Redis de produccion.
//
//   node scripts/precalentar-home.mjs --base=https://…  [--aplicar]
//        [--combos=n,d,m|n|d|m|n,d] [--espera=3000]
//
// PARA QUE. La tanda 2 cambia la huella de las once familias de claves, asi que
// el primer request despues del deploy encuentra el cache vacio y paga ~650
// llamadas a TMDB y ~650 comandos de Upstash. Sin esto, el que paga esa cuenta
// es el primer usuario que abre la app, y con la combinacion de plataformas que
// tenga. Con esto la paga esta corrida, en el momento elegido.
//
// CUANDO. DESPUES de aprobar el Preview aislado y ANTES de poner es-MX en
// Production. Nunca antes: precalentar con la configuracion vieja llena el
// espacio de claves equivocado, y precalentar desde un Preview que comparte el
// Redis de produccion es exactamente la trampa que docs/MANTENIMIENTO.md manda
// evitar (arruina la medicion del arranque frio).
//
// TRES REGLAS, y las tres estan implementadas aca, no confiadas al operador:
//
//   1. EXPLICITO. Sin --aplicar no pide nada: lista lo que haria y sale. Igual
//      que el backfill de la tanda 3.
//   2. SECUENCIAL. Una combinacion por vez, con espera entre medio. En paralelo
//      son 650 llamadas a TMDB por combinacion arrancando juntas, y TMDB se
//      degrada bajo concurrencia: medido, empieza a devolver 502 en
//      /watch/providers (docs/medidas/2026-08-23-idioma-tanda2-e2e.json).
//      Un precalentamiento que dispara 502s guarda... nada, y de paso le
//      arruina el Home a quien este mirando.
//   3. RECHAZA LO DEGRADADO. Si el payload viene con degradado=true o fallos>0,
//      esa combinacion NO quedo cacheada —`cachedIf` no guarda un payload
//      degradado, a proposito— asi que se marca como fallida y el script
//      termina con codigo distinto de cero. Un precalentamiento que informa
//      exito habiendo servido rieles caidos es peor que no correrlo: deja creer
//      que el cache esta lleno cuando esta vacio.
//
// NO toca la base, no escribe archivos y no necesita credenciales: pega contra
// la app publica, que es la que decide que cachear.
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);

const BASE = typeof args.base === "string" ? args.base.replace(/\/$/, "") : null;
if (!BASE) {
  console.error("falta --base=https://tu-app  (la URL de produccion, sin barra final)");
  process.exit(2);
}
const APLICAR = args.aplicar === true;
const ESPERA = Number(args.espera) || 3000;

// Las combinaciones a precalentar. El default son las que el dueño acordo como
// las mas comunes; se pisan con --combos=a|b|c (barra vertical entre combos,
// coma entre plataformas de un mismo combo).
//
// OJO: la clave del Home ORDENA las plataformas, asi que "n,d,m" y "m,d,n" son
// la misma entrada. Y NO incluye los toggles Peliculas/Series: cada toggle es
// otra clave y otro rearmado. Precalentar el estado base es lo que se puede
// hacer; cubrir los toggles serian cientos de combinaciones.
const COMBOS_POR_DEFECTO = ["n", "d", "m", "n,d", "n,m", "d,m", "n,d,m"];
const combos = (typeof args.combos === "string" ? args.combos.split("|") : COMBOS_POR_DEFECTO)
  .map((c) => c.split(",").map((s) => s.trim()).filter(Boolean).sort().join(","))
  .filter(Boolean);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function calentar(combo) {
  const url = `${BASE}/api/home?providers=${encodeURIComponent(combo)}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  const ms = Date.now() - t0;
  if (!res.ok) return { combo, ok: false, ms, motivo: `HTTP ${res.status}` };
  const payload = await res.json();
  if (payload.degradado || payload.fallos > 0) {
    return { combo, ok: false, ms, motivo: `degradado (fallos: ${payload.fallos})` };
  }
  const rieles = (payload.rails ?? []).length;
  const titulos = (payload.hero ?? []).length
    + (payload.rails ?? []).reduce((a, r) => a + (r.items?.length ?? 0), 0);
  return { combo, ok: true, ms, rieles, titulos };
}

async function main() {
  console.log(`base:    ${BASE}`);
  console.log(`combos:  ${combos.join("  |  ")}`);
  console.log(`espera:  ${ESPERA} ms entre combinaciones\n`);

  if (!APLICAR) {
    console.log("DRY-RUN: no se pidio nada. Agregar --aplicar para precalentar de verdad.");
    console.log(`Serian ${combos.length} requests secuenciales a /api/home.`);
    console.log("Antes de correrlo con --aplicar, confirmar que Production ya esta en es-MX:");
    console.log("  - GET /api/health  ->  cache: redis");
    console.log("  - en los logs, la clave del Home tiene que decir es-MX+f.r1");
    return 0;
  }

  const resultados = [];
  for (const [i, combo] of combos.entries()) {
    process.stdout.write(`[${i + 1}/${combos.length}] ${combo.padEnd(10)} `);
    let r;
    try {
      r = await calentar(combo);
    } catch (e) {
      r = { combo, ok: false, ms: 0, motivo: String(e) };
    }
    resultados.push(r);
    console.log(r.ok
      ? `OK   ${r.ms} ms   ${r.rieles} rieles   ${r.titulos} titulos`
      : `FALLA  ${r.motivo}`);
    // Se corta al primer fallo: si TMDB se esta degradando, seguir empeora las
    // que faltan y llena el log de ruido.
    if (!r.ok) {
      console.error("\nSE CORTA ACA. Un payload degradado NO se cachea, asi que esta");
      console.error("combinacion sigue en frio. Esperar y volver a correr el script:");
      console.error("las que ya quedaron calientes van a responder en milisegundos.");
      break;
    }
    if (i < combos.length - 1) await dormir(ESPERA);
  }

  const ok = resultados.filter((r) => r.ok).length;
  console.log(`\n${ok}/${combos.length} combinaciones precalentadas.`);
  if (ok !== combos.length) return 1;

  // Verificacion: una segunda vuelta tiene que ser inmediata. Si no lo es, no
  // quedo cacheado y el "exito" de arriba era falso.
  console.log("\nVerificando que hayan quedado en el cache (segunda vuelta):");
  let lento = 0;
  for (const combo of combos) {
    const r = await calentar(combo);
    const veredicto = r.ok && r.ms < 1500 ? "cacheado" : "NO parece cacheado";
    if (veredicto !== "cacheado") lento++;
    console.log(`  ${combo.padEnd(10)} ${String(r.ms).padStart(6)} ms   ${veredicto}`);
  }
  if (lento) {
    console.error(`\n${lento} combinacion(es) no respondieron desde el cache.`);
    return 1;
  }
  console.log("\nListo: todas responden desde el cache.");
  return 0;
}

process.exit(await main());
