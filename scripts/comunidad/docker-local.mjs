// ¿A qué motor Docker le va a hablar `docker`? Y si no es esta computadora,
// cortar ANTES de mandar nada (auditoría de E2a, A2).
//
// `DOCKER_HOST` solo no alcanza: el CLI elige el motor por un CONTEXTO, y el
// contexto puede venir de una variable o de la elección guardada en
// `config.json`. La precedencia es la del CLI (`resolveContextName` en
// docker/cli):
//   1. `DOCKER_HOST` → contexto `default` con ese endpoint;
//   2. `DOCKER_CONTEXT` → ese contexto;
//   3. `currentContext` de `config.json` (en `DOCKER_CONFIG` o `~/.docker`);
//   4. `default`.
// Los flags `-H` y `--context` también ganan, pero estos scripts no los pasan
// nunca. Con `DOCKER_HOST` y `DOCKER_CONTEXT` a la vez no se adivina: se corta.
//
// Local es: `unix://` (socket de esta máquina), `npipe:` del host `.` (la
// tubería con nombre de ESTA máquina; `npipe:////servidor/pipe/x` es otra) y
// `tcp://` a 127.0.0.1, localhost o [::1]. Todo lo demás (ssh, tcp a otra IP,
// un nombre de host) se rechaza.
//
// Lo verificado no se vuelve a resolver: cada `docker` que corren las baterías
// recibe `DOCKER_HOST` = el endpoint comprobado y sin `DOCKER_CONTEXT`
// (`envDocker`), así que entre la comprobación y el uso no puede cambiar de
// destino. Las funciones de resolución son puras y se prueban con
// configuraciones simuladas (docker-local.test.mjs), sin hablar con ningún
// motor.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** El contexto que elige el CLI, con su origen. Lanza si es ambiguo. */
export function contextoEfectivo({ env = {}, contextoGuardado = null } = {}) {
  if (env.DOCKER_HOST && env.DOCKER_CONTEXT) {
    throw new Error(`DOCKER_HOST y DOCKER_CONTEXT a la vez (${env.DOCKER_HOST} / ${env.DOCKER_CONTEXT}): ambiguo, no se sigue`);
  }
  if (env.DOCKER_HOST) return { nombre: "default", origen: "DOCKER_HOST", host: env.DOCKER_HOST };
  if (env.DOCKER_CONTEXT) return { nombre: env.DOCKER_CONTEXT, origen: "DOCKER_CONTEXT" };
  if (contextoGuardado) return { nombre: contextoGuardado, origen: "config.json" };
  return { nombre: "default", origen: "predeterminado" };
}

/** ¿El endpoint es de esta computadora? */
export function endpointEsLocal(host) {
  if (typeof host !== "string" || !host) return false;
  if (/^unix:\/\/\/[^/]/.test(host)) return true;
  // npipe:////./pipe/x y npipe://./pipe/x: el host de la tubería es "."
  if (/^npipe:(\/\/\/\/|\/\/)\.\/pipe\/[^/]+$/.test(host)) return true;
  if (/^tcp:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\/?$/.test(host)) return true;
  return false;
}

/** El endpoint del contexto `default` cuando no hay DOCKER_HOST. */
export function hostPredeterminado(plataforma = process.platform) {
  return plataforma === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
}

/**
 * Resuelve contexto y endpoint con datos ya leídos y exige que sea local.
 * `endpoints`: nombre de contexto → endpoint docker guardado.
 */
export function resolverDocker({ env = {}, contextoGuardado = null, endpoints = {}, plataforma = process.platform } = {}) {
  const ctx = contextoEfectivo({ env, contextoGuardado });
  let host = ctx.host;
  if (!host) {
    if (Object.hasOwn(endpoints, ctx.nombre)) host = endpoints[ctx.nombre];
    else if (ctx.nombre === "default") host = hostPredeterminado(plataforma);
    else throw new Error(`El contexto Docker «${ctx.nombre}» (${ctx.origen}) no existe`);
  }
  if (!endpointEsLocal(host)) {
    throw new Error(`El motor Docker no es local: contexto «${ctx.nombre}» (${ctx.origen}) → ${host}`);
  }
  return { nombre: ctx.nombre, origen: ctx.origen, host };
}

/** El entorno para cada `docker`: el endpoint verificado, sin contexto. */
export function envDocker(env, host) {
  const e = { ...env, DOCKER_HOST: host };
  delete e.DOCKER_CONTEXT;
  return e;
}

/** `currentContext` de config.json, o null. */
export function contextoGuardadoDe(env = process.env) {
  const dir = env.DOCKER_CONFIG || join(homedir(), ".docker");
  const f = join(dir, "config.json");
  if (!existsSync(f)) return null;
  const c = JSON.parse(readFileSync(f, "utf8"));
  return typeof c.currentContext === "string" && c.currentContext ? c.currentContext : null;
}

let verificado = null;

/**
 * Lee la configuración real, la contrasta con lo que dice el propio CLI y
 * devuelve `{ nombre, origen, host, env }`. Sólo lee metadatos de contexto:
 * `docker context show` e `inspect` no se conectan al motor.
 */
export function dockerVerificado(env = process.env) {
  const propio = env === process.env;
  if (propio && verificado) return verificado;
  const contextoGuardado = contextoGuardadoDe(env);
  const ctx = contextoEfectivo({ env, contextoGuardado });
  const endpoints = {};
  if (!ctx.host) {
    // El endpoint del contexto elegido, leído SIN las variables, para que lo
    // que se inspecciona sea el contexto guardado y no un reemplazo.
    const limpio = { ...env };
    delete limpio.DOCKER_HOST;
    delete limpio.DOCKER_CONTEXT;
    endpoints[ctx.nombre] = execFileSync("docker", ["context", "inspect", ctx.nombre, "--format", "{{.Endpoints.docker.Host}}"],
      { encoding: "utf8", env: limpio }).trim();
  }
  const r = resolverDocker({ env, contextoGuardado, endpoints });
  // El CLI tiene que estar de acuerdo con la resolución de arriba.
  const segunCli = execFileSync("docker", ["context", "show"], { encoding: "utf8", env }).trim();
  if (segunCli !== r.nombre) {
    throw new Error(`El CLI usa el contexto «${segunCli}» y la resolución dio «${r.nombre}»: no se sigue`);
  }
  const v = { ...r, env: envDocker(env, r.host) };
  if (propio) verificado = v;
  return v;
}
