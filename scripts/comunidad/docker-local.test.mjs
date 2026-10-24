// El guardián del motor Docker con configuraciones SIMULADAS: ninguna prueba
// habla con un motor ni abre una conexión (auditoría de E2a, A2).
//
// Corre con: node --test scripts/comunidad/docker-local.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  contextoEfectivo, contextoGuardadoDe, endpointEsLocal, envDocker, hostPredeterminado, resolverDocker,
} from "./docker-local.mjs";

const ENDPOINTS = {
  "desktop-linux": "npipe:////./pipe/dockerDesktopLinuxEngine",
  "auditoria-remoto": "tcp://10.0.0.5:2376",
  "ssh-remoto": "ssh://usuario@servidor",
  "tubo-ajeno": "npipe:////servidor/pipe/docker_engine",
  "loopback": "tcp://127.0.0.1:2375",
};

test("precedencia: DOCKER_HOST > DOCKER_CONTEXT > config.json > default", () => {
  assert.deepEqual(contextoEfectivo({ env: { DOCKER_HOST: "unix:///x.sock" }, contextoGuardado: "auditoria-remoto" }),
    { nombre: "default", origen: "DOCKER_HOST", host: "unix:///x.sock" });
  assert.deepEqual(contextoEfectivo({ env: { DOCKER_CONTEXT: "a" }, contextoGuardado: "b" }), { nombre: "a", origen: "DOCKER_CONTEXT" });
  assert.deepEqual(contextoEfectivo({ env: {}, contextoGuardado: "b" }), { nombre: "b", origen: "config.json" });
  assert.deepEqual(contextoEfectivo({ env: {} }), { nombre: "default", origen: "predeterminado" });
});

test("el caso de la auditoría: DOCKER_CONTEXT remoto sin DOCKER_HOST se RECHAZA", () => {
  assert.throws(() => resolverDocker({ env: { DOCKER_CONTEXT: "auditoria-remoto" }, endpoints: ENDPOINTS }),
    /no es local.*auditoria-remoto.*DOCKER_CONTEXT.*10\.0\.0\.5/);
});

test("contexto guardado en config.json remoto: se rechaza", () => {
  for (const c of ["auditoria-remoto", "ssh-remoto", "tubo-ajeno"]) {
    assert.throws(() => resolverDocker({ contextoGuardado: c, endpoints: ENDPOINTS }), /no es local/, c);
  }
});

test("contexto que no existe: se rechaza (no se asume default)", () => {
  assert.throws(() => resolverDocker({ env: { DOCKER_CONTEXT: "inventado" }, endpoints: ENDPOINTS }), /no existe/);
  assert.throws(() => resolverDocker({ contextoGuardado: "inventado", endpoints: ENDPOINTS }), /no existe/);
});

test("DOCKER_HOST y DOCKER_CONTEXT juntos: ambiguo, se corta", () => {
  assert.throws(() => resolverDocker({ env: { DOCKER_HOST: "unix:///x.sock", DOCKER_CONTEXT: "desktop-linux" }, endpoints: ENDPOINTS }), /ambiguo/);
});

test("DOCKER_HOST remoto gana sobre un contexto local guardado, y se rechaza", () => {
  assert.throws(() => resolverDocker({ env: { DOCKER_HOST: "tcp://10.0.0.5:2375" }, contextoGuardado: "desktop-linux", endpoints: ENDPOINTS }), /no es local/);
  assert.throws(() => resolverDocker({ env: { DOCKER_HOST: "ssh://user@servidor" }, endpoints: ENDPOINTS }), /no es local/);
});

test("lo local se acepta: el contexto de Docker Desktop, loopback, default", () => {
  assert.equal(resolverDocker({ contextoGuardado: "desktop-linux", endpoints: ENDPOINTS }).host, ENDPOINTS["desktop-linux"]);
  assert.equal(resolverDocker({ env: { DOCKER_CONTEXT: "loopback" }, endpoints: ENDPOINTS }).host, "tcp://127.0.0.1:2375");
  assert.equal(resolverDocker({ plataforma: "win32" }).host, "npipe:////./pipe/docker_engine");
  assert.equal(resolverDocker({ plataforma: "linux" }).host, "unix:///var/run/docker.sock");
  assert.equal(hostPredeterminado("darwin"), "unix:///var/run/docker.sock");
});

test("endpointEsLocal: formas aceptadas y engañosas", () => {
  for (const h of ["unix:///var/run/docker.sock", "npipe:////./pipe/docker_engine", "npipe://./pipe/docker_engine",
    "tcp://127.0.0.1:2375", "tcp://localhost:2375", "tcp://[::1]:2375", "tcp://localhost"]) {
    assert.equal(endpointEsLocal(h), true, h);
  }
  for (const h of ["tcp://10.0.0.5:2375", "tcp://127.0.0.1.evil.example:2375", "tcp://localhost@evil.example",
    "tcp://localhost:2375/../x", "ssh://localhost", "npipe:////servidor/pipe/docker_engine", "npipe:////./pipe/a/b",
    "unix://servidor/sock", "https://127.0.0.1:2376", "", null, undefined]) {
    assert.equal(endpointEsLocal(h), false, String(h));
  }
});

test("envDocker fija el endpoint verificado y saca DOCKER_CONTEXT", () => {
  const e = envDocker({ DOCKER_CONTEXT: "auditoria-remoto", PATH: "x" }, "npipe:////./pipe/dockerDesktopLinuxEngine");
  assert.equal(e.DOCKER_HOST, "npipe:////./pipe/dockerDesktopLinuxEngine");
  assert.ok(!("DOCKER_CONTEXT" in e));
  assert.equal(e.PATH, "x");
});

test("contextoGuardadoDe lee DOCKER_CONFIG simulado (sin tocar el ~/.docker real)", () => {
  const dir = mkdtempSync(join(tmpdir(), "docker-cfg-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify({ currentContext: "auditoria-remoto" }));
  assert.equal(contextoGuardadoDe({ DOCKER_CONFIG: dir }), "auditoria-remoto");
  const vacio = mkdtempSync(join(tmpdir(), "docker-cfg-"));
  assert.equal(contextoGuardadoDe({ DOCKER_CONFIG: vacio }), null);
  writeFileSync(join(vacio, "config.json"), JSON.stringify({ auths: {} }));
  assert.equal(contextoGuardadoDe({ DOCKER_CONFIG: vacio }), null);
});

// Con el CLI real, pero en un DOCKER_CONFIG temporal: `docker context create`
// sólo escribe metadatos, no se conecta. Así se prueba la cadena completa
// (config.json → inspect → resolución → CLI) contra un contexto remoto que
// existe de verdad en la configuración.
import { execFileSync } from "node:child_process";
import { dockerVerificado } from "./docker-local.mjs";

test("CLI real con contexto remoto simulado (DOCKER_CONFIG temporal): se rechaza sin conectar", () => {
  const dir = mkdtempSync(join(tmpdir(), "docker-cfg-"));
  const env = { ...process.env, DOCKER_CONFIG: dir };
  delete env.DOCKER_HOST;
  delete env.DOCKER_CONTEXT;
  execFileSync("docker", ["context", "create", "auditoria-remoto", "--docker", "host=tcp://10.0.0.5:2376"], { env, stdio: "ignore" });
  assert.throws(() => dockerVerificado({ ...env, DOCKER_CONTEXT: "auditoria-remoto" }), /no es local.*10\.0\.0\.5/);
  writeFileSync(join(dir, "config.json"), JSON.stringify({ currentContext: "auditoria-remoto" }));
  assert.throws(() => dockerVerificado(env), /no es local.*config\.json/);
  assert.throws(() => dockerVerificado({ ...env, DOCKER_CONTEXT: "no-existe" }));
  // DOCKER_HOST local gana sobre el contexto remoto guardado, igual que en el CLI.
  const v = dockerVerificado({ ...env, DOCKER_HOST: "npipe:////./pipe/dockerDesktopLinuxEngine" });
  assert.equal(v.nombre, "default");
  assert.equal(v.env.DOCKER_HOST, "npipe:////./pipe/dockerDesktopLinuxEngine");
});
