// El cableado de la Etapa 3.a, fijado sobre el fuente. Los módulos que tocan
// TMDB de verdad (lib/tmdb.ts, lib/enrich.ts, lib/home.ts…) son `server-only`
// y no se importan desde `node --test`; lo que se fija acá es que cada pieza
// pura probada aparte (tmdb-error, tmdb-politica, fallos-tmdb, settle-all,
// tmdb-http) esté ENCHUFADA donde tiene que estar — y que los once sitios que
// tragaban errores de TMDB (informe de la Etapa 3, §2.3) registren la causa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const codigo = (rel: string) =>
  fs.readFileSync(path.join(raiz, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

// ============================================================================
// lib/tmdb.ts: clasifica por causa, cuenta intentos, y el bucle está APAGADO
// ============================================================================

test("lib/tmdb.ts lanza ErrorTmdb (no un Error con texto) y clasifica timeout, cuerpo y cancelada", () => {
  const s = codigo("lib/tmdb.ts");
  assert.doesNotMatch(s, /new Error\(`TMDB \$\{res\.status\}/, "el Error genérico con texto tiene que desaparecer");
  assert.match(s, /new ErrorTmdb\(/);
  assert.match(s, /clasificarError\(/);
  assert.match(s, /parsearRetryAfter\(/);
  assert.match(s, /m\.tmdb\.errores\.timeout \+= 1/);
  assert.match(s, /m\.tmdb\.errores\.cuerpo \+= 1/);
  assert.match(s, /m\.tmdb\.canceladas\.enCola \+= 1/);
  assert.match(s, /m\.tmdb\.canceladas\.enVuelo \+= 1/);
  assert.match(s, /m\.tmdb\.intentos \+= 1/);
});

test("lib/tmdb.ts tiene UN solo fetch, dentro del bucle de reintentos, y el bucle lee TMDB_REINTENTOS", () => {
  const s = codigo("lib/tmdb.ts");
  assert.equal((s.match(/\bfetch\(/g) ?? []).length, 1);
  assert.match(s, /conReintentos\(/);
  assert.match(s, /reintentosActivos\(process\.env\.TMDB_REINTENTOS\)/);
});

test("lib/tmdb-politica.ts: el interruptor está apagado salvo '1' (control del comportamiento sano)", () => {
  const s = codigo("lib/tmdb-politica.ts");
  assert.match(s, /return valor === "1";/);
});

// ============================================================================
// Los once sitios (S1-S11) registran la causa
// ============================================================================

test("S1 lib/home.ts safe() registra el descarte y producirHome abre el contexto compuesto", () => {
  const s = codigo("lib/home.ts");
  assert.match(s, /registrarDescarteTmdb\(e, /);
  assert.match(s, /withFallosDeFuentes\(/);
  assert.match(s, /descartesTmdb/);
});

test("S2 lib/enrich.ts usa settleAll del módulo puro y ya no tiene el suyo", () => {
  const s = codigo("lib/enrich.ts");
  assert.doesNotMatch(s, /async function settleAll/);
  assert.match(s, /from "\.\/settle-all"/);
});

test("S3 lib/enrich.ts titleCard: una card que falla por TMDB no se guarda", () => {
  const s = codigo("lib/enrich.ts");
  const i = s.indexOf("cachedLocIf(claveCard(");
  const tramo = s.slice(i, i + 2200);
  assert.match(tramo, /registrarDescarteTmdb\(e, "titleCard"\)/);
});

test("S4 directorCards, S5 pools, S6 top, S7 netflix, S8 idioma registran la causa", () => {
  // Corrección tras la auditoría: directores y portadas viven en
  // lib/lotes-tolerantes.ts, con el resultado parcial SIN guardar.
  assert.match(codigo("lib/lotes-tolerantes.ts"), /registrarDescarteTmdb\(s\.reason, "directorCards"\)/);
  assert.match(codigo("lib/lotes-tolerantes.ts"), /registrarDescarteTmdb\(e, "genreCovers"\)/);
  assert.match(codigo("lib/enrich.ts"), /resolverDirectores<UIPerson>\(/);
  assert.match(codigo("lib/enrich.ts"), /resolverPortadas\(/);
  assert.match(codigo("lib/pools.ts"), /registrarDescarteTmdb\(r\.reason, "pool"\)/);
  assert.match(codigo("lib/top.ts"), /registrarDescarteTmdb\(e, /);
  assert.match(codigo("lib/netflix-top10.ts"), /registrarDescarteTmdb\(e, "enNetflixAR"\)/);
  assert.equal((codigo("lib/idioma.ts").match(/registrarDescarteTmdb\(e, "respaldo-idioma"\)/g) ?? []).length, 2);
});

test("S9/S10 las rutas de ficha y búsqueda traducen el fallo principal con respuestaDeErrorTmdb", () => {
  assert.match(codigo("app/api/title/[tipo]/[id]/route.ts"), /respuestaDeErrorTmdb\(e\)/);
  assert.match(codigo("app/api/search/route.ts"), /respuestaDeErrorTmdb\(e\)/);
});

test("S11 la ruleta se cubre por titleCard (S3) y reco no traga: no hay catch en lib/reco.ts", () => {
  assert.doesNotMatch(codigo("lib/reco.ts"), /\bcatch\b/);
});

// ============================================================================
// Las siete superficies cacheadas abren el contexto COMPUESTO
// ============================================================================

test("ningún cachedLocIf abre sólo withFallosDisponibilidad: todos usan withFallosDeFuentes", () => {
  for (const rel of ["lib/enrich.ts", "lib/home.ts", "lib/reco.ts", "lib/top.ts"]) {
    assert.doesNotMatch(codigo(rel), /withFallosDisponibilidad\(/, rel);
  }
  // Tres en enrich.ts (card y los dos tramos de últimos); el de la búsqueda
  // vive en lib/busqueda-enriquecido.ts (`producirBusquedaConFallos`).
  assert.equal((codigo("lib/enrich.ts").match(/withFallosDeFuentes\(/g) ?? []).length, 3);
  assert.equal((codigo("lib/busqueda-enriquecido.ts").match(/withFallosDeFuentes\(/g) ?? []).length, 1);
  assert.match(codigo("lib/enrich.ts"), /producirBusquedaConFallos\(\{/);
  assert.equal((codigo("lib/reco.ts").match(/withFallosDeFuentes\(/g) ?? []).length, 1);
  assert.equal((codigo("lib/top.ts").match(/withFallosDeFuentes\(/g) ?? []).length, 1);
  assert.equal((codigo("lib/home.ts").match(/withFallosDeFuentes\(/g) ?? []).length, 1);
});

// ============================================================================
// Ficha y búsqueda: principal vs opcional; el cliente distingue el motivo
// ============================================================================

test("detail() sirve la ficha con proveedores/relacionados/trailer caídos y lo marca en `degradacion`", () => {
  const s = codigo("lib/enrich.ts");
  assert.match(s, /degradacion/);
  assert.match(codigo("lib/types.ts"), /degradacion\?:/);
});

test("useApi expone `motivo` y DetailView lo usa para no decir 'Sin conexión' cuando es TMDB", () => {
  assert.match(codigo("components/useApi.ts"), /motivoDeRespuesta\(/);
  assert.match(codigo("components/DetailView.tsx"), /tmdb-no-disponible/);
});

// ============================================================================
// Lo que la 3.a NO trae (la restricción del dueño y la auditoría)
// ============================================================================

test("no hay limitador, cadencias, pausa distribuida, circuito ni waitUntil, y COMPOSICION_MAX_MS sigue en 16 s", () => {
  for (const rel of ["lib/tmdb.ts", "lib/home.ts", "lib/home-servir.ts", "lib/cache.ts"]) {
    const s = codigo(rel);
    assert.doesNotMatch(s, /waitUntil|RESERVAR|tmdb:cadencia|tmdb:pausa|circuito|AIMD/i, rel);
  }
  assert.match(codigo("lib/home-servir.ts"), /COMPOSICION_MAX_MS: 16_000/);
  assert.equal(fs.existsSync(path.join(raiz, "lib/tmdb-tasa.ts")), false);
  assert.equal(fs.existsSync(path.join(raiz, "lib/tmdb-circuito.ts")), false);
});
