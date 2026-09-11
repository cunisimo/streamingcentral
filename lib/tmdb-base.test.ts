// La base de TMDB es configurable para el banco aislado, y SEGURA por defecto.
//
// Producción tiene que seguir usando la URL oficial si no se configura nada, y
// una configuración accidental no puede mandar tráfico de Producción a un doble.
// La decisión es una función pura y se prueba acá; lib/tmdb.ts sólo la llama.
// Escrito ANTES del módulo: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baseTmdb, TMDB_OFICIAL } from "./tmdb-base.ts";

test("sin configurar nada, es la URL oficial", () => {
  assert.equal(baseTmdb({}).base, TMDB_OFICIAL);
  assert.equal(TMDB_OFICIAL, "https://api.themoviedb.org/3");
});

test("🔴 con TMDB_BASE_URL pero SIN la marca del banco, se ignora y se dice por qué", () => {
  const d = baseTmdb({ base: "http://127.0.0.1:4801" });
  assert.equal(d.base, TMDB_OFICIAL);
  assert.match(d.motivo ?? "", /YUMP_BANCO/, "no explica que falta la marca explícita del banco");
});

test("🔴 en Producción de Vercel NUNCA se acepta un doble, ni con la marca del banco", () => {
  const d = baseTmdb({ base: "http://127.0.0.1:4801", banco: "1", vercelEnv: "production" });
  assert.equal(d.base, TMDB_OFICIAL);
  assert.match(d.motivo ?? "", /production/);
});

test("con la marca del banco y fuera de Producción, apunta al doble", () => {
  for (const vercelEnv of [undefined, "development", "preview"]) {
    const d = baseTmdb({ base: "http://127.0.0.1:4801/", banco: "1", vercelEnv });
    assert.equal(d.base, "http://127.0.0.1:4801", String(vercelEnv));
    assert.equal(d.motivo, undefined);
  }
});

test("una base malformada se rechaza", () => {
  for (const base of ["127.0.0.1:4801", "ftp://x", "", "   "]) {
    assert.equal(baseTmdb({ base, banco: "1" }).base, TMDB_OFICIAL, JSON.stringify(base));
  }
});

test("🔴 lib/tmdb.ts toma la base de la decisión, no de una constante clavada", () => {
  const src = readFileSync("lib/tmdb.ts", "utf8").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /const BASE = "https:\/\/api\.themoviedb\.org\/3"/, "la base sigue clavada");
  assert.match(src, /baseTmdb\(\{/, "lib/tmdb.ts no pasa por baseTmdb");
  assert.match(src, /process\.env\.TMDB_BASE_URL/);
  assert.match(src, /process\.env\.YUMP_BANCO/);
  assert.match(src, /process\.env\.VERCEL_ENV/);
});
