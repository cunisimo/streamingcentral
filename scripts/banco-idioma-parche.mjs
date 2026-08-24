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
// respaldo/respaldoPorPath separan las llamadas de REPARACION del resto. Sin
// esto, el numero que reporta lib/idioma.ts (38 llamadas) se lee como si fueran
// 38 paginas de discover, y no lo son: hay paginas y hay detalles de ficha, que
// cuestan distinto y se comparan contra estimaciones distintas.
// Y la LATENCIA de cada request, para poder distinguir "el codigo tarda mas" de
// "TMDB estuvo lento en esa ventana". Sin esto, un composer de 24 s contra uno
// de 6 s no se puede atribuir a nada.
export const __stats = {
  total: 0, porPath: {} as Record<string, number>,
  respaldo: 0, respaldoPorPath: {} as Record<string, number>,
  msRed: [] as number[],
};
export function __reset() {
  __stats.total = 0; __stats.porPath = {};
  __stats.respaldo = 0; __stats.respaldoPorPath = {};
  __stats.msRed = [];
}
export function __latencias() {
  const v = [...__stats.msRed].sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const pct = (p: number) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  return {
    n: v.length, suma: v.reduce((a, b) => a + b, 0),
    p50: pct(0.5), p95: pct(0.95), max: v[v.length - 1],
    sobre_2s: v.filter((x) => x > 2000).length,
  };
}`,
], [
  `  await adquirir();
  try {
    const res = await fetch(`,
  `  await adquirir();
  try {
    __stats.total++;                                          // BANCO
    const __clave = path.replace(/\\/\\d+/g, "/:id");           // BANCO
    __stats.porPath[__clave] = (__stats.porPath[__clave] ?? 0) + 1;
    // Una llamada es de RESPALDO cuando pide explicitamente el idioma de
    // fallback y ese no es el idioma base. En el camino del Home no hay otra
    // cosa que pida es-ES a mano (searchDeTipo pide es-MX y searchTitles en-US,
    // y ninguno de los dos corre aca).
    if (params.language === "es-ES" && IDIOMA_BASE !== "es-ES") {   // BANCO
      __stats.respaldo++;
      __stats.respaldoPorPath[__clave] = (__stats.respaldoPorPath[__clave] ?? 0) + 1;
    }
    const __t0 = Date.now();                                  // BANCO
    const res = await fetch(`,
], [
  `    if (!res.ok) throw new Error(`,
  `    __stats.msRed.push(Date.now() - __t0);                    // BANCO
    if (!res.ok) throw new Error(`,
]]);

// --- 2. Linea [BANCO] en /api/home ------------------------------------------
editar("app/api/home/route.ts", [[
  `import type { MediaType, PlatformCode } from "@/lib/types";`,
  `import type { MediaType, PlatformCode } from "@/lib/types";
import { __stats, __reset, __latencias } from "@/lib/tmdb";   // BANCO DE PRUEBAS`,
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
      respaldo_total: __stats.respaldo,
      respaldo_por_path: __stats.respaldoPorPath,
      latencia_tmdb: __latencias(),
      payload_bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
      hero: payload.hero.length,
      degradado: payload.degradado,
      fallos: payload.fallos,
      rieles: payload.rails.map((r) => \`\${r.key}=\${r.items.length}\`),
    }));
    return NextResponse.json(payload);`,
]]);

console.log("listo.");
