// El cableado de la Etapa 3.b ("último bueno primero, reconstrucción en
// fondo"), fijado sobre el fuente (diseño §33). `lib/home.ts` es `server-only`
// y no se importa desde `node --test`: lo que se fija acá es que el adaptador
// use la API PÚBLICA de Vercel y nada más, que el fondo tenga sus contextos
// propios y su línea `[home-fondo]`, y que el kill switch exista.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8").replace(/\r/g, "");
const codigo = (rel: string) => leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

function archivosFuente(dirs: string[]): string[] {
  const out: string[] = [];
  const recorrer = (rel: string) => {
    for (const e of fs.readdirSync(path.join(raiz, rel), { withFileTypes: true })) {
      const hijo = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") recorrer(hijo); continue; }
      if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith(".d.ts")) out.push(hijo);
    }
  };
  for (const d of dirs) recorrer(d);
  return out.sort();
}

test("🔴 @vercel/functions está declarado en package.json con versión EXACTA (sin ^ ni ~) y presente en el lock", () => {
  const pkg = JSON.parse(leer("package.json"));
  const v = pkg.dependencies?.["@vercel/functions"];
  assert.ok(v, "falta @vercel/functions en dependencies");
  assert.match(v, /^\d+\.\d+\.\d+$/, `versión no exacta: ${v}`);
  const lock = JSON.parse(leer("package-lock.json"));
  assert.equal(lock.packages?.["node_modules/@vercel/functions"]?.version, v, "el lock no fija la misma versión");
});

test("🔴 `waitUntil` se importa SÓLO desde @vercel/functions y SÓLO en el adaptador del Home (lib/home.ts)", () => {
  const conImport = archivosFuente(["lib", "app", "components", "hooks"]).filter((f) => /from\s+["']@vercel\/functions["']/.test(codigo(f)));
  assert.deepEqual(conImport, ["lib/home.ts"], "el paquete se importa en otro lugar");
  assert.match(codigo("lib/home.ts"), /import \{ waitUntil \} from "@vercel\/functions"/);
});

test("🔴 el símbolo interno del runtime (@vercel/request-context) NO aparece en código productivo", () => {
  for (const f of archivosFuente(["lib", "app", "components", "hooks"])) {
    assert.doesNotMatch(codigo(f), /@vercel\/request-context/, `${f} usa el símbolo interno`);
  }
});

test("🔴 el adaptador comprueba kill switch y disponibilidad ANTES de registrar, y pasa `programarEnFondo` a servirConTurno", () => {
  const s = codigo("lib/home.ts");
  const f = codigo("lib/home-fondo.ts");
  assert.match(f, /HOME_UB_PRIMERO/, "falta el kill switch");
  assert.match(f, /env\.VERCEL === "1"/, "la disponibilidad se decide por la variable pública VERCEL");
  assert.match(s, /estadoDelFondo\(process\.env\)/, "el adaptador no lee el entorno por estadoDelFondo");
  assert.match(s, /programarEnFondo/, "servirConTurno no recibe programarEnFondo");
  assert.match(s, /crearProgramadorDeFondo\(/, "el registro perezoso vive en lib/home-fondo.ts");
});

test("🔴 el fondo abre sus PROPIOS contextos (idioma, métricas, ejes, señal) y termina en una línea [home-fondo]", () => {
  const s = codigo("lib/home.ts");
  const i = s.indexOf("crearProgramadorDeFondo(");
  assert.ok(i >= 0);
  const tramo = s.slice(i, i + 3000);
  for (const ctx of ["withMetricasIdioma(", "withMetricas(", "conRegistroDeEjes(", "conSenal("]) assert.ok(tramo.includes(ctx), `el fondo no abre ${ctx}`);
  assert.match(tramo, /\[home-fondo\]/, "falta la línea terminal [home-fondo]");
});

test("🔴 la FRONTERA: la ruta envuelve el handler ENTERO con conFrontera (conCors incluido) y el adaptador espera compuertaDeFondo", () => {
  const ruta = codigo("app/api/home/route.ts");
  assert.match(ruta, /import \{ conFrontera \} from "@\/lib\/fondo-frontera"/);
  assert.match(ruta, /export const GET = conFrontera\(conCors\(manejar, "GET"\)\);/, "GET tiene que ser conFrontera(conCors(...)): la compuerta se abre con la respuesta construida, cabeceras incluidas");
  const home = codigo("lib/home.ts");
  assert.match(home, /import \{ compuertaDeFondo \} from "\.\/fondo-frontera"/);
  assert.match(home, /compuerta: compuertaDeFondo/, "el programador tiene que esperar la compuerta de la solicitud");
  const fondo = codigo("lib/home-fondo.ts");
  assert.doesNotMatch(fondo, /await Promise\.resolve\(\)/, "ni un microtick: la frontera es la compuerta");
  assert.match(fondo, /await compuerta;/);
});

test("🔴 lib/home-fondo.ts es puro: no importa server-only, next ni @vercel/functions (el waitUntil se inyecta)", () => {
  const s = codigo("lib/home-fondo.ts");
  assert.doesNotMatch(s, /server-only|from "next|@vercel\/functions/);
  assert.match(s, /export function crearProgramadorDeFondo/);
});

test("🔴 el kill switch está documentado: aplicar HOME_UB_PRIMERO en Vercel requiere un nuevo deployment", () => {
  assert.match(leer("lib/home-fondo.ts"), /deployment/i);
  assert.match(leer("CLAUDE.md"), /HOME_UB_PRIMERO/);
});
