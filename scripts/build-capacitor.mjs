// Lanza el build de la cáscara para el contenedor Capacitor.
//
// ⚠️ VERSIÓN MÍNIMA DE CP1. Todavía NO hace el staging (copia del árbol sin
// `app/api`, `app/admin`, `app/titulo` y `app/persona`) ni inyecta las variables
// públicas de la aplicación: eso llega en CP2. Hoy sólo sirve para el
// DIAGNÓSTICO: correr el export desde la raíz y ver por qué falla.
//
//   node scripts/build-capacitor.mjs --diagnostico
//
// Tres decisiones que parecen detalles y no lo son:
//
// 1. NO se usa `npx`. Puede intentar descargar un paquete, y acá no se descarga
//    nada: el CLI de Next se resuelve por ruta absoluta dentro de node_modules.
// 2. NO se usa `shell: true`. Mete un intérprete en el medio, con sus propias
//    reglas de escapado. Se ejecuta con el mismo Node que corre este script.
// 3. NO se hereda `process.env`. Si se heredara, `TMDB_READ_TOKEN`,
//    `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` llegarían al proceso de build.
//    Se pasa una allowlist de variables OPERATIVAS del sistema, sin las cuales
//    Next no arranca en Windows, y nada más.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Variables del sistema, no de la aplicación. Se copian preservando el NOMBRE Y
// EL CASING REAL: en Windows la variable puede llamarse "Path" o "PATH" según
// cómo se haya iniciado el proceso, y buscar sólo una de las dos la perdería.
const OPERATIVAS = [
  "PATH", "SystemRoot", "ComSpec", "PATHEXT",
  "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
];

export function operativasDelSistema(fuente = process.env) {
  const out = {};
  for (const querida of OPERATIVAS) {
    const real = Object.keys(fuente).find(
      (k) => k.toLowerCase() === querida.toLowerCase(),
    );
    if (real) out[real] = fuente[real];
  }
  return out;
}

// El único directorio que el diagnóstico puede escribir.
export const DIR_DIAGNOSTICO = ".capacitor-diagnostico";

function main() {
  const diagnostico = process.argv.includes("--diagnostico");

  const cliNext = resolve("node_modules", "next", "dist", "bin", "next");
  if (!existsSync(cliNext)) {
    // Sin valores, sólo el hecho.
    console.error("no se encontró el CLI de Next en node_modules");
    process.exit(1);
  }

  const r = spawnSync(process.execPath, [cliNext, "build"], {
    stdio: "inherit",
    shell: false,
    env: {
      ...operativasDelSistema(),
      CAPACITOR: "1",
      ...(diagnostico ? { CAPACITOR_DIST: DIR_DIAGNOSTICO } : {}),
    },
  });
  process.exit(r.status ?? 1);
}

// Sólo corre si se lo invoca directamente; importarlo para las pruebas no
// dispara un build.
//
// ⚠️ Se compara con `pathToFileURL`, NO armando la URL a mano. En Windows
// `import.meta.url` es `file:///D:/...` con TRES barras, así que un
// `file://${ruta}` construido a mano nunca coincide: el script se importaba, no
// ejecutaba nada y salía con 0 como si el build hubiera andado. Pasó en la
// primera corrida de CP1.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
