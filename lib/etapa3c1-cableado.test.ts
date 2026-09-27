// El cableado de la Etapa 3.c.1 (pausa compartida ante 429 y plazos absolutos),
// fijado sobre el FUENTE (diseño §40.5, §41.4, §46.5, §47.4, §48.4, §49-§52).
// `lib/home.ts`, `lib/cache.ts` y `lib/tmdb.ts` son `server-only` y no se
// importan desde `node --test`: lo que se fija acá es que cada pieza pura
// (probada aparte) esté enchufada donde el diseño dice, que el kill switch
// exista, que el plazo nazca con la señal y que no quede ningún reloj local
// decidiendo presupuesto. Escrito ANTES del cableado: fallaba en cada punto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CONSTANTES } from "./home-servir.ts";
import { LUA_PAUSA } from "./pausa-lua.ts";
import { CONSTANTES_PAUSA } from "./tmdb-pausa.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8").replace(/\r/g, "");
const codigo = (rel: string) => leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const cuenta = (s: string, re: RegExp) => (s.match(re) ?? []).length;

function archivosFuente(dirs: string[]): string[] {
  const out: string[] = [];
  const recorrer = (rel: string) => {
    for (const e of fs.readdirSync(path.join(raiz, rel), { withFileTypes: true })) {
      const hijo = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") recorrer(hijo); continue; }
      if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith(".d.ts")) out.push(hijo);
    }
  };
  for (const d of dirs) recorrer(d);
  return out.sort();
}

// ----------------------------------------------------------------- Redis: las primitivas reales
test("🔴 lib/cache.ts enchufa TOMAR en las primitivas del turno y las cuatro de la pausa; el lector usa un cliente APARTE con timeout por petición y SIN reintentos", () => {
  const s = codigo("lib/cache.ts");
  assert.match(s, /evalTomar:/, "falta evalTomar en opsTurnoRedis");
  assert.match(s, /LUA_PAUSA/, "los scripts de la pausa salen de lib/pausa-lua.ts");
  assert.match(s, /export const opsPausaHome/, "las primitivas de la pausa se exportan para lib/home.ts y /api/health");
  assert.match(s, /signal: \(\) => plazoRedisActual\(\) \?\? AbortSignal\.timeout\(CONSTANTES_PAUSA\.TIMEOUT_LECTURA_MS\)/, "el lector necesita su timeout propio (§41.2) y, dentro de conPlazoRedis, el plazo compartido (1403ae4)");
  assert.match(s, /retry: \{ retries: 0 \}/, "el lector no reintenta: F_max lo decide lib/tmdb-pausa.ts");
  assert.match(s, /pausaActiva\(process\.env\)/, "el kill switch se decide con la función pura");
  assert.match(s, /export const pausaTmdb/, "la instancia de la pausa del proceso se exporta desde cache.ts");
});

test("🔴 el kill switch es TMDB_PAUSA_429=0 y se decide en lib/tmdb-pausa.ts (puro)", async () => {
  const { pausaActiva } = await import("./tmdb-pausa.ts");
  assert.equal(pausaActiva({}), true, "ausente: encendida");
  assert.equal(pausaActiva({ TMDB_PAUSA_429: "1" }), true);
  assert.equal(pausaActiva({ TMDB_PAUSA_429: "0" }), false);
  assert.match(codigo("lib/tmdb-pausa.ts"), /TMDB_PAUSA_429/);
});

// ----------------------------------------------------------------- TMDB: el nivel 1 y el gancho del lector
test("🔴 lib/tmdb.ts: un 429 registra la pausa; con pausa local vigente la llamada NO sale del semáforo (rechazada); cada permiso concedido le da el gancho al lector", () => {
  const s = codigo("lib/tmdb.ts");
  assert.match(s, /pausaTmdb\.registrar429\(/, "el 429 no registra la pausa");
  assert.ok(cuenta(s, /pausaTmdb\.vigente\(\)/g) >= 2, "la pausa se mira antes de esperar el permiso Y después de obtenerlo (como la señal)");
  assert.match(s, /pausaTmdb\.permiso\(\)/, "el semáforo no avisa al lector");
  assert.match(s, /clase: "rechazada"/, "la llamada que no sale por la pausa es un ErrorTmdb de clase rechazada");
  assert.match(s, /m\.tmdb\.rechazadas \+= 1/, "y se cuenta en la métrica que ya la nombra");
  // El gancho va DESPUÉS de adquirir el permiso (cuenta permisos concedidos, no pedidos).
  assert.ok(s.indexOf("await adquirir();") < s.indexOf("pausaTmdb.permiso()"), "permiso() después de adquirir()");
});

// ----------------------------------------------------------------- el Home: plazo, fondo, pausa, vacío
test("🔴 lib/home.ts: el plazo nace con la señal ANTES de la lectura previa y viaja a servirConTurno con inicioRuta y la pausa; el turno se crea con la pausa según el kill switch", () => {
  const s = codigo("lib/home.ts");
  const iSenal = s.indexOf("AbortSignal.timeout(CONSTANTES.PRESUPUESTO_REQUEST_MS)");
  const iPlazo = s.indexOf("plazo: inicio + CONSTANTES.PRESUPUESTO_REQUEST_MS");
  const iServir = s.indexOf("servirHome(claves.fresca");
  assert.ok(iSenal > 0 && iPlazo > 0 && iServir > 0, "faltan la señal, el plazo o la llamada al vuelo");
  assert.ok(Math.abs(iSenal - iPlazo) < 600 && iPlazo < iServir, "el plazo se crea junto a la señal y antes de la lectura previa (que hace crearVueloHome.servir)");
  assert.equal(cuenta(s, /AbortSignal\.timeout\(CONSTANTES\.PRESUPUESTO_REQUEST_MS\)/g), 1, "UNA señal de 50 s fijos: la de la solicitud; el fondo usa plazoEfectivo − ahora");
  assert.match(s, /plazo: claves\.plazo|plazo: contexto\.plazo|plazo: claves\.plazo,/, "servirConTurno recibe el plazo del contexto del líder");
  assert.match(s, /inicioRuta:/, "servirConTurno recibe inicioRuta");
  assert.match(s, /pausa: pausaTmdb/, "servirConTurno recibe la pausa del proceso");
  assert.match(s, /const CFG_TURNO = pausaActiva\(process\.env\) \? \{ pausa: \{ clave: CLAVES_PAUSA\.pausa \} \} : \{\};/, "el turno usa TOMAR sólo con la pausa encendida");
  assert.match(s, /crearTurno\(opsTurnoHome, CFG_TURNO\)/);
  assert.match(s, /crearTurno\(opsTurnoAcotadoHome, CFG_TURNO\)/, "la readquisición acotada tiene que usar la MISMA configuración de pausa que el turno principal");
  assert.match(s, /reintentarEnMs/, "el vacío de la pausa lleva reintentarEnMs");
});

test("🔴 lib/home.ts: el fondo calcula los DOS plazos con plazosDelFondo al iniciar y crea su señal con el restante efectivo; pasa plazoEfectivo a iniciar", () => {
  const s = codigo("lib/home.ts");
  assert.match(s, /plazosDelFondo\(inicioRuta, inicioFondo/, "el adaptador no usa plazosDelFondo");
  assert.match(s, /AbortSignal\.timeout\(Math\.max\(0, plazoEfectivo - inicioFondo\)\)/, "la señal del fondo dura plazoEfectivo − inicioFondo, no 50 s fijos");
  assert.match(s, /iniciar\(senalFondo, plazoEfectivo\)/, "iniciar recibe el plazo efectivo");
});

test("🔴 MAX_DURATION_MS del contrato = el maxDuration exportado por la ruta del Home (guard estructural, §47.4)", () => {
  const m = codigo("app/api/home/route.ts").match(/export const maxDuration = (\d+);/);
  assert.ok(m, "la ruta no exporta maxDuration");
  assert.equal(Number(m![1]) * 1000, CONSTANTES.MAX_DURATION_MS);
});

test("🔴 ningún reloj local decide presupuesto: home-servir.ts no contiene `PRESUPUESTO_REQUEST_MS - (` ni `ahora() - t0` en decisiones; PUBLICACION_MAX_MS ya no existe", () => {
  const s = codigo("lib/home-servir.ts");
  assert.doesNotMatch(s, /PRESUPUESTO_REQUEST_MS - \(/);
  assert.doesNotMatch(s, /ahora\(\) - t0/);
  for (const f of archivosFuente(["lib", "app"])) assert.doesNotMatch(codigo(f), /PUBLICACION_MAX_MS/, `${f} usa la constante renombrada`);
});

// ----------------------------------------------------------------- las rutas
test("🔴 app/api/home/route.ts responde con respuestaDelHome (503 + Retry-After para los finales de la pausa)", () => {
  const s = codigo("app/api/home/route.ts");
  assert.match(s, /respuestaDelHome\(/, "la ruta no pasa por respuestaDelHome");
  assert.match(s, /from "@\/lib\/home-http"/);
});

test("🔴 app/api/health/route.ts expone la pausa por saludDeLaPausa (sólo agregados) y nunca lee tmdb:eventos", () => {
  const s = codigo("app/api/health/route.ts");
  assert.match(s, /saludDeLaPausa\(/);
  assert.match(s, /evalSalud\(/, "la lectura es el script SALUD, un EVAL");
  assert.doesNotMatch(s, /eventos|LRANGE|proc:/);
});

// ----------------------------------------------------------------- el doble del banco corre la misma emulación por texto
test("🔴 scripts/banco/dobles.mjs ejecuta los cuatro scripts de la pausa por TEXTO (LUA_PAUSA) delegando en la emulación en memoria", () => {
  const s = leer("scripts/banco/dobles.mjs");
  assert.match(s, /LUA_PAUSA/);
  assert.match(s, /crearOpsEnMemoria/);
  for (const nombre of Object.keys(LUA_PAUSA)) assert.ok(s.includes(`${nombre}: (k, a) => emulacionPausa`), `el doble no delega ${nombre} en la emulación`);
});

test("🔴 lib/home.ts: el productor informa `pausada` (alguna llamada rechazada por la pausa durante ESTA composición) leyendo la métrica `rechazadas` antes y después de componer", () => {
  const s = codigo("lib/home.ts");
  assert.match(s, /rechazadasHastaAhora\(\)/, "falta la lectura de la métrica rechazadas");
  assert.match(s, /pausada: rechazadasHastaAhora\(\) > /, "el productor no calcula `pausada` como delta de rechazadas");
});

const LINEA_LECTURA_PREVIA = "leer: (clave) => (pausaTmdb.vigente() > 0 ? leerAcotadasHome<HomePayload>([clave]).then((v) => v[0] ?? null) : backendCache.leer<HomePayload>(clave)),";

test("🔴 punto 1 (auditorías sobre 6fc63b5 y d322282): con la pausa local vigente, la lectura previa del vuelo y las de servirConTurno van por el LECTOR ACOTADO (`leerAcotadasHome`), no por una carrera sobre el cliente principal", () => {
  const s = codigo("lib/home.ts");
  assert.ok(s.includes(LINEA_LECTURA_PREVIA), "la lectura previa no va por el lector acotado con la pausa local vigente");
  assert.match(s, /leerAcotada: \(claves\) => leerAcotadasHome<HomePayload>\(claves\)/, "servirConTurno no recibe el lector acotado");
  const servir = codigo("lib/home-servir.ts");
  assert.match(servir, /if \(pausaLocal\(\) <= 0\) return deps\.leer\(claves\);/, "sin pausa local tiene que usar `leer` de siempre");
  assert.match(servir, /await deps\.leerAcotada\(claves\)\.catch\(\(\) => null\)/, "con pausa local no usa el lector acotado (o deja escapar su rechazo)");
  assert.doesNotMatch(servir + s + codigo("lib/cache.ts"), /conTope|Promise\.race\(\[deps\.leer|lectura-acotada/, "🔴 volvió la carrera: un Promise.race no cancela la lectura, sólo ignora su resultado");
});

test("🔴 punto 1 (d322282): `leerAcotadasHome` es UN MGET por `redisLector` (retries 0 + señal por petición) — sin cliente nuevo por lectura, sin reintentos y con la misma memoria que batchGet; el tope de servirConTurno es el del lector", () => {
  const s = codigo("lib/cache.ts");
  assert.match(s, /export async function leerAcotadasHome<T>\(claves: string\[\]\)/, "falta el lector acotado del Home");
  const cuerpo = s.slice(s.indexOf("export async function leerAcotadasHome"));
  const fn = cuerpo.slice(0, cuerpo.indexOf("\n}\n"));
  assert.match(fn, /await redisLector\.mget<unknown\[\]>\(\.\.\.claves\)/, "no es un MGET por el lector");
  assert.doesNotMatch(fn, /new Redis\(|redis\.mget|redis!\.mget|batchGet\(/, "🔴 crea un cliente por lectura o usa el cliente principal (con sus 6 reintentos)");
  assert.match(fn, /mem\.get\(k\)/, "sin Redis tiene que leer el mismo Map de memoria que batchGet");
  assert.match(fn, /return claves\.map\(\(\) => null\)/, "un fallo del lector tiene que ser null para todas las claves, no un error");
  assert.equal((s.match(/new Redis\(/g) ?? []).length, 2, "tiene que haber exactamente dos clientes por proceso: el principal y el lector");
  assert.match(s, /redisLector = new Redis\(\{ url: redisUrl, token: redisToken, retry: \{ retries: 0 \}, signal: \(\) => plazoRedisActual\(\) \?\? AbortSignal\.timeout\(CONSTANTES_PAUSA\.TIMEOUT_LECTURA_MS\) \}\)/, "el lector tiene que seguir con retries 0 y señal por petición: el plazo compartido dentro de conPlazoRedis, una nueva de TIMEOUT_LECTURA_MS fuera (si aborta, el SDK 1.38.0 lanza sin reintentar)");
  assert.equal(CONSTANTES.T_LECTURA_PAUSA_MS, CONSTANTES_PAUSA.TIMEOUT_LECTURA_MS, "el tope que servirConTurno documenta es el que aplica la señal del lector: si uno cambia, el otro también");
});

test("🔴 (auditoría sobre 1403ae4) la readquisición tras la pausa es UNA operación lógica con plazo compartido por el cliente acotado: `tomarAcotado` = conPlazoRedis + turnoAcotadoHome.tomar(p, { senal }); sin carrera, sin LIBERAR tardío, sin cliente nuevo", () => {
  const home = codigo("lib/home.ts");
  assert.match(home, /tomarAcotado: \(p, senal\) => conPlazoRedis\(senal, \(\) => turnoAcotadoHome\.tomar\(p, \{ senal \}\)\)/, "lib/home.ts no cablea la readquisición acotada");
  const cache = codigo("lib/cache.ts");
  assert.match(cache, /export const opsTurnoAcotadoHome: OpsTurno = redisLector \? opsTurnoRedis\(redisLector\) : opsTurnoMemoria\(\);/, "las primitivas acotadas tienen que ir por el MISMO cliente acotado (uno por proceso) y, sin Redis, por la misma memoria");
  assert.equal((cache.match(/new Redis\(/g) ?? []).length, 2, "siguen siendo exactamente dos clientes por proceso");
  assert.match(cache, /import \{ plazoRedisActual \} from "\.\/plazo-redis"/);
  const servir = codigo("lib/home-servir.ts");
  assert.match(servir, /r2 = await deps\.tomarAcotado\(\{ clave: K\.turno, propietario, px: c\.TURNO_MS \}, plazoAdq\.signal\);/, "la readquisición no usa tomarAcotado con el plazo");
  assert.doesNotMatch(servir, /Promise\.race\(\[readquisicion|vencioTimeout|deps\.turno\.liberar\(\{ clave: K\.turno, propietario \}\)\.catch/, "🔴 volvió la carrera o la liberación tardía: una carrera no cancela el TOMAR ni sus reconciliaciones");
  // La única llamada a `deps.turno.tomar` que queda es la del camino sano (sin pausa local).
  assert.equal((servir.match(/deps\.turno\.tomar\(/g) ?? []).length, 1, "el camino sano toma el turno con el cliente principal, una sola vez; la readquisición va por el acotado");
  // lib/turno.ts: con señal, una primitiva fallida con el plazo vencido es `indeterminado` y no se emite otro comando.
  const turno = codigo("lib/turno.ts");
  assert.match(turno, /async function tomar\(p: \{ clave: string; propietario: string; px: number \}, opts: \{ senal\?: AbortSignal \} = \{\}\)/);
  assert.match(turno, /\{ estado: "indeterminado" \}/);
  assert.match(turno, /const vencido = \(\) => !!opts\.senal\?\.aborted;/);
});
