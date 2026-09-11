// La LÍNEA BASE de la Etapa 0 sobre el banco aislado. No es una prueba de
// carga ni mide capacidad de Producción: registra el comportamiento actual
// bajo condiciones declaradas, con los dobles como árbitros externos.
//
//   node scripts/banco/correr.mjs <ruta-del-log-de-next> [salida.json]
//
// Requiere: `node scripts/banco/dobles.mjs` corriendo, y la app en
// http://127.0.0.1:3000 construida y arrancada con el entorno del banco
// (ver docs/medidas/2026-09-11-etapa0-medir.md). El log de `next start` es de
// donde se leen las líneas `[home]`: la app no expone sus métricas por HTTP —
// a propósito, la Etapa 0 no cambia el contrato de la API—.
//
// Cada escenario devuelve TRES fuentes que tienen que coincidir:
//   - lo que el corredor vio (estado HTTP, latencia de pared, forma del payload);
//   - lo que la app dice que hizo (su línea `[home]`);
//   - lo que cada doble recibió (sus contadores).
// Si la app dice N llamadas a TMDB y el doble recibió otra cosa, el instrumento
// está roto y no hay nada que interpretar (docs/MANTENIMIENTO.md 8.b).
import { readFileSync, writeFileSync } from "node:fs";

const APP = process.env.BANCO_APP ?? "http://127.0.0.1:3000";
const DOBLES = { tmdb: "http://127.0.0.1:4801", supabase: "http://127.0.0.1:4802", redis: "http://127.0.0.1:4803" };
const LOG = process.argv[2];
const SALIDA = process.argv[3] ?? "docs/medidas/2026-09-11-etapa0-linea-base.json";
if (!LOG) { console.error("uso: node scripts/banco/correr.mjs <log de next start> [salida.json]"); process.exit(2); }

// ----------------------------------------------------------------- control de los dobles
const control = async (d, ruta, cuerpo) => (await fetch(`${DOBLES[d]}/__banco/${ruta}`, cuerpo ? { method: "POST", body: JSON.stringify(cuerpo) } : {})).json();
const estados = async () => Object.fromEntries(await Promise.all(Object.keys(DOBLES).map(async (d) => [d, await control(d, "estado")])));
const configurar = (d, c) => control(d, "config", c);
const sanos = async () => { for (const d of Object.keys(DOBLES)) await configurar(d, { modo: "ok", latenciaMs: 0 }); };
const resetear = async (...ds) => { for (const d of ds) await control(d, "reset"); };

// ----------------------------------------------------------------- el log de la app
let leido = 0;
function lineasNuevas() {
  const todo = readFileSync(LOG, "utf8");
  const nuevas = todo.slice(leido).split("\n").filter((l) => l.startsWith("[home]") || l.startsWith("[cache]") || l.startsWith("[tmdb]"));
  leido = todo.length;
  return nuevas;
}
// La línea `[home] Nms total | …` a números, campo por campo.
function parsearLinea(l) {
  const n = (re) => { const m = l.match(re); return m ? Number(m[1]) : null; };
  const s = (re) => { const m = l.match(re); return m ? m[1] : null; };
  return {
    msTotal: n(/^\[home\] (\d+)ms total/), cache: s(/cache (HIT|MISS|\?)/),
    composiciones: n(/(\d+) composici/), esperasCompartidas: n(/(\d+) esperas? compartida/),
    degradado: /DEGRADADO/.test(l), fuentesCaidas: n(/DEGRADADO \((\d+) fuente/),
    tmdb: { llamadas: n(/tmdb (\d+) llamadas/), ok: n(/tmdb \d+ llamadas \((\d+) ok/), x429: n(/(\d+) x429/), x5xx: n(/(\d+) x5xx/), red: n(/tmdb[^|]*?(\d+) red\)/), ms: n(/tmdb [^|]*\) (\d+)ms/) },
    supabase: { consultas: n(/supabase (\d+) consultas/), ok: n(/supabase \d+ consultas \((\d+) ok/), http: n(/supabase[^|]*?(\d+) http/), red: n(/supabase[^|]*?(\d+) red\)/), ms: n(/supabase [^|]*\) (\d+)ms/) },
    redis: {
      modo: /redis\(memoria\)/.test(l) ? "memoria" : "redis",
      llamadasLogicas: n(/redis(?:\(memoria\))? (\d+) llamadas/), intentosHttp: n(/(\d+) intentos http/), comandos: n(/(\d+) comandos/),
      claves: n(/(\d+) claves/), hits: n(/\((\d+) hit/), misses: n(/(\d+) miss\)/),
      fallosLectura: n(/(\d+) fallo\(s\) lectura/), fallosEscritura: n(/(\d+) fallo\(s\) escritura/),
      ms: n(/(?:miss\)[^|]*|escritura) \| (\d+)ms \| lotes/), lotes: s(/lotes: (.+)$/),
    },
  };
}

// ----------------------------------------------------------------- pedir a la app
async function pedir(query, veces = 1) {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: veces }, async () => {
    const t = Date.now();
    try {
      const r = await fetch(`${APP}/api/home?${query}`, { signal: AbortSignal.timeout(180000) });
      const j = await r.json().catch(() => null);
      return { estado: r.status, ms: Date.now() - t, hero: j?.hero?.length ?? null, rails: j?.rails?.length ?? null, degradado: j?.degradado ?? null, fallos: j?.fallos ?? null, sinPlataformas: j?.sinPlataformas ?? null };
    } catch (e) { return { estado: null, ms: Date.now() - t, error: String(e) }; }
  }));
  return { respuestas: rs, msPared: Date.now() - t0 };
}

const delta = (a, b) => ({
  tmdb: b.tmdb.cuenta.peticiones - a.tmdb.cuenta.peticiones,
  tmdbPorFamilia: Object.fromEntries(Object.entries(b.tmdb.cuenta.porFamilia).map(([k, v]) => [k, v - (a.tmdb.cuenta.porFamilia[k] ?? 0)]).filter(([, v]) => v)),
  tmdbDesconocidas: b.tmdb.cuenta.desconocidas.slice(a.tmdb.cuenta.desconocidas.length),
  supabase: b.supabase.cuenta.peticiones - a.supabase.cuenta.peticiones,
  redisHttp: b.redis.cuenta.peticiones - a.redis.cuenta.peticiones,
  redisComandos: b.redis.comandos.total - a.redis.comandos.total,
  redisPorComando: Object.fromEntries(Object.entries(b.redis.comandos.porComando).map(([k, v]) => [k, v - (a.redis.comandos.porComando[k] ?? 0)]).filter(([, v]) => v)),
  redisClaves: b.redis.claves,
});

const resultados = [];
async function escenario(id, titulo, query, veces, preparar) {
  await sanos();
  if (preparar) await preparar();
  lineasNuevas(); // descarta lo anterior
  const antes = await estados();
  const r = await pedir(query, veces);
  // La app escribe la línea después de responder: un respiro para leerla.
  await new Promise((res) => setTimeout(res, 400));
  const despues = await estados();
  const lineas = lineasNuevas();
  const home = lineas.filter((l) => /^\[home\] \d+ms total/.test(l)).map(parsearLinea);
  const salida = { id, titulo, query, veces, ...r, lineas, home, dobles: delta(antes, despues) };
  resultados.push(salida);
  const h = home[0];
  console.log(`\n== ${id} ${titulo}\n   ${veces}× ${query} → ${r.respuestas.map((x) => x.estado).join(",")} en ${r.msPared}ms de pared`);
  for (const x of home) console.log(`   app: cache ${x.cache} | comp ${x.composiciones} | tmdb ${x.tmdb.llamadas} (${x.tmdb.ok} ok) | supabase ${x.supabase.consultas} | redis ${x.redis.llamadasLogicas}/${x.redis.intentosHttp}/${x.redis.comandos} (${x.redis.hits} hit/${x.redis.misses} miss)${x.degradado ? " | DEGRADADO" : ""}`);
  console.log(`   dobles: tmdb ${salida.dobles.tmdb} | supabase ${salida.dobles.supabase} | redis http ${salida.dobles.redisHttp} / comandos ${salida.dobles.redisComandos} ${JSON.stringify(salida.dobles.redisPorComando)}`);
  if (!h) console.log("   ⚠️ sin línea [home] en el log");
  return salida;
}

// ----------------------------------------------------------------- CONTROLES PREVIOS
// ¿La app habla con los dobles y no con otra cosa? Antes de medir nada: el
// doble de TMDB tiene que estar en cero y una petición tiene que moverlo.
await sanos();
await resetear("tmdb", "supabase", "redis");
const cero = await estados();
if (cero.tmdb.cuenta.peticiones !== 0) throw new Error("el doble de TMDB no arrancó en cero");

const NDM = "providers=n,d,m";
await escenario("C0", "control: la app habla con los dobles (TMDB y Redis se mueven desde cero)", NDM, 1);
const c0 = resultados.at(-1);
if (!c0.dobles.tmdb || !c0.dobles.redisHttp) throw new Error("la app no está hablando con los dobles: no hay nada que medir");
if (c0.home[0]?.tmdb.llamadas !== c0.dobles.tmdb) console.log(`   🔴 la app dice ${c0.home[0]?.tmdb.llamadas} llamadas a TMDB y el doble recibió ${c0.dobles.tmdb}`);

// ----------------------------------------------------------------- LÍNEA BASE
await escenario("B1", "Home FRÍO, una solicitud", NDM, 1, () => resetear("redis"));
await escenario("B1b", "control de repetibilidad: el mismo Home frío otra vez", NDM, 1, () => resetear("redis"));
await escenario("B2", "Home CALIENTE, una solicitud (clave ya guardada por B1b)", NDM, 1);
await escenario("B3", "5 solicitudes IGUALES con caché fría (comportamiento actual, sin single-flight)", NDM, 5, () => resetear("redis"));
await escenario("B4a", "variante equivalente: mismo conjunto en otro orden (d,m,n) → tiene que ser HIT de B3", "providers=d,m,n", 1);
await escenario("B4b", "variante distinta: n,d → otra clave, rearma", "providers=n,d", 1);
await escenario("B4c", "variante por toggle: n,d,m con t=accion:tv → otra clave, rearma", "providers=n,d,m&t=accion:tv", 1);
await escenario("B4d", "control: n,d,m&t=accion:movie (el default) → la misma clave que B3, HIT", "providers=n,d,m&t=accion:movie", 1);

// ----------------------------------------------------------------- FALLOS Y RECUPERACIÓN
// Cada fallo usa una combinación de plataformas propia para no depender de lo
// que dejó guardado el escenario anterior; la recuperación vuelve a pedir la
// misma y tiene que rearmar (el degradado no se guardó) y guardar.
await escenario("F1", "TMDB responde 500: el Home sale DEGRADADO y no se guarda", "providers=n,d,m,p", 1, async () => { await resetear("redis"); await configurar("tmdb", { modo: "500" }); });
await escenario("F1r", "TMDB vuelve: la misma clave rearma y guarda", "providers=n,d,m,p", 1);
await escenario("F1h", "…y la siguiente es HIT", "providers=n,d,m,p", 1);
await escenario("F2", "TMDB responde 429 con Retry-After", "providers=n,d,m,at", 1, async () => { await resetear("redis"); await configurar("tmdb", { modo: "429", retryAfter: 2 }); });
await escenario("F3", "TMDB CAÍDO (corta el socket): fallos de red", "providers=n,d,m,cr", 1, async () => { await resetear("redis"); await configurar("tmdb", { modo: "caido" }); });
await escenario("F3r", "TMDB vuelve", "providers=n,d,m,cr", 1);
await escenario("F4", "Supabase CAÍDO con TMDB sano", "providers=n,d,m,pp", 1, async () => { await resetear("redis"); await configurar("supabase", { modo: "caido" }); });
await escenario("F4r", "Supabase vuelve", "providers=n,d,m,pp", 1);
await escenario("F5", "Redis CAÍDO (corta el socket): el SDK reintenta; el Home se entrega igual", "providers=n,d,m,mb", 1, async () => { await resetear("redis"); await configurar("redis", { modo: "caido" }); });
await escenario("F5r", "Redis vuelve: rearma y guarda", "providers=n,d,m,mb", 1);
await escenario("F5h", "…y la siguiente es HIT", "providers=n,d,m,mb", 1);
await escenario("F6", "Redis responde 500 (respuesta HTTP de error: el SDK NO reintenta)", "providers=n,d,m,un", 1, async () => { await resetear("redis"); await configurar("redis", { modo: "500" }); });
await escenario("L1", "latencia declarada: TMDB +100 ms por llamada, Home frío", "providers=n,d,m,vx", 1, async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 100 }); });

await sanos();
writeFileSync(SALIDA, JSON.stringify({ fecha: new Date().toISOString(), app: APP, dobles: DOBLES, resultados }, null, 2));
console.log(`\nguardado en ${SALIDA}`);
