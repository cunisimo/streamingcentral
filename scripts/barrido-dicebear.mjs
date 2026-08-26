// Barrido: que no quede NADA de DiceBear en código ejecutable ni en lo que se
// sirve al navegador.
//
// Se usa desde dos lados y por eso el escáner vive acá y no adentro del test:
//
//   node scripts/barrido-dicebear.mjs        → barrido completo, incluye .next
//   lib/sin-dicebear.test.ts                 → importa `barrer` y corre en `npm test`
//
// La diferencia es el bundle: `.next` sólo existe después de `npm run build`, y
// un test que dependa de eso falla en un checkout limpio. El test cubre fuente y
// archivos públicos; el script agrega los bundles generados.
//
// QUÉ SE EXCLUYE, Y POR QUÉ CADA COSA:
//
//   docs/                    la historia. Explica por qué existe el mapeo legado;
//                            borrarla sería perder la única razón escrita.
//   líneas de comentario     un comentario no abre una conexión. Se saltean las
//                            que EMPIEZAN con //, * o /* — nunca se corta a mitad
//                            de línea, porque `https://api.dicebear.com` contiene
//                            `//` y recortar ahí sería un falso negativo.
//   *.test.ts                los tests del mapeo legado NECESITAN la cadena
//                            "adventurer-neutral" para probar que un perfil viejo
//                            resuelve bien. No se despachan al navegador.
//   este mismo archivo       define los patrones.
import fs from "node:fs";
import path from "node:path";

/** Lo que no puede aparecer. */
export const PROHIBIDO = [/api\.dicebear\.com/i, /adventurer-neutral/i, /@dicebear\//i];

const EXTENSIONES = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html"]);

// Carpetas que nunca se miran: dependencias, git y la documentación histórica.
const SALTAR = new Set(["node_modules", ".git", "docs", "avatares"]);

// Los tests y el propio escáner quedan fuera; ver el encabezado.
const exento = (p) => /\.test\.(ts|tsx|mjs|js)$/.test(p) || p.endsWith("barrido-dicebear.mjs");

// Una línea que ARRANCA con marca de comentario no ejecuta nada.
const esComentario = (l) => {
  const t = l.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("--");
};

function* archivos(dir) {
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    if (SALTAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* archivos(p);
    else if (EXTENSIONES.has(path.extname(e.name)) && !exento(p)) yield p;
  }
}

/**
 * Recorre las raíces y devuelve los hallazgos: `{ archivo, linea, texto }`.
 * Vacío = limpio.
 */
export function barrer(raices, base = process.cwd()) {
  const hallazgos = [];
  for (const raiz of raices) {
    const abs = path.isAbsolute(raiz) ? raiz : path.join(base, raiz);
    // Una raíz puede ser un archivo suelto (public/sw.js).
    const lista = fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? (exento(abs) ? [] : [abs])
      : [...archivos(abs)];
    for (const f of lista) {
      const lineas = fs.readFileSync(f, "utf8").split(/\r?\n/);
      lineas.forEach((linea, i) => {
        if (esComentario(linea)) return;
        if (PROHIBIDO.some((re) => re.test(linea))) {
          hallazgos.push({ archivo: path.relative(base, f), linea: i + 1, texto: linea.trim().slice(0, 120) });
        }
      });
    }
  }
  return hallazgos;
}

/** Fuente y archivos públicos. Existen siempre, así que el test los usa. */
export const RAICES_FUENTE = ["lib", "components", "app", "hooks", "scripts", "supabase", "public"];

/** Lo anterior más los bundles. Sólo después de `npm run build`. */
export const RAICES_CON_BUNDLE = [...RAICES_FUENTE, ".next/static", ".next/server"];

// --- CLI ---------------------------------------------------------------------
// `argv[1]` puede no existir (por ejemplo con `node -e`), y este módulo se
// importa desde el test: sin la guarda, importarlo tiraba.
const esCli = Boolean(process.argv[1]) && import.meta.url.endsWith(
  process.argv[1].split(/[\/]/).pop(),
);
if (esCli) {
  const hayBuild = fs.existsSync(path.join(process.cwd(), ".next"));
  const raices = hayBuild ? RAICES_CON_BUNDLE : RAICES_FUENTE;
  console.log(`Barriendo ${raices.length} raíces${hayBuild ? " (incluye bundles de .next)" : " (sin .next: no hay build)"}…`);
  const hallazgos = barrer(raices);
  if (!hallazgos.length) {
    console.log("LIMPIO: cero rastros de DiceBear en código ejecutable ni en archivos servidos.");
  } else {
    console.error(`ENCONTRADOS ${hallazgos.length} rastros:`);
    for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  ${h.texto}`);
    // `exitCode` y no `exit()`: en Windows, salir con stdout en vuelo tumba a
    // libuv y el proceso muere con 127 en vez de comunicar el fallo.
    process.exitCode = 1;
  }
}
