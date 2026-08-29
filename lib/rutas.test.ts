// Los enlaces INTERNOS a ficha y persona.
//
// ⚠️ NO confundir con `lib/compartir.ts`. Esto arma la ruta interna de
// navegación, que cambia entre la web y el contenedor. `compartir.ts` arma el
// enlace PÚBLICO absoluto (`https://app.yump.ar/titulo/...`) y NO cambia nunca:
// hay un guard más abajo que lo fija.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { hrefTitulo, hrefPersona, parseParamsTitulo, parseParamsPersona } from "./rutas.ts";
import { SITIO_PUBLICO } from "./compartir.ts";

// ============================================================================
// Los dos caminos
// ============================================================================

test("web: las rutas públicas no cambian", () => {
  assert.equal(hrefTitulo("movie", 278, { nativo: false }), "/titulo/movie/278");
  assert.equal(hrefTitulo("tv", 1396, { nativo: false }), "/titulo/tv/1396");
  assert.equal(hrefPersona(123, { nativo: false }), "/persona/123");
});

test("contenedor: query, sin segmento dinámico", () => {
  assert.equal(hrefTitulo("movie", 278, { nativo: true }), "/t/?tipo=movie&id=278");
  assert.equal(hrefTitulo("tv", 1396, { nativo: true }), "/t/?tipo=tv&id=1396");
  assert.equal(hrefPersona(123, { nativo: true }), "/p/?id=123");
});

test("sin opts resuelve con la bandera de build; en Node (web) da la ruta pública", () => {
  assert.equal(hrefTitulo("movie", 278), "/titulo/movie/278");
  assert.equal(hrefPersona(123), "/persona/123");
});

test("acepta id numérico o string, sin cambiar el resultado", () => {
  assert.equal(hrefTitulo("movie", "278", { nativo: true }), "/t/?tipo=movie&id=278");
  assert.equal(hrefPersona("123", { nativo: false }), "/persona/123");
});

// ============================================================================
// Los parsers de /t y /p
// ============================================================================

test("params válidos", () => {
  assert.deepEqual(parseParamsTitulo(new URLSearchParams("tipo=movie&id=278")),
    { tipo: "movie", id: "278" });
  assert.deepEqual(parseParamsTitulo(new URLSearchParams("tipo=tv&id=1396")),
    { tipo: "tv", id: "1396" });
  assert.deepEqual(parseParamsPersona(new URLSearchParams("id=287")), { id: "287" });
});

test("tipo inválido no produce ruta", () => {
  assert.equal(parseParamsTitulo(new URLSearchParams("tipo=x&id=1")), null);
  assert.equal(parseParamsTitulo(new URLSearchParams("id=1")), null);
});

test("id no numérico no produce ruta", () => {
  assert.equal(parseParamsTitulo(new URLSearchParams("tipo=movie&id=abc")), null);
  assert.equal(parseParamsTitulo(new URLSearchParams("tipo=movie&id=")), null);
  assert.equal(parseParamsPersona(new URLSearchParams("id=abc")), null);
  assert.equal(parseParamsPersona(new URLSearchParams("")), null);
});

test("sin params tampoco", () => {
  assert.equal(parseParamsTitulo(new URLSearchParams("")), null);
});

test("la ruta nativa lleva barra ANTES de la query: el export usa trailingSlash", () => {
  // Sin la barra, resolver `/t` depende de que el servidor trate el directorio
  // como index.html o redirija. Con ella no depende de nada. Ver lib/rutas.ts.
  for (const href of [hrefTitulo("movie", 1, { nativo: true }), hrefPersona(1, { nativo: true })]) {
    assert.match(href, /^\/[tp]\/\?/, `${href} perdió la barra antes de la query`);
  }
});

// ============================================================================
// GUARD: compartir NO se toca
// ============================================================================

test("el enlace PÚBLICO sigue siendo app.yump.ar, no una ruta del contenedor", () => {
  assert.equal(SITIO_PUBLICO, "https://app.yump.ar");
});

// ============================================================================
// Procesos aislados, con y sin la bandera, en los dos órdenes
// ============================================================================

function enProceso(nativo: boolean): { t: string; p: string } {
  const code =
    "import {hrefTitulo, hrefPersona} from './lib/rutas.ts';" +
    "console.log(JSON.stringify({t:hrefTitulo('movie',278),p:hrefPersona(123)}));";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    shell: false,
    env: nativo
      ? { ...process.env, NEXT_PUBLIC_YUMP_NATIVO: "1" }
      : { ...process.env, NEXT_PUBLIC_YUMP_NATIVO: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("proceso web: rutas públicas", () => {
  assert.deepEqual(enProceso(false), { t: "/titulo/movie/278", p: "/persona/123" });
});

test("proceso nativo: rutas de query", () => {
  assert.deepEqual(enProceso(true), { t: "/t/?tipo=movie&id=278", p: "/p/?id=123" });
});

test("sin contaminación entre procesos, en los dos órdenes", () => {
  assert.equal(enProceso(true).t, "/t/?tipo=movie&id=278");
  assert.equal(enProceso(false).t, "/titulo/movie/278");
  assert.equal(enProceso(true).t, "/t/?tipo=movie&id=278");
});
