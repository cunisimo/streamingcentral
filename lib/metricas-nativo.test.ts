// Vercel Analytics y Speed Insights se apagan SÓLO en el build nativo.
//
// ============================================================================
// POR QUÉ SE APAGAN, Y POR QUÉ SÓLO EN NATIVO
// ============================================================================
// Medido en el teléfono el 2026-09-06, sobre el contenedor con `ar.yump.app`:
// las dos librerías piden su script al ORIGEN LOCAL (`https://localhost`), que
// no lo tiene, y el servidor de Capacitor devuelve **404** con **0 bytes**.
//
//   /_vercel/insights/script.js        404, 0 B
//   /_vercel/speed-insights/script.js  404, 0 B
//
// Dos pedidos por arranque de documento y ninguno más — una ventana completa de
// navegación SPA no produjo ninguno. Y como el script nunca carga, el beacon
// `/_vercel/insights/view` **nunca se dispara**: en Android estas dos librerías
// no miden absolutamente nada. Lo único que dejan son dos errores de consola.
//
// 🔴 EN LA WEB NO CAMBIA NADA. Ahí los scripts los sirve Vercel desde el mismo
// origen, las dos librerías funcionan y son la única medición de uso real que
// tiene el proyecto. Apagarlas en los dos lados sería tirar la métrica de la web
// para arreglar un 404 de Android.
//
// ============================================================================
// 🔴 LA BANDERA ES `ES_NATIVO`, QUE SE RESUELVE EN BUILD
// ============================================================================
// No se usa `Capacitor.isNativePlatform()` ni el user-agent. `ES_NATIVO` sale de
// una variable que Next inlinea, así que el prerender y el cliente coinciden
// desde el primer render: en el artefacto nativo el `<script>` de Analytics
// directamente NO EXISTE, en vez de existir y desmontarse al hidratar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const existe = (p: string) => fs.existsSync(path.join(raiz, p));

/** El código de un archivo sin comentarios: los guards no pueden matchear su propia explicación. */
function sinComentarios(p: string): string {
  return leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Todos los archivos de un directorio, recursivo. */
function archivos(dir: string): string[] {
  const abs = path.join(raiz, dir);
  if (!fs.existsSync(abs)) return [];
  const salida: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true, recursive: true }) as fs.Dirent[]) {
    if (e.isFile()) salida.push(path.join(e.parentPath ?? abs, e.name));
  }
  return salida;
}

// ------------------------------------------------------- 1. cómo está cableado

test("las dos métricas están gateadas por ES_NATIVO en el layout", () => {
  const src = sinComentarios("app/layout.tsx");
  assert.match(src, /ES_NATIVO/, "el layout no importa la bandera de build");
  // Las dos tienen que estar del lado negado de la bandera, y en el MISMO bloque:
  // separarlas dejaría una montada.
  const m = /\{!ES_NATIVO && \(([\s\S]{0,200}?)\)\}/.exec(src);
  assert.ok(m, "no hay un bloque `{!ES_NATIVO && (…)}` en el layout");
  for (const comp of ["Analytics", "SpeedInsights"]) {
    assert.match(m![1], new RegExp(`<${comp}\\s*/>`), `<${comp} /> no quedó detrás de !ES_NATIVO`);
  }
  // Y ninguna puede quedar montada fuera de ese bloque.
  const fuera = src.replace(m![0], "");
  assert.doesNotMatch(fuera, /<(Analytics|SpeedInsights)\s*\/>/,
    "quedó una métrica montada fuera del gate");
});

test("no se agregó detección dinámica ni otro servicio de métricas", () => {
  const src = sinComentarios("app/layout.tsx");
  assert.doesNotMatch(src, /isNativePlatform|navigator\.userAgent|userAgent/,
    "el gate tiene que ser la bandera de build, no una detección en runtime");
  // Un servicio nuevo entraría como import: la lista de métricas no cambia.
  const metricas = [...src.matchAll(/from "([^"]*(?:analytics|insights|posthog|plausible|umami|ga4|gtag)[^"]*)"/gi)]
    .map((m) => m[1]).sort();
  assert.deepEqual(metricas, ["@vercel/analytics/next", "@vercel/speed-insights/next"],
    `cambió el juego de librerías de métricas: ${metricas.join(", ")}`);
});

// --------------------------------------------- 2. el artefacto NATIVO generado

const HAY_NATIVO = existe("out-capacitor/index.html");

test("el HTML nativo no monta ninguna de las dos", { skip: !HAY_NATIVO }, () => {
  // ⚠️ NO SE COMPRUEBA QUE LAS LIBRERÍAS NO ESTÉN EN EL BUNDLE, y no es
  // conformismo: no se puede con este gate. Son componentes de CLIENTE
  // importados por un layout de SERVIDOR, así que Next mete su implementación en
  // el chunk por el solo hecho de estar importadas. Medido dos veces: con el
  // gate en el layout, el chunk del layout salió byte a byte idéntico al de
  // antes del cambio; y moviéndolo a un componente de cliente con el mismo corte
  // adentro, el resultado fue el mismo. Afirmar acá que desaparecen sería
  // afirmar algo falso.
  //
  // Lo que SÍ se comprueba —y es lo que importa— es que no se montan: el HTML
  // que se sirve no las trae, así que ningún script se pide y no hay 404.
  // La prueba definitiva es la del teléfono, donde se cuentan los pedidos.
  const html = leer("out-capacitor/index.html");
  for (const s of ["/_vercel/insights/script.js", "/_vercel/speed-insights/script.js", "va.vercel-scripts.com"]) {
    assert.ok(!html.includes(s), `el HTML nativo trae ${s}`);
  }
});

// ------------------------------------------------ 3. la WEB no perdió su métrica

const HAY_WEB = existe(".next/static");

test("el bundle de la web SIGUE trayendo las dos métricas", { skip: !HAY_WEB }, () => {
  // Es el CONTROL del cambio: si este test pasa a fallar, el gate se comió la
  // medición de la web, que es justo lo que no se quiere.
  //
  // ⚠️ Se mira el BUNDLE, no el HTML prerenderizado. Las dos librerías insertan
  // su `<script>` desde el cliente al montarse, así que en el HTML servido no
  // aparecen NUNCA —ni antes ni después de este cambio— y buscarlas ahí daba un
  // rojo que no significaba nada.
  const chunks = archivos(".next/static").filter((f) => f.endsWith(".js"));
  assert.ok(chunks.length > 0, "no hay build web para controlar");
  for (const s of ["/_vercel/insights/script.js", "/_vercel/speed-insights/script.js"]) {
    const hay = chunks.some((f) => fs.readFileSync(f, "utf8").includes(s));
    assert.ok(hay, `la web dejó de pedir ${s}`);
  }
});
