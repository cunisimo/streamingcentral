// El resolvedor de arranque del contenedor, y su inyección en el artefacto.
//
// Se ejercita el resolvedor REAL (`scripts/rutas-nativas.mjs`), que es el mismo
// que termina embebido en el HTML por `toString()`. No hay una segunda copia
// que imite el resultado.
//
// Ver el encabezado de ese archivo para el porqué del mecanismo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { accionDeArranque, guionDeArranque, PAGINA_404 } from "../scripts/rutas-nativas.mjs";

const raiz = path.resolve(import.meta.dirname, "..");
const existe = (p: string) => fs.existsSync(path.join(raiz, p));

/** Las rutas tal como las saca del artefacto el build: con barra a los dos lados. */
const RUTAS = [
  "/404/", "/buscar/", "/categoria/accion/", "/cuenta/", "/cuenta/configuracion/",
  "/lista/ultimos/", "/onboarding/", "/p/", "/proximamente/", "/t/", "/top/",
];

const ir = (p: string, q = "", h = "") => accionDeArranque(p, q, h, RUTAS);

// ------------------------------------------------------- 1. el arranque normal

test("la raíz no hace nada", () => {
  assert.deepEqual(ir("/"), { tipo: "nada" });
  assert.deepEqual(ir(""), { tipo: "nada" });
  // Y con query tampoco: el Home ya llegó bien.
  assert.deepEqual(ir("/", "?x=1"), { tipo: "nada" });
});

// -------------------------------------------------------- 2. contrato mínimo

test("cada ruta del contrato salta a su propio index.html", () => {
  const esperado: Record<string, string> = {
    "/top/": "/top/index.html",
    "/buscar/": "/buscar/index.html",
    "/t/": "/t/index.html",
    "/p/": "/p/index.html",
    "/lista/ultimos/": "/lista/ultimos/index.html",
    "/cuenta/configuracion/": "/cuenta/configuracion/index.html",
  };
  for (const [ruta, destino] of Object.entries(esperado)) {
    assert.deepEqual(ir(ruta), { tipo: "ir", destino }, `falló ${ruta}`);
  }
});

test("anda igual sin la barra final", () => {
  assert.deepEqual(ir("/top"), { tipo: "ir", destino: "/top/index.html" });
  assert.deepEqual(ir("/lista/ultimos"), { tipo: "ir", destino: "/lista/ultimos/index.html" });
});

// ------------------------------------------------------- 3. query y hash

test("la query viaja entera", () => {
  assert.deepEqual(ir("/lista/ultimos/", "?tipo=tv"),
    { tipo: "ir", destino: "/lista/ultimos/index.html?tipo=tv" });
  assert.deepEqual(ir("/t/", "?tipo=movie&id=278"),
    { tipo: "ir", destino: "/t/index.html?tipo=movie&id=278" });
});

test("el hash también, y junto con la query", () => {
  assert.deepEqual(ir("/t/", "?tipo=movie&id=278", "#abajo"),
    { tipo: "ir", destino: "/t/index.html?tipo=movie&id=278#abajo" });
  assert.deepEqual(ir("/top/", "", "#seccion"),
    { tipo: "ir", destino: "/top/index.html#seccion" });
});

test("al limpiar la URL, query y hash vuelven completos", () => {
  assert.deepEqual(accionDeArranque("/t/index.html", "?tipo=movie&id=278", "#abajo", RUTAS),
    { tipo: "limpiar", url: "/t/?tipo=movie&id=278#abajo" });
  assert.deepEqual(accionDeArranque("/lista/ultimos/index.html", "?tipo=tv", "", RUTAS),
    { tipo: "limpiar", url: "/lista/ultimos/?tipo=tv" });
});

// ------------------------------------------------------------- 4. sin bucles

test("🔴 el documento recuperado NO vuelve a saltar", () => {
  // Es la regla que hace imposible el bucle: `…/index.html` es la marca de que
  // el salto ya ocurrió, y se atiende ANTES que cualquier otra cosa.
  const a = accionDeArranque("/top/index.html", "", "", RUTAS);
  assert.equal(a.tipo, "limpiar", "un segundo salto sería un bucle");
});

test("🔴 el 404 no rebota sobre sí mismo", () => {
  // `/404.html` tiene extensión y NO termina en `/index.html`, así que cae en la
  // regla de los archivos reales. Si cayera en la del final, se llamaría a sí
  // mismo para siempre.
  assert.deepEqual(ir(PAGINA_404), { tipo: "nada" });
  assert.deepEqual(ir("/404.html", "?x=1"), { tipo: "nada" });
});

test("la ruta /404/ del export sí se recupera, y no es lo mismo", () => {
  // Next exporta las dos: `/404.html` (el documento) y `/404/index.html` (la
  // ruta). Sólo la segunda es una ruta.
  assert.deepEqual(ir("/404/"), { tipo: "ir", destino: "/404/index.html" });
});

test("aplicar la acción dos veces converge", () => {
  // Simulación del ciclo completo: saltar y después limpiar. La segunda acción
  // no puede volver a ser un salto.
  const primera = ir("/top/", "?a=1", "#b");
  assert.equal(primera.tipo, "ir");
  const url = new URL("https://localhost" + (primera as { destino: string }).destino);
  const segunda = accionDeArranque(url.pathname, url.search, url.hash, RUTAS);
  assert.deepEqual(segunda, { tipo: "limpiar", url: "/top/?a=1#b" });
  // Y desde ahí, nada más.
  const tercera = accionDeArranque("/top/", "?a=1", "#b", RUTAS);
  assert.equal(tercera.tipo, "ir", "vuelve a saltar, que es lo correcto en un arranque nuevo");
});

// ------------------------------------------------------ 5. rutas inexistentes

test("una ruta desconocida va al 404 local, no al Home", () => {
  assert.deepEqual(ir("/no-existe-nada"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/no-existe-nada/"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/lista/"), { tipo: "ir", destino: PAGINA_404 }, "/lista/ no tiene index propio");
  assert.deepEqual(ir("/cuenta/configuracion/mas/"), { tipo: "ir", destino: PAGINA_404 });
});

// -------------------------------------------------------- 6. archivos reales

test("los archivos estáticos no se tocan", () => {
  for (const f of [
    "/_next/static/chunks/main-abc.js",
    "/_next/static/css/23f.css",
    "/favicon.ico",
    "/brand/yump-wordmark-black.png",
    "/splash/splash-375x667@2x.png",
    "/top/index.txt",
  ]) {
    assert.deepEqual(ir(f), { tipo: "nada" }, `se tocó ${f}`);
  }
});

// ------------------------------------------------------------- 7. traversal

test("traversal simple se rechaza", () => {
  assert.deepEqual(ir("/../secreto"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/top/../../secreto"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/.."), { tipo: "ir", destino: PAGINA_404 });
});

test("🔴 traversal hacia un archivo con extensión se rechaza", () => {
  // EL CASO PELIGROSO: la regla de los archivos reales deja pasar la ruta tal
  // cual, así que el rechazo tiene que ir ANTES o se serviría algo de fuera del
  // artefacto.
  assert.deepEqual(ir("/../../data/data/ar.yump.app/x.xml"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/top/../../x.js"), { tipo: "ir", destino: PAGINA_404 });
});

test("traversal codificado se rechaza", () => {
  // Un `%` que sobrevive significa doble codificación. Nunca se decodifica.
  assert.deepEqual(ir("/%2e%2e/secreto"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/%2e%2e%2fx.js"), { tipo: "ir", destino: PAGINA_404 });
});

test("barras invertidas y segmento punto se rechazan", () => {
  assert.deepEqual(ir("\\..\\secreto"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/top\\..\\x.js"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/top/./index.html"), { tipo: "ir", destino: PAGINA_404 });
});

test("una ruta que no está en la lista no se reescribe aunque se parezca", () => {
  assert.deepEqual(ir("/topp/"), { tipo: "ir", destino: PAGINA_404 });
  assert.deepEqual(ir("/TOP/"), { tipo: "ir", destino: PAGINA_404 }, "la lista distingue mayúsculas");
});

// -------------------------------------------------- 8. el guion que se inyecta

test("el guion embebe las funciones reales, no una copia", () => {
  const g = guionDeArranque(RUTAS);
  // Si alguien reescribiera la lógica a mano en una cadena, estos nombres no
  // estarían: salen de `Function.prototype.toString()`.
  assert.match(g, /function accionDeArranque\(/);
  assert.match(g, /function esPeligrosa\(/);
  assert.match(g, /function tieneExtension\(/);
  assert.match(g, /location\.replace\(a\.destino\)/);
  assert.match(g, /history\.replaceState\(null,"",a\.url\)/);
});

test("el guion es JavaScript válido y se comporta igual que el módulo", () => {
  // Se ejecuta el guion de verdad, con un `location`/`history` de mentira, y se
  // compara contra el resolvedor. Si el serializado se rompiera, esto falla.
  const g = guionDeArranque(RUTAS);
  const casos: [string, string, string][] = [
    ["/top/", "?a=1", "#b"],
    ["/top/index.html", "?a=1", "#b"],
    ["/", "", ""],
    ["/no-existe", "", ""],
    ["/favicon.ico", "", ""],
    ["/../x.js", "", ""],
  ];
  for (const [p, q, h] of casos) {
    const hechos: string[] = [];
    const sandbox = {
      location: {
        pathname: p, search: q, hash: h,
        replace: (u: string) => hechos.push("replace:" + u),
      },
      history: { replaceState: (_a: unknown, _b: string, u: string) => hechos.push("state:" + u) },
    };
    new Function("location", "history", g)(sandbox.location, sandbox.history);

    const a = accionDeArranque(p, q, h, RUTAS);
    const esperado =
      a.tipo === "ir" ? ["replace:" + a.destino] :
      a.tipo === "limpiar" ? ["state:" + a.url] : [];
    assert.deepEqual(hechos, esperado, `el guion difiere del módulo en ${p}${q}${h}`);
  }
});

test("el guion no lanza si algo falla", () => {
  // Va en el `<head>` y corre antes que nada: una excepción acá dejaría la app
  // sin arrancar. Por eso está envuelto en try/catch.
  const g = guionDeArranque(RUTAS);
  assert.match(g, /try\{/);
  assert.match(g, /catch\(e\)\{\}/);
  assert.doesNotThrow(() => {
    new Function("location", "history", g)({}, {});
  }, "el guion explota con un entorno raro");
});

// --------------------------------------------- 9. el artefacto ya inyectado

const HAY_NATIVO = existe("out-capacitor/index.html");

function htmls(dir: string): string[] {
  const abs = path.join(raiz, dir);
  const salida: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true, recursive: true }) as fs.Dirent[]) {
    if (e.isFile() && e.name.endsWith(".html")) salida.push(path.join(e.parentPath!, e.name));
  }
  return salida;
}

test("TODOS los html del artefacto nativo llevan el guion", { skip: !HAY_NATIVO }, () => {
  // El raíz lo necesita para saltar y cada ruta para limpiar la URL: si faltara
  // en uno solo, esa ruta quedaría con `/index.html` a la vista.
  const sin = htmls("out-capacitor")
    .filter((f) => !fs.readFileSync(f, "utf8").includes("accionDeArranque"))
    .map((f) => path.relative(raiz, f));
  assert.deepEqual(sin, [], `sin guion de arranque: ${sin.join(", ")}`);
});

test("la lista del guion es la del artefacto, no una escrita a mano", { skip: !HAY_NATIVO }, () => {
  // Se recalcula desde el artefacto y se compara con la que quedó embebida.
  const dirs = new Set<string>();
  for (const f of htmls("out-capacitor")) {
    if (path.basename(f) !== "index.html") continue;
    const rel = path.relative(path.join(raiz, "out-capacitor"), path.dirname(f)).split(path.sep).join("/");
    if (rel) dirs.add("/" + rel + "/");
  }
  const esperada = JSON.stringify([...dirs].sort());
  const html = fs.readFileSync(path.join(raiz, "out-capacitor/index.html"), "utf8");
  assert.ok(html.includes(esperada),
    `la lista embebida no coincide con el artefacto.\nesperada: ${esperada}`);
});

test("el guion va ANTES de cualquier script de Next", { skip: !HAY_NATIVO }, () => {
  // Si corriera después, Next ya habría empezado a hidratar el Home.
  const html = fs.readFileSync(path.join(raiz, "out-capacitor/index.html"), "utf8");
  const iGuion = html.indexOf("accionDeArranque");
  const iNext = html.indexOf("/_next/");
  assert.ok(iGuion >= 0 && iNext >= 0);
  assert.ok(iGuion < iNext, "el guion quedó después de los recursos de Next");
});

const HAY_WEB = existe(".next/server/app/index.html");

test("🔴 la web NO lleva el guion", { skip: !HAY_WEB }, () => {
  // Lo inyecta el build nativo sobre el artefacto ya exportado, así que no pasa
  // por ningún bundle ni por `app/layout.tsx`. Esto lo comprueba.
  const sucios = htmls(".next/server/app")
    .filter((f) => fs.readFileSync(f, "utf8").includes("accionDeArranque"))
    .map((f) => path.relative(raiz, f));
  assert.deepEqual(sucios, [], `el guion se filtró a la web: ${sucios.join(", ")}`);
});
