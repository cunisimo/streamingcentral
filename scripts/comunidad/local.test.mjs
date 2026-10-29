// Lo que protege a las baterías de reseñas de tocar algo que no sea la base
// local, y que las claves locales no entren a Git.
//
// Corre con: node --test scripts/comunidad/local.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { urlLocal } from "./local.mjs";

test(".env.comunidad-local está ignorado por Git (y .env.local también)", () => {
  for (const f of [".env.comunidad-local", ".env.local"]) {
    const salida = execFileSync("git", ["check-ignore", "-v", f], { encoding: "utf8" });
    assert.match(salida, new RegExp(`\\.gitignore:\\d+:${f.replace(/\./g, "\\.")}\\s`));
  }
  assert.ok(readFileSync(".gitignore", "utf8").split(/\r?\n/).includes(".env.comunidad-local"));
});

test("urlLocal acepta sólo 127.0.0.1 y localhost", () => {
  assert.equal(urlLocal("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
  assert.equal(urlLocal("http://localhost:54321"), "http://localhost:54321");
  assert.throws(() => urlLocal("https://abcd.supabase.co"), /no es local/);
  assert.throws(() => urlLocal("http://127.0.0.1.evil.example:54321"), /no es local/);
  assert.throws(() => urlLocal("http://localhost@evil.example"), /no es local/);
  assert.throws(() => urlLocal(undefined), /Falta/);
});

test("ningún `docker` de las baterías ni de db-local sale sin el endpoint verificado", () => {
  // El guardián en sí se prueba en docker-local.test.mjs (contextos
  // simulados). Acá: que nadie llame a docker por fuera de él.
  const archivos = [
    ...readdirSync("scripts/comunidad")
      .filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs") && n !== "docker-local.mjs")
      .map((n) => `scripts/comunidad/${n}`),
    "scripts/sala/db-local.mjs",
  ];
  let llamadas = 0;
  for (const f of archivos) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\b(spawnSync|execFileSync|spawn)\("docker",[\s\S]*?\)\s*[;\n]/g)) {
      llamadas++;
      assert.ok(/env: dockerVerificado\(\)\.env|\benv\b/.test(m[0]), `${f}: docker sin el env verificado: ${m[0].slice(0, 100)}`);
    }
    assert.ok(!/["']DOCKER_(HOST|CONTEXT)["']\s*:/.test(src), `${f} fija DOCKER_HOST/DOCKER_CONTEXT por su cuenta`);
  }
  assert.ok(llamadas >= 3, `se esperaban las llamadas conocidas, hubo ${llamadas}`);
});

test("las ayudas sólo locales nunca van en una migración (plan §4)", () => {
  const nombres = readdirSync("supabase/migrations");
  assert.ok(nombres.length > 0);
  for (const f of nombres) {
    assert.ok(!/solo_local|solo-local/.test(readFileSync(`supabase/migrations/${f}`, "utf8")), `${f} menciona las ayudas sólo locales`);
  }
  assert.match(readFileSync("scripts/comunidad/solo-local.sql", "utf8"), /solo_local_falla_borrado/);
});

test("las baterías no leen .env.local ni mencionan un host de Supabase remoto", () => {
  for (const f of readdirSync("scripts/comunidad").filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))) {
    const src = readFileSync(`scripts/comunidad/${f}`, "utf8");
    assert.ok(!/env-file=\.env\.local\b|["']\.env\.local["']/.test(src), `${f} carga .env.local`);
    assert.ok(!/supabase\.co/.test(src), `${f} menciona un host remoto`);
  }
});
