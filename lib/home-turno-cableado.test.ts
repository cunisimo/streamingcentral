// Etapa 2 (#17): el CABLEADO del turno y el último bueno en lib/cache.ts,
// lib/home.ts, lib/tmdb.ts y lib/supabase.ts. Son chequeos ESTRUCTURALES sobre
// el fuente (esos módulos arrastran Upstash, Next o el bundle del navegador y no
// se pueden importar desde `node --test`), con el mismo criterio que
// lib/cache-delega.test.ts: falla si alguien vuelve a escribir la fresca por
// fuera de PUBLICAR o a resolver el Home por `cachedLocIf`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const cache = sinComentarios("lib/cache.ts");
const home = sinComentarios("lib/home.ts");
const tmdb = sinComentarios("lib/tmdb.ts");
const supabase = sinComentarios("lib/supabase.ts");

test("🔴 lib/home.ts resuelve el Home por servirConTurno, ya no por cachedLocIf, y no escribe por su cuenta", () => {
  assert.match(home, /servirConTurno<HomePayload>\(/, "el líder del vuelo no entra por la secuencia con turno");
  assert.doesNotMatch(home, /\bcachedLocIf\s*\(/, "volvió cachedLocIf: escribiría la fresca sin fencing");
  assert.doesNotMatch(home, /\bcachedIf\s*\(/);
  assert.doesNotMatch(home, /backendCache\.escribir|\bguardar\s*\(|redis\.set/, "lib/home.ts no puede escribir el Home: sólo PUBLICAR/ENFRIAR, dentro del turno");
  // La lectura previa del vuelo sigue siendo la fresca sola (una copia); desde la
  // 3.c.1 va por el LECTOR ACOTADO (`leerAcotadasHome`, lib/cache.ts) SÓLO con
  // la pausa local vigente.
  assert.ok(home.includes("leer: (clave) => (pausaTmdb.vigente() > 0 ? leerAcotadasHome<HomePayload>([clave]).then((v) => v[0] ?? null) : backendCache.leer<HomePayload>(clave)),"));
});

test("🔴 lib/home.ts arma las CINCO claves con los constructores y la huella real, y la señal de la solicitud", () => {
  // Las cinco claves se construyen en lib/home-instante.ts, desde UN instante.
  const instante = sinComentarios("lib/home-instante.ts");
  for (const c of ["claveHome(", "claveHomeUltimoBueno(", "claveHomeGeneracion(", "claveHomeDegradado(", "claveTurnoHome("]) {
    assert.ok(instante.includes(c), `falta ${c} en lib/home-instante.ts`);
  }
  assert.match(home, /clavesDeLaSolicitud\(providers, types\)/);
  assert.match(home, /AbortSignal\.timeout\(CONSTANTES\.PRESUPUESTO_REQUEST_MS\)/, "el deadline no es una señal real");
  assert.match(home, /conSenal\(/, "la señal no viaja por el scope de la solicitud");
  assert.match(instante, /hoyAR\(ahora\)/, "la generación del UB tiene que ser el día argentino del instante");
  assert.match(home, /dia: claves\.dia/, "el día del contexto tiene que ser el del instante, no otra lectura del reloj");
  // La evidencia de composición iniciada la emite la secuencia (default: console.log).
  assert.match(sinComentarios("lib/home-servir.ts"), /\[home\] compone \$\{K\.fresca\} \$\{propietario\}/, "no hay evidencia de composición iniciada");
});

test("🔴 lib/cache.ts enchufa las seis primitivas sobre el cliente real y las emula en memoria; sin DEL suelto ni SET XX", () => {
  assert.match(cache, /from "\.\/turno-lua"/, "los scripts tienen que salir del módulo verificado");
  assert.match(cache, /export const opsTurnoHome/, "las primitivas del turno no se exportan");
  assert.match(cache, /crearOpsEnMemoria\(mem/, "sin Redis, el turno se emula sobre el mismo Map del cache");
  assert.match(cache, /\.evalsha[<(]/, "las operaciones no van por EVALSHA");
  assert.match(cache, /NOSCRIPT/, "sin respaldo a EVAL ante NOSCRIPT");
  assert.doesNotMatch(cache, /redis!?\.del\(|\.del\(/, "🔴 apareció un DEL directo en lib/cache.ts");
  assert.doesNotMatch(cache, /xx:\s*true/, "🔴 apareció un SET … XX");
  // Ninguna escritura directa de las familias del Home fuera de los scripts.
  assert.doesNotMatch(cache, /guardar\([^)]*home:(ub|gen|degradado|turno)/);
  assert.match(cache, /homeUltimoBueno:\s*60 \* 60 \* 36/, "TTL del último bueno: 36 h (§4.2)");
});

test("🔴 lib/tmdb.ts combina la señal de la solicitud con su timeout de 8 s", () => {
  // Etapa 3.a: el timeout del intento es un parámetro (`timeoutMs`) cuyo valor
  // por defecto es `TIMEOUT_LLAMADA_MS` = 8000 (lib/tmdb-politica.ts); con los
  // reintentos apagados nunca vale otra cosa.
  assert.match(tmdb, /combinarSenales\(senalActual\(\), AbortSignal\.timeout\(timeoutMs\)\)/);
  assert.match(tmdb, /timeoutMs \?\? TIMEOUT_LLAMADA_MS/);
  const politica = sinComentarios("lib/tmdb-politica.ts");
  assert.match(politica, /export const TIMEOUT_LLAMADA_MS = 8000;/);
});

test("🔴 lib/supabase.ts recibe la señal por un proveedor registrado desde el servidor, sin importar async_hooks", () => {
  assert.doesNotMatch(supabase, /async_hooks|from "\.\/senal-solicitud"/);
  assert.match(supabase, /export function proveerSenalSupabase\(/);
  assert.match(supabase, /proveedorSenal\?\.\(/, "el fetch del cliente de servidor no pide la señal");
  assert.match(cache, /proveerSenalSupabase\(/, "lib/cache.ts no registra el proveedor de la señal");
});

test("🔴 el propietario del turno lleva el UUID COMPLETO de la instancia: la identidad es parte del fencing y no se recorta", () => {
  // Auditoría de Codex sobre fb3a3f1: `randomUUID().slice(0, 8)` reducía la
  // identidad que RENOVAR/PUBLICAR/ENFRIAR/LIBERAR comparan.
  assert.match(home, /const INSTANCIA = randomUUID\(\);/, "la instancia no es el UUID completo");
  assert.doesNotMatch(home, /randomUUID\(\)\s*\.(slice|substring|substr|slice)\(/, "volvió a recortarse el UUID");
  assert.match(home, /propietario: `\$\{INSTANCIA\}:\$\{process\.pid\}:\$\{\+\+composicionesDeEsteProceso\}`/, "el propietario no es <instancia>:<pid>:<n>");
});
