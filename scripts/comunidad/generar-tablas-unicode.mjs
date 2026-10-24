#!/usr/bin/env node
// Regenera lib/comunidad/reglas/tablas-unicode.ts desde las referencias
// Unicode 18.0.0 incorporadas. Verifica antes las huellas declaradas en
// referencias/unicode-18.0.0/README.md; si no coinciden, no escribe nada.
// Uso: node scripts/comunidad/generar-tablas-unicode.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generarTablas } from "../../lib/comunidad/reglas/referencias/generar-tablas.ts";
import { HUELLAS_REFERENCIAS } from "../../lib/comunidad/reglas/referencias/huellas.ts";

const DIR = join(process.cwd(), "lib/comunidad/reglas/referencias/unicode-18.0.0");
const leer = (f) => {
  const buf = readFileSync(join(DIR, f));
  const h = createHash("sha256").update(buf).digest("hex");
  if (h !== HUELLAS_REFERENCIAS[f]) {
    console.error(`${f}: huella ${h}, declarada ${HUELLAS_REFERENCIAS[f]}`);
    process.exit(2);
  }
  return buf.toString("utf8");
};
const fuente = generarTablas(leer("DerivedGeneralCategory.txt"), leer("confusables.txt"), {
  dgc: HUELLAS_REFERENCIAS["DerivedGeneralCategory.txt"],
  confusables: HUELLAS_REFERENCIAS["confusables.txt"],
});
leer("license.txt");
writeFileSync(join(process.cwd(), "lib/comunidad/reglas/tablas-unicode.ts"), fuente, "utf8");
console.log(`tablas-unicode.ts: ${fuente.length} caracteres`);
