// Sesiones psql concurrentes para las baterías de reseñas. SÓLO LOCAL.
//
// Cada `Sesion` es un proceso `psql` abierto dentro del contenedor verificado
// (scripts/comunidad/local.mjs, docker-local.mjs), con su propio
// `application_name` para encontrarla en pg_stat_activity. Las esperas se
// OBSERVAN (pg_stat_activity / pg_locks), nunca se suponen con un sleep, y la
// coordinación usa locks consultivos de barrera (7399, n) que retiene UNA
// sesión de control: no son locks del protocolo.
//
// Memoria (Windows): cada `docker exec` es un proceso nuevo. Sondear con un
// `docker exec` por consulta agotó la memoria virtual de la máquina
// (`VirtualAlloc … errno=1455`, el mismo síntoma de la auditoría de E2a). Por
// eso los sondeos van por UN observador psql persistente y todas las
// barreras por UNA sesión de control.
//
// La misma técnica que usa scripts/comunidad/pruebas-baja.mjs (E2b), que se
// dejó como estaba.
import { spawn } from "node:child_process";
import { contenedor } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";

const abiertas = new Set();

export class Sesion {
  constructor(nombre, { logEsperas = true } = {}) {
    this.nombre = nombre;
    this.app = `conc-${nombre}`;
    this.out = "";
    this.err = "";
    this.p = spawn("docker", ["exec", "-i", contenedor(), "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=0",
      "-U", "postgres", "-d", "postgres"], { env: dockerVerificado().env });
    this.p.stdout.on("data", (d) => { this.out += d; this.alLeer?.(); });
    this.p.stderr.on("data", (d) => { this.err += d; });
    this.fin = new Promise((r) => this.p.on("close", r));
    this.enviar(`set application_name = '${this.app}';`);
    // Cada espera de lock de más de deadlock_timeout queda en el log de
    // Postgres ("still waiting for …"): es la evidencia de la espera.
    if (logEsperas) this.enviar("set log_lock_waits = on;");
    abiertas.add(this);
  }
  enviar(sql) { this.p.stdin.write(sql + "\n"); }
  async terminar() {
    this.p.stdin.end();
    await this.fin;
    abiertas.delete(this);
    return { out: this.out.trim(), err: this.err };
  }
  /** Las líneas `TAG|…` que la sesión imprimió, como arrays. */
  lineas(tag) {
    return this.out.split("\n").filter((l) => l.startsWith(`${tag}|`)).map((l) => l.split("|").slice(1));
  }
}

// ---------------------------------------------------------------------------
// Observador: una sesión fija para las consultas de sondeo.
// ---------------------------------------------------------------------------
let obs = null;
let pedido = 0;

function observador() {
  if (!obs) obs = new Sesion("observador", { logEsperas: false });
  return obs;
}

/** Una consulta escalar por el observador (sin lanzar un proceso nuevo). */
export async function consultar(sql, ms = 10000) {
  const o = observador();
  const id = ++pedido;
  const marca = `OBS${id}|`;
  o.enviar(`select '${marca}' || coalesce((${sql})::text, '∅');`);
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const i = o.out.indexOf(marca);
    if (i >= 0) {
      const resto = o.out.slice(i + marca.length);
      const j = resto.indexOf("\n");
      if (j >= 0) return resto.slice(0, j);
    }
    if (/ERROR:/.test(o.err)) throw new Error(`observador: ${o.err.trim().split("\n")[0]}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`el observador no respondió: ${sql.slice(0, 80)}`);
}

/** Espera a que la condición SQL dé verdadero; si no llega, lanza con la actividad. */
export async function esperar(condicion, descripcion, ms = 20000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (await consultar(`(${condicion})`) === "true") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  const act = await consultar(`select string_agg(application_name || ':' || coalesce(wait_event_type, '-') || '/'
    || coalesce(wait_event, '-') || ':' || state, ' | ') from pg_stat_activity where application_name like 'conc-%'`);
  throw new Error(`no llegó: ${descripcion}. Actividad: ${act}`);
}

/** ¿La sesión está esperando un lock? (`tipo`: advisory, tuple, transactionid…) */
export const esperaLock = (s, tipo = null) => `exists (select 1 from pg_stat_activity where application_name = '${s.app}'
  and wait_event_type = 'Lock'${tipo ? ` and wait_event = '${tipo}'` : ""})`;

export const BARRERA = (n) => `select pg_advisory_lock(7399, ${n});`;
export const SOLTAR = (n) => `select pg_advisory_unlock(7399, ${n});`;
export const barreraTomada = (n) =>
  `exists (select 1 from pg_locks where locktype = 'advisory' and classid = 7399 and objid = ${n} and granted
     and pid = (select pid from pg_stat_activity where application_name = 'conc-control'))`;

// ---------------------------------------------------------------------------
// Control: UNA sesión retiene todas las barreras.
// ---------------------------------------------------------------------------
let control = null;

/** Toma la barrera `n` en la sesión de control. */
export async function barrera(n) {
  if (!control) control = new Sesion("control", { logEsperas: false });
  control.enviar(BARRERA(n));
  await esperar(barreraTomada(n), `barrera ${n} tomada`);
  return { soltar: () => control.enviar(SOLTAR(n)), terminar: async () => {} };
}

/** Cierra observador, control y cualquier sesión que haya quedado abierta. */
export async function cerrarSesiones() {
  for (const s of [obs, control]) if (s && abiertas.has(s)) await s.terminar();
  obs = null; control = null;
  for (const s of abiertas) { try { s.p.kill(); } catch { /* ya cerró */ } }
  abiertas.clear();
}
