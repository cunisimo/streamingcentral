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
//
// Las excepciones son DOS y están justificadas en el código:
//
//   app/admin/resena/[id]/page.tsx  →  `app/admin` no viaja en el artefacto
//                                      nativo: el staging lo excluye.
//   components/RecordarButton.tsx   →  ahí `apiUrl` se aplica UNA vez al armar
//                                      `ics`, porque alimenta el fetch Y dos
//                                      navegaciones al mismo recurso.
const EXCEPCIONES = new Map([
  ["app/admin/resena/[id]/page.tsx", "app/admin no viaja en el artefacto nativo"],
  ["components/RecordarButton.tsx", "apiUrl se aplica al armar `ics`, en un solo lugar"],
]);

test("ningún fetch cliente a /api se salta apiUrl, salvo las excepciones", () => {
  const raiz = process.cwd();
  const infractores: string[] = [];
  const mirar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { mirar(full); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
      const rel = path.relative(raiz, full).split(path.sep).join("/");
      const src = fs.readFileSync(full, "utf8");
      for (const linea of src.split("\n")) {
        // Un fetch cuyo argumento arranca con la ruta literal /api/ y no pasa
        // por apiUrl.
        if (/fetch\(\s*[`"'"]\/api\//.test(linea) && !linea.includes("apiUrl")) {
          if (EXCEPCIONES.has(rel)) continue;
          infractores.push(`${rel}: ${linea.trim().slice(0, 70)}`);
        }
      }
    }
  };
  for (const d of ["app", "components", "hooks"]) mirar(path.join(raiz, d));
  assert.deepEqual(infractores, [], `fetch a /api sin apiUrl:\n${infractores.join("\n")}`);
});

test("las excepciones siguen existiendo: si desaparecen, sobra la exención", () => {
  for (const [archivo, motivo] of EXCEPCIONES) {
    assert.ok(fs.existsSync(path.join(process.cwd(), archivo)),
      `la excepción apunta a un archivo que ya no está: ${archivo} (${motivo})`);
  }
});
