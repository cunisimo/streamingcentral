// Revisioning del fallback offline: hashea public/offline.html y estampa el hash
// en la constante SC_OFFLINE_URL de public/sw.js.
//
// POR QUÉ: el precache no tiene manifest generado (no usamos Workbox, no hay
// __WB_REVISION__). Sin esto, editar offline.html no cambia los bytes del SW,
// install no se vuelve a ejecutar, y los clientes instalados siguen sirviendo la
// copia vieja para siempre.
//
// POR QUÉ EN sw.js Y NO EN sw/config.js: el algoritmo de update del SW compara
// byte a byte el script principal. La comparación de los scripts traídos por
// importScripts existe en Chrome moderno pero no es consistente entre motores
// (Firefox/Safari han diferido históricamente). Estampar dentro de sw.js hace
// que el byte-diff sea el del script principal, que es el camino garantizado.
//
// Corre como `prebuild` de npm. OJO: `npx next build` NO dispara los hooks de
// npm — usar `npm run build` (que es lo que corre Vercel).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OFFLINE = join(ROOT, "public", "offline.html");
const SW = join(ROOT, "public", "sw.js");

// El placeholder debe existir; si alguien lo renombra, fallamos ruidosamente en
// vez de publicar un SW sin revisioning.
const PATTERN = /(SC_OFFLINE_URL\s*=\s*"\/offline\.html\?v=)([^"]*)(")/;

const hash = createHash("sha256").update(readFileSync(OFFLINE)).digest("hex").slice(0, 10);
const sw = readFileSync(SW, "utf8");

if (!PATTERN.test(sw)) {
  console.error("✗ stamp-sw: no encontré SC_OFFLINE_URL en public/sw.js.");
  console.error("  Se esperaba una línea con: SC_OFFLINE_URL = \"/offline.html?v=...\"");
  process.exit(1);
}

const prev = sw.match(PATTERN)[2];
const next = sw.replace(PATTERN, `$1${hash}$3`);

if (prev === hash) {
  console.log(`✓ stamp-sw: offline.html sin cambios (v=${hash})`);
} else {
  writeFileSync(SW, next);
  console.log(`✓ stamp-sw: offline.html v=${prev || "(vacío)"} → v=${hash}`);
}
