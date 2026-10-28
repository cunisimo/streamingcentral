// SÓLO PRUEBAS (frenos-arneses.test.mjs). Con `--import` de este archivo, los
// arneses up-down-up*.mjs cargan `frenos-arneses.falso-local.mjs` en lugar de
// `./local.mjs`: no hay base, cada llamada queda anotada y toda escritura
// lanza. Así se observa qué hace el arnés REAL antes de su primera mutación.
import { register } from "node:module";

const FALSO = new URL("./frenos-arneses.falso-local.mjs", import.meta.url).href;

export async function resolve(especificador, contexto, siguiente) {
  if (especificador === "./local.mjs" && /\/up-down-up[^/]*\.mjs$/.test(contexto.parentURL ?? "")) {
    return { url: FALSO, shortCircuit: true };
  }
  return siguiente(especificador, contexto);
}

if (!process.env.FRENO_GANCHO_HILO) {
  process.env.FRENO_GANCHO_HILO = "1";
  register(import.meta.url);
}
