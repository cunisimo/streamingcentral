// Hooks de resolución para poder importar `lib/*.ts` desde un script suelto.
//
// Por qué existe: medir el hero exige llamar `recommendations()` muchas veces
// con la fecha forzada a distintos días. Con el servidor de Next en el medio eso
// serían siete reinicios (la fecha se lee del entorno del proceso) y cada
// reinicio arranca con el cache en frío. En proceso, la variable se cambia entre
// corrida y corrida y el cache en memoria sobrevive, que es lo que hace que la
// medición dure minutos y no horas.
//
// Node 24 ya ejecuta TypeScript borrando los tipos, así que solo faltan tres
// cosas que resuelve el bundler de Next y Node no:
//   1. `server-only`, que fuera de un React Server Component lanza a propósito.
//   2. El alias `@/`, que es de tsconfig.
//   3. Los imports sin extensión (`./cache`), que en ESM no resuelven solos.
//
// NO es un entorno de producción simulado: sirve para medir la salida de una
// función, no para validar el runtime de Next.
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const vacio = pathToFileURL(path.join(import.meta.dirname, "server-only-vacio.mjs")).href;

// Prueba el camino tal cual y con las extensiones que usa el proyecto.
function primeroQueExista(base) {
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    try {
      if (statSync(cand).isFile()) return cand;
    } catch { /* no existe, se prueba la siguiente */ }
  }
  return null;
}

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: vacio, shortCircuit: true };

    let base = null;
    if (spec.startsWith("@/")) {
      base = path.join(raiz, spec.slice(2));
    } else if (spec.startsWith(".") && ctx.parentURL?.startsWith("file:")) {
      // fileURLToPath y no `new URL().pathname`: la ruta del proyecto tiene un
      // espacio ("stream central") y en el pathname viene como %20.
      base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    }
    if (base) {
      const hallado = primeroQueExista(base);
      if (hallado) return { url: pathToFileURL(hallado).href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});
