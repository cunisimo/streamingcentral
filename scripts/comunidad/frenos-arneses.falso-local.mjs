// SÓLO PRUEBAS: reemplazo de `local.mjs` para los arneses (ver
// frenos-arneses.gancho.mjs). Responde la lectura de estado de los frenos con
// el estado simulado de FRENO_ESTADO; cualquier otra consulta, archivo o
// `docker` se anota en FRENO_LOG como mutación y lanza.
import { appendFileSync } from "node:fs";
import { ESTADO_SQL } from "./frenos-arneses.mjs";

const anotar = (x) => appendFileSync(process.env.FRENO_LOG, `${x}\n`);
const bloquear = (x) => { anotar(`MUTACION ${x}`); throw new Error(`mutación bloqueada: ${x}`); };

export const urlLocal = (u) => u;
export function contenedor() { anotar("contenedor"); return "falso"; }
export function sqlOk(sql) {
  if (sql === ESTADO_SQL) { anotar("lectura-estado"); return process.env.FRENO_ESTADO; }
  return bloquear(`sqlOk ${sql.replace(/\s+/g, " ").slice(0, 60)}`);
}
export const aplicarArchivo = (ruta) => bloquear(`aplicarArchivo ${ruta}`);
export const docker = (args) => bloquear(`docker ${args.join(" ")}`);
export const psql = (sql) => bloquear(`psql ${sql.slice(0, 60)}`);
export function arnes() {
  return { prueba: async (_n, fn) => { try { await fn(); } catch { /* anotado */ } }, cerrar: () => process.exit(1) };
}
