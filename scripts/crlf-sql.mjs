// SÓLO PRUEBAS: simula una copia de Windows con `core.autocrlf=true`.
// Con `node --import ./scripts/crlf-sql.mjs --test …`, todo `.sql` que se lea
// con fs.readFileSync (también por `import { readFileSync } from "node:fs"`)
// llega con saltos CRLF, en memoria: no toca ningún archivo. Sirve para
// comprobar que los tests que leen migraciones no dependen del salto de línea.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const original = fs.readFileSync;
fs.readFileSync = function (ruta, opciones, ...resto) {
  const r = original.call(this, ruta, opciones, ...resto);
  if (typeof r !== "string" || !String(ruta instanceof URL ? ruta.pathname : ruta).endsWith(".sql")) return r;
  return r.replace(/\r?\n/g, "\r\n");
};
syncBuiltinESMExports();
