// Ayudas compartidas por las baterías de reseñas de la comunidad. SÓLO LOCAL.
//
// Antes de mandar una sola sentencia SQL se comprueba que la base sea la de
// `supabase start` de ESTE proyecto:
//   - Docker habla con un motor de ESTA computadora: contexto efectivo y su
//     endpoint, con la precedencia del CLI (docker-local.mjs, auditoría A2);
//     cada `docker` recibe ese endpoint fijo;
//   - el contenedor es exactamente `supabase_db_<project_id>` (mismo selector
//     que scripts/sala/db-local.mjs);
//   - adentro del contenedor, la base escucha en el socket local y se llama
//     `postgres`.
// Para REST, la URL tiene que ser 127.0.0.1 o localhost.
//
// No lee `.env.local` (el de Producción). Las claves locales salen de
// `.env.comunidad-local`, generado con `supabase status -o env` e ignorado por
// Git.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { elegirContenedor, projectIdDe } from "../sala/db-local.mjs";
import { dockerVerificado } from "./docker-local.mjs";

/** `docker` contra el motor local verificado. Mismas opciones que spawnSync. */
export function docker(args, opciones = {}) {
  return spawnSync("docker", args, { ...opciones, env: dockerVerificado().env });
}

/** Lanza si la URL de la API no es local. */
export function urlLocal(url) {
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL (¿--env-file=.env.comunidad-local?)");
  const u = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw new Error(`La URL no es local: ${url}`);
  return url;
}

let contenedorElegido = null;

/** El contenedor de la base local del proyecto, verificado una vez. */
export function contenedor() {
  if (contenedorElegido) return contenedorElegido;
  const projectId = projectIdDe(readFileSync("supabase/config.toml", "utf8"));
  const nombres = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8", env: dockerVerificado().env })
    .trim().split("\n").filter(Boolean);
  const nombre = elegirContenedor(nombres, projectId);
  const r = psqlCrudo(nombre, "select current_database() || '|' || coalesce(inet_server_addr()::text, 'socket')");
  if (r.status !== 0 || r.stdout.trim() !== "postgres|socket") {
    throw new Error(`La base del contenedor ${nombre} no es la esperada: ${r.stdout || r.stderr}`);
  }
  contenedorElegido = nombre;
  return nombre;
}

function psqlCrudo(nombre, sql, { usuario = "postgres", detenerEnError = true } = {}) {
  return docker([
    "exec", "-i", nombre, "psql", "-X", "-q", "-t", "-A",
    "-v", `ON_ERROR_STOP=${detenerEnError ? 1 : 0}`, "-U", usuario, "-d", "postgres",
  ], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Corre SQL en la base local verificada. Devuelve { status, stdout, stderr }. */
export function psql(sql, opciones) {
  return psqlCrudo(contenedor(), sql, opciones);
}

/** Corre SQL y lanza si falla; devuelve stdout recortado. */
export function sqlOk(sql, opciones) {
  const r = psql(sql, opciones);
  if (r.status !== 0) throw new Error(r.stderr.trim() || `psql salió con ${r.status}`);
  return r.stdout.trim();
}

/** Corre un archivo .sql del repo, con ON_ERROR_STOP. */
export function aplicarArchivo(ruta) {
  const r = psql(readFileSync(ruta, "utf8"));
  if (r.status !== 0) throw new Error(`${ruta}: ${r.stderr.trim()}`);
  return r;
}

/** Las líneas `RES|…` que emiten los bloques DO con `raise notice`. */
export function resultados(stderr) {
  return stderr.split("\n")
    .map((l) => l.match(/RES\|(.*)$/))
    .filter(Boolean)
    .map((m) => m[1].trim().split("|"));
}

/** Arnés mínimo, mismo estilo que scripts/sala/pruebas-rls.mjs. */
export function arnes() {
  const fallos = [];
  let total = 0;
  return {
    prueba: async (nombre, fn) => {
      total++;
      try { await fn(); console.log("✔", nombre); }
      // DETALLE=1: el mensaje entero (el diff de assert), para diagnosticar.
      catch (e) { fallos.push(nombre); console.log("✖", nombre, "\n   ", process.env.DETALLE ? String(e.message ?? e) : String(e.message ?? e).split("\n")[0]); }
    },
    cerrar: () => {
      console.log(`\n${total - fallos.length} de ${total} pasaron.`);
      if (fallos.length) { console.log("Fallaron:\n - " + fallos.join("\n - ")); process.exit(1); }
    },
  };
}
