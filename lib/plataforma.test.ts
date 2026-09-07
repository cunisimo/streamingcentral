// El indicador de "estoy adentro del contenedor nativo".
//
// Lo que fija: que el valor salga de una BANDERA DE BUILD y no de mirar el
// navegador. Con detección en runtime, el prerender estático daría `false` y el
// cliente `true` después de hidratar, así que los enlaces internos nacerían
// apuntando a `/titulo/...` y recién cambiarían a `/t?...` tras la hidratación:
// hydration mismatch, y links equivocados en el primer frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ES_NATIVO, esNativo } from "./plataforma.ts";

// ============================================================================
// El contrato, en este proceso
// ============================================================================

test("sin la bandera, es web", () => {
  assert.equal(ES_NATIVO, false);
  assert.equal(esNativo(), false);
});

test("el override explícito manda, y no toca window", () => {
  assert.equal(esNativo(true), true);
  assert.equal(esNativo(false), false);
});

test("no depende de window: en Node no existe y no lanza", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(esNativo(), false);
});

// ============================================================================
// Procesos aislados: es lo único que prueba que la bandera se resuelve igual
// con y sin la variable. `import` cachea el módulo, así que un solo proceso no
// puede evaluar los dos caminos.
// ============================================================================

function enProceso(nativo: boolean): boolean {
  const code =
    "import {ES_NATIVO} from './lib/plataforma.ts';" +
    "console.log(JSON.stringify(ES_NATIVO));";
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

test("proceso sin bandera: false", () => {
  assert.equal(enProceso(false), false);
});

test("proceso con bandera: true", () => {
  assert.equal(enProceso(true), true);
});

test("una ejecución no contamina a la otra, en los DOS órdenes", () => {
  assert.equal(enProceso(true), true);
  assert.equal(enProceso(false), false);
  assert.equal(enProceso(true), true);
  assert.equal(enProceso(false), false);
});
