// Lo que protege a las baterías de reseñas de tocar algo que no sea la base
// local, y que las claves locales no entren a Git.
//
// Corre con: node --test scripts/comunidad/local.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dockerLocal, urlLocal } from "./local.mjs";

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

test("dockerLocal rechaza un motor remoto", () => {
  assert.equal(dockerLocal({}), true);
  assert.equal(dockerLocal({ DOCKER_HOST: "npipe:////./pipe/docker_engine" }), true);
  assert.equal(dockerLocal({ DOCKER_HOST: "unix:///var/run/docker.sock" }), true);
  assert.equal(dockerLocal({ DOCKER_HOST: "tcp://127.0.0.1:2375" }), true);
  assert.throws(() => dockerLocal({ DOCKER_HOST: "tcp://10.0.0.5:2375" }), /no es local/);
  assert.throws(() => dockerLocal({ DOCKER_HOST: "ssh://user@servidor" }), /no es local/);
});

test("las baterías no leen .env.local ni mencionan un host de Supabase remoto", () => {
  for (const f of readdirSync("scripts/comunidad").filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))) {
    const src = readFileSync(`scripts/comunidad/${f}`, "utf8");
    assert.ok(!/env-file=\.env\.local\b|["']\.env\.local["']/.test(src), `${f} carga .env.local`);
    assert.ok(!/supabase\.co/.test(src), `${f} menciona un host remoto`);
  }
});
