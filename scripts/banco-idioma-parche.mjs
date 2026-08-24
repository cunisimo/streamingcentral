// Instrumenta el banco de pruebas. NO es codigo de produccion: se aplica sobre
// un worktree aparte y nunca se commitea.
//
// Solo agrega contadores. El idioma y el fallback YA salen de variables de
// entorno en el codigo real (tanda 1), asi que aca no se parchea nada de eso:
// esa era la diferencia con el banco viejo, que tenia que implementar el
// fallback a mano porque todavia no existia.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.argv[2];
if (!raiz) { console.error("uso: node parche-banco.mjs <ruta-del-banco>"); process.exit(2); }

function editar(rel, pares) {
  const ruta = join(raiz, rel);
  const crudo = readFileSync(ruta, "utf8");
  // Los fuentes vienen con CRLF (core.autocrlf=true). Se normaliza para poder
  // anclar con saltos de linea y se devuelve como estaba.
  const crlf = crudo.includes("\r\n");
  let src = crlf ? crudo.replace(/\r\n/g, "\n") : crudo;
  for (const [de, a] of pares) {
    if (src.includes(a)) { console.log(`  ya aplicado: ${rel}`); continue; }
    if (!src.includes(de)) { console.error(`ABORTA: no encontre el ancla en ${rel}:\n${de}`); process.exit(3); }
    src = src.replace(de, a);
  }
  writeFileSync(ruta, crlf ? src.replace(/\n/g, "\r\n") : src);
  console.log(`  parcheado: ${rel}`);
}

// --- 1. Contador de llamadas a TMDB -----------------------------------------
editar("lib/tmdb.ts", [[
  `const DEFAULTS = { language: IDIOMA_BASE, watch_region: "AR" };`,
  `const DEFAULTS = { language: IDIOMA_BASE, watch_region: "AR" };

// --- BANCO DE PRUEBAS (no es codigo de produccion) --------------------------
export const __stats = { total: 0, porPath: {} as Record<string, number> };
export function __reset() { __stats.total = 0; __stats.porPath = {}; }`,
], [
  `  await adquirir();
  try {
    const res = await fetch(`,
  `  await adquirir();
  try {
    __stats.total++;                                          // BANCO
    const __clave = path.replace(/\\/\\d+/g, "/:id");           // BANCO
    __stats.porPath[__clave] = (__stats.porPath[__clave] ?? 0) + 1;
    const res = await fetch(`,
]]);

// --- 2. Linea [BANCO] en /api/home ------------------------------------------
editar("app/api/home/route.ts", [[
  `import type { MediaType, PlatformCode } from "@/lib/types";`,
  `import type { MediaType, PlatformCode } from "@/lib/types";
import { __stats, __reset } from "@/lib/tmdb";   // BANCO DE PRUEBAS`,
], [
  `    return NextResponse.json(await homePayload({ providers, types: parseTypes(sp.get("t")) }));`,
  `    // --- BANCO DE PRUEBAS: contadores end-to-end -------------------------
    __reset();
    const t0 = Date.now();
    const payload = await homePayload({ providers, types: parseTypes(sp.get("t")) });
    console.log("[BANCO] " + JSON.stringify({
      idioma: process.env.IDIOMA_TITULOS || "es-ES",
      fallback: process.env.FALLBACK_IDIOMA !== "0",
      ms: Date.now() - t0,
      tmdb_total: __stats.total,
      tmdb_por_path: __stats.porPath,
      payload_bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
      hero: payload.hero.length,
      degradado: payload.degradado,
      fallos: payload.fallos,
      rieles: payload.rails.map((r) => \`\${r.key}=\${r.items.length}\`),
    }));
    return NextResponse.json(payload);`,
]]);

console.log("listo.");
