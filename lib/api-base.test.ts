// La base de las llamadas a la API.
//
// El contrato en una línea: en la WEB no pasa nada —las llamadas siguen siendo
// relativas— y en el build NATIVO las rutas `/api/...` se vuelven absolutas
// contra una base configurada explícitamente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { apiUrl, API_BASE } from "./api-base.ts";
import { SITIO_PUBLICO } from "./compartir.ts";

const BASE = "https://api-base.invalid";

// ============================================================================
// Web: no cambia nada
// ============================================================================

test("web: /api/home queda /api/home", () => {
  assert.equal(API_BASE, "");
  assert.equal(apiUrl("/api/home"), "/api/home");
});

test("web: tampoco toca las que llevan query", () => {
  assert.equal(apiUrl("/api/search?q=coco&providers=n,d"), "/api/search?q=coco&providers=n,d");
});

// ============================================================================
// Nativo: absolutas contra la base
// ============================================================================

test("nativo: /api/home usa la base configurada", () => {
  assert.equal(apiUrl("/api/home", BASE), `${BASE}/api/home`);
});

test("nativo: conserva la query entera, sin reordenar ni recodificar", () => {
  assert.equal(
    apiUrl("/api/search?q=el%20padrino&providers=n,d&page=2", BASE),
    `${BASE}/api/search?q=el%20padrino&providers=n,d&page=2`,
  );
});

test("nativo: conserva el fragmento", () => {
  assert.equal(apiUrl("/api/home#seccion", BASE), `${BASE}/api/home#seccion`);
  assert.equal(apiUrl("/api/home?a=1#seccion", BASE), `${BASE}/api/home?a=1#seccion`);
});

test("nativo: no produce barras dobles, con o sin barra final en la base", () => {
  for (const b of [BASE, `${BASE}/`, `${BASE}//`]) {
    const u = apiUrl("/api/home", b);
    assert.equal(u, `${BASE}/api/home`);
    assert.doesNotMatch(u.slice("https://".length), /\/\//, `barra doble en ${u}`);
  }
});

// ============================================================================
// Lo que NO tiene que tocar
// ============================================================================

test("una URL externa no se modifica", () => {
  for (const externa of [
    "https://image.tmdb.org/t/p/w500/x.jpg",
    "https://ejemplo.supabase.co/rest/v1/perfil",
    "https://www.youtube-nocookie.com/embed/abc",
    "http://otro.example/api/home",          // absoluta, aunque tenga /api/
  ]) {
    assert.equal(apiUrl(externa, BASE), externa);
  }
});

test("una ruta interna que NO es /api/ no se modifica", () => {
  for (const interna of ["/titulo/movie/278", "/t/?tipo=movie&id=278", "/avatars/x.webp", "/", "/apilado"]) {
    assert.equal(apiUrl(interna, BASE), interna);
  }
});

test("la cadena vacía se devuelve tal cual: useApi la usa como 'no pidas nada'", () => {
  assert.equal(apiUrl("", BASE), "");
});

// ============================================================================
// GUARD: compartir no se toca
// ============================================================================

test("SITIO_PUBLICO sigue siendo https://app.yump.ar", () => {
  assert.equal(SITIO_PUBLICO, "https://app.yump.ar");
});

// ============================================================================
// Procesos aislados: el módulo se evalúa distinto según la bandera
// ============================================================================

function enProceso(env: Record<string, string>) {
  const code =
    "import {API_BASE, apiUrl} from './lib/api-base.ts';" +
    "console.log(JSON.stringify({API_BASE, home: apiUrl('/api/home')}));";
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, NEXT_PUBLIC_YUMP_NATIVO: "", NEXT_PUBLIC_YUMP_API_BASE: "", ...env },
  });
}

test("build WEB: funciona SIN la variable", () => {
  const r = enProceso({});
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { API_BASE: "", home: "/api/home" });
});

test("build NATIVO: usa la base y la aplica", () => {
  const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1", NEXT_PUBLIC_YUMP_API_BASE: BASE });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { API_BASE: BASE, home: `${BASE}/api/home` });
});

test("build NATIVO sin la variable: FALLA, y el mensaje dice qué falta", () => {
  const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1" });
  assert.notEqual(r.status, 0, "tendría que haber fallado");
  assert.match(r.stderr, /NEXT_PUBLIC_YUMP_API_BASE/);
});

test("build NATIVO con base inválida: FALLA", () => {
  for (const mala of ["no-es-una-url", "ftp://x.invalid", "/api", "app.yump.ar", "https://"]) {
    const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1", NEXT_PUBLIC_YUMP_API_BASE: mala });
    assert.notEqual(r.status, 0, `aceptó una base inválida: ${mala}`);
    assert.match(r.stderr, /NEXT_PUBLIC_YUMP_API_BASE/);
  }
});

// ============================================================================
// La base nativa tiene que ser HTTPS
// ============================================================================
//
// El contenedor Android sirve la cáscara desde `https://localhost`. Una llamada
// desde ese contexto hacia una API `http://` es CONTENIDO MIXTO y el WebView la
// bloquea. Aceptar `http` produciría un binario que pasa el build y no sirve
// para nada en ejecución, que es el peor de los errores posibles: se descubre
// en el teléfono.

test("build NATIVO rechaza http://, aunque sea el dominio real", () => {
  const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1", NEXT_PUBLIC_YUMP_API_BASE: "http://app.yump.ar" });
  assert.notEqual(r.status, 0, "aceptó http://app.yump.ar");
  assert.match(r.stderr, /NEXT_PUBLIC_YUMP_API_BASE/);
  assert.match(r.stderr, /HTTPS/i, "el mensaje tiene que decir HTTPS");
});

test("build NATIVO rechaza http://localhost:3000, el caso de desarrollo", () => {
  const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1", NEXT_PUBLIC_YUMP_API_BASE: "http://localhost:3000" });
  assert.notEqual(r.status, 0, "aceptó http://localhost:3000");
  assert.match(r.stderr, /NEXT_PUBLIC_YUMP_API_BASE/);
});

test("build NATIVO acepta https://api-base.invalid", () => {
  const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1", NEXT_PUBLIC_YUMP_API_BASE: "https://api-base.invalid" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).API_BASE, "https://api-base.invalid");
});

test("el mensaje de rechazo NO imprime el valor recibido", () => {
  const r = enProceso({
    NEXT_PUBLIC_YUMP_NATIVO: "1",
    NEXT_PUBLIC_YUMP_API_BASE: "http://valor-que-no-debe-aparecer.invalid",
  });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /valor-que-no-debe-aparecer/);
});

test("lo prohibido es http como BASE, no recibir una URL http como argumento", () => {
  // `apiUrl` no valida: sólo decide si prefija. Una URL externa http se
  // devuelve intacta, porque no empieza con `/api/`.
  assert.equal(apiUrl("http://otro.example/api/home", BASE), "http://otro.example/api/home");
  assert.equal(apiUrl("http://cualquier.cosa/x.jpg", BASE), "http://cualquier.cosa/x.jpg");
});

test("los procesos no se contaminan, en los dos órdenes", () => {
  const nativo = () => JSON.parse(
    enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1", NEXT_PUBLIC_YUMP_API_BASE: BASE }).stdout).API_BASE;
  const web = () => JSON.parse(enProceso({}).stdout).API_BASE;
  assert.equal(nativo(), BASE);
  assert.equal(web(), "");
  assert.equal(nativo(), BASE);
  assert.equal(web(), "");
});

// ============================================================================
// NO reutiliza NEXT_PUBLIC_SITE_URL
// ============================================================================

test("ignora NEXT_PUBLIC_SITE_URL: son variables con propósitos distintos", () => {
  const r = enProceso({
    NEXT_PUBLIC_YUMP_NATIVO: "1",
    NEXT_PUBLIC_YUMP_API_BASE: BASE,
    NEXT_PUBLIC_SITE_URL: "https://otra-cosa.invalid",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).API_BASE, BASE);
});

// ============================================================================
// GUARD: ninguna llamada cliente a /api puede saltarse el contrato
// ============================================================================

// ⚠️ Comprobación sobre el TEXTO de los archivos, no sobre la app montada:
// este proyecto no tiene arnés de DOM (misma nota que `lib/legal.test.ts`).
// Fija la regresión real: que alguien agregue un `fetch("/api/…")` nuevo y el
// contenedor lo pida contra el bundle local, que no tiene `/api`.

/**
 * ¿Hay en `src` un `fetch(` cuyo primer argumento sea la ruta LITERAL `/api/…`
 * sin pasar por `apiUrl`?
 *
 * ⚠️ NO se analiza línea por línea, y no es un detalle: `fetch(` y la ruta
 * pueden quedar en renglones distintos por el formateo, y un barrido por línea
 * daría un falso negativo justo con el caso que más importa —una llamada nueva
 * mal escrita—. Se normalizan los espacios de todo el archivo y se busca sobre
 * el texto entero.
 */
export function llamadasDirectasSinAdaptar(src: string): string[] {
  const plano = src.replace(/\s+/g, " ");
  const re = /fetch\(\s*(["'`])\/api\//g;
  const hits: string[] = [];
  for (const m of plano.matchAll(re)) {
    const desde = Math.max(0, m.index - 12);
    hits.push(plano.slice(desde, m.index + 60).trim());
  }
  return hits;
}

// Las excepciones REALES son UNA. `RecordarButton` NO es excepción: cumple el
// contrato, porque aplica `apiUrl` una sola vez al armar `ics`. Exceptuar todo
// ese archivo permitiría meterle después un `fetch("/api/…")` mal escrito sin
// que el guard lo viera.
const EXCEPCIONES = new Map([
  ["app/admin/resena/[id]/page.tsx", {
    motivo: "app/admin NO viaja en el artefacto nativo: el staging lo excluye",
    // Lo que justifica la exención tiene que SEGUIR EXISTIENDO. Si esa llamada
    // desaparece o pasa por apiUrl, la exención queda huérfana y hay que
    // sacarla: no alcanza con que el archivo exista.
    debeContener: "/api/admin-search",
  }],
  // Llegó con el Top manual, después de CP4, y entra por el MISMO motivo que la
  // de arriba: es una pantalla de `app/admin`. No es una excepción nueva de
  // criterio, es el mismo criterio aplicado a un archivo nuevo.
  ["app/admin/top/page.tsx", {
    motivo: "app/admin NO viaja en el artefacto nativo: el staging lo excluye",
    debeContener: "/api/admin/top",
  }],
]);

// ---------------------------------------------------------------- canarios
// El guard tiene que detectar lo malo Y no marcar lo bueno. Sin esto, un
// detector roto pasaría todos los días sin que nadie se entere.

test("CANARIO: detecta fetch directo en una línea", () => {
  assert.equal(llamadasDirectasSinAdaptar('fetch("/api/x")').length, 1);
});

test("CANARIO: detecta fetch directo partido en varias líneas", () => {
  assert.equal(llamadasDirectasSinAdaptar('fetch(\n  "/api/x"\n)').length, 1);
});

test("CANARIO: detecta template literal partido en varias líneas", () => {
  assert.equal(llamadasDirectasSinAdaptar("fetch(\n  `/api/x?q=1`\n)").length, 1);
});

test("CANARIO: NO marca fetch(apiUrl(...))", () => {
  assert.deepEqual(llamadasDirectasSinAdaptar('fetch(apiUrl("/api/x"))'), []);
  assert.deepEqual(llamadasDirectasSinAdaptar('fetch(\n  apiUrl("/api/x")\n)'), []);
});

test("CANARIO: NO marca fetch de una variable ya adaptada", () => {
  assert.deepEqual(llamadasDirectasSinAdaptar("const ics = apiUrl(icsUrl(a, b)); await fetch(ics);"), []);
  assert.deepEqual(llamadasDirectasSinAdaptar("fetch(url)"), []);
});

// ---------------------------------------------------------------- el barrido

test("ningún fetch cliente a /api se salta apiUrl, salvo la excepción", () => {
  const raiz = process.cwd();
  const infractores: string[] = [];
  const mirar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { mirar(full); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
      const rel = path.relative(raiz, full).split(path.sep).join("/");
      if (EXCEPCIONES.has(rel)) continue;
      for (const hit of llamadasDirectasSinAdaptar(fs.readFileSync(full, "utf8"))) {
        infractores.push(`${rel}: …${hit}`);
      }
    }
  };
  for (const d of ["app", "components", "hooks"]) mirar(path.join(raiz, d));
  assert.deepEqual(infractores, [], `fetch a /api sin apiUrl:\n${infractores.join("\n")}`);
});

test("RecordarButton NO es excepción, y aun así el guard lo aprueba", () => {
  // Cumple el contrato de verdad: `apiUrl` se aplica al armar `ics`.
  const src = fs.readFileSync(path.join(process.cwd(), "components/RecordarButton.tsx"), "utf8");
  assert.ok(!EXCEPCIONES.has("components/RecordarButton.tsx"), "no debe estar exceptuado");
  assert.deepEqual(llamadasDirectasSinAdaptar(src), []);
  assert.match(src, /apiUrl\(icsUrl\(/, "perdió la aplicación de apiUrl al armar `ics`");
});

test("cada excepción sigue conteniendo lo que la justifica", () => {
  for (const [archivo, { motivo, debeContener }] of EXCEPCIONES) {
    const full = path.join(process.cwd(), archivo);
    assert.ok(fs.existsSync(full), `la excepción apunta a un archivo que ya no está: ${archivo}`);
    const src = fs.readFileSync(full, "utf8");
    assert.ok(src.includes(debeContener),
      `${archivo} ya no contiene "${debeContener}": la exención quedó huérfana (${motivo})`);
    assert.ok(llamadasDirectasSinAdaptar(src).length > 0,
      `${archivo} ya no tiene una llamada directa: la exención sobra y hay que sacarla (${motivo})`);
  }
});
